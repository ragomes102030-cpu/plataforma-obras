import { and, eq } from "drizzle-orm";
import { invokeLlmGateway, type GatewayRequest, type LlmTool } from "../../llm-provider-gateway";
import { getDb } from "../../db";
import { projects, wbsNodes } from "../../../drizzle/schema";
import type { ArquimedesLlmProvider, ArquimedesLlmRequest } from "../core/types";

function tryParseJsonObject(candidate: string) {
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

export function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = tryParseJsonObject(trimmed);
  if (direct) return direct;

  const fencedMatches = Array.from(
    trimmed.matchAll(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/gi)
  );
  for (const match of fencedMatches) {
    const candidate = match[1]?.trim();
    if (candidate) {
      const parsed = tryParseJsonObject(candidate);
      if (parsed) return parsed;
    }
  }

  for (let start = 0; start < trimmed.length; start++) {
    if (trimmed[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index++) {
      const char = trimmed[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = trimmed.slice(start, index + 1);
          const parsed = tryParseJsonObject(candidate);
          if (parsed) return parsed;
          break;
        }
      }
    }
  }

  return null;
}

function unwrapStructuredJson(json: string) {
  let current = json;

  for (let depth = 0; depth < 3; depth++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(current);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (
      "nodes" in record ||
      "basis" in record ||
      "assumptions" in record ||
      "missingInformation" in record
    ) {
      return JSON.stringify(record);
    }

    const wrapperKeys = ["proposal", "result", "data", "output", "response"];
    const next = wrapperKeys
      .map(key => record[key])
      .find(
        value =>
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
      );

    if (!next) return null;
    current = JSON.stringify(next);
  }

  return null;
}

function normalizeStructuredJson(text: string) {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;
  return unwrapStructuredJson(candidate) ?? candidate;
}

function extractText(response: Awaited<ReturnType<typeof invokeLlmGateway>>): string | null {
  const message = response.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text)
      .join("\n");
    if (text.trim()) return text;
  }

  const reasoning = message?.reasoning ?? message?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) {
    return reasoning;
  }

  if (message?.tool_calls?.length) {
    return null;
  }

  return null;
}

export class GatewayArquimedesProvider implements ArquimedesLlmProvider {
  async complete(request: ArquimedesLlmRequest): Promise<string> {
    if (!request || typeof request !== "object") {
      throw new Error("O Arquimedes não recebeu a requisição estruturada da revisão da EAP. Nenhuma alteração foi aplicada à obra.");
    }
    if (typeof request.system !== "string" || typeof request.user !== "string") {
      throw new Error("A requisição da revisão da EAP está incompleta (system/user ausentes). Nenhuma alteração foi aplicada à obra.");
    }

    const baseMessages: GatewayRequest["messages"] = [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ];

    const databaseTools: LlmTool[] = request.databaseContext
      ? [
          {
            type: "function",
            function: {
              name: "consultar_projeto",
              description: "Consulta somente leitura os dados atuais da obra em análise.",
              parameters: { type: "object", properties: {}, additionalProperties: false },
            },
          },
          {
            type: "function",
            function: {
              name: "consultar_eap",
              description: "Consulta somente leitura a árvore atual da EAP da obra. Retorna mapa compacto com código, nome, pai, nível e tipo.",
              parameters: { type: "object", properties: {}, additionalProperties: false },
            },
          },
          {
            type: "function",
            function: {
              name: "consultar_no_eap",
              description: "Consulta somente leitura os detalhes atuais de um nó da EAP pelo código.",
              parameters: {
                type: "object",
                properties: { code: { type: "string", minLength: 1, maxLength: 32 } },
                required: ["code"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "consultar_filhos_eap",
              description: "Consulta somente leitura os filhos imediatos de um nó da EAP pelo código.",
              parameters: {
                type: "object",
                properties: { code: { type: "string", minLength: 1, maxLength: 32 } },
                required: ["code"],
                additionalProperties: false,
              },
            },
          },
        ]
      : [];

    const executeDatabaseTool = async (name: string, rawArgs: string) => {
      const context = request.databaseContext;
      if (!context) throw new Error("Ferramentas de banco não habilitadas nesta requisição.");
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível.");
      let args: Record<string, unknown> = {};
      try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { throw new Error("Argumentos inválidos para ferramenta de banco."); }

      if (name === "consultar_projeto") {
        const [row] = await db.select({
          id: projects.id,
          code: projects.code,
          name: projects.name,
          location: projects.location,
          status: projects.status,
          descricao: projects.descricao,
          tipoDeObra: projects.tipoDeObra,
          plannedStart: projects.plannedStart,
          plannedFinish: projects.plannedFinish,
          baseReferencia: projects.baseReferencia,
          baseReferenciaRef: projects.baseReferenciaRef,
        }).from(projects).where(eq(projects.id, context.projectId)).limit(1);
        if (!row) throw new Error("Obra não encontrada.");
        return row;
      }

      if (name === "consultar_eap") {
        const rows = await db.select({
          id: wbsNodes.id,
          code: wbsNodes.code,
          name: wbsNodes.name,
          parentId: wbsNodes.parentId,
          level: wbsNodes.level,
          nodeType: wbsNodes.nodeType,
          unit: wbsNodes.unit,
          plannedQuantity: wbsNodes.plannedQuantity,
          location: wbsNodes.location,
        }).from(wbsNodes)
          .where(eq(wbsNodes.projectId, context.projectId))
          .orderBy(wbsNodes.level, wbsNodes.sortOrder, wbsNodes.id);
        return rows;
      }

      const code = String(args.code ?? "").trim();
      if (!code) throw new Error("Código da EAP é obrigatório.");
      const [node] = await db.select({
        id: wbsNodes.id,
        code: wbsNodes.code,
        name: wbsNodes.name,
        parentId: wbsNodes.parentId,
        level: wbsNodes.level,
        nodeType: wbsNodes.nodeType,
        unit: wbsNodes.unit,
        plannedQuantity: wbsNodes.plannedQuantity,
        location: wbsNodes.location,
        responsible: wbsNodes.responsible,
        description: wbsNodes.description,
        inclusions: wbsNodes.inclusions,
        exclusions: wbsNodes.exclusions,
        acceptanceCriteria: wbsNodes.acceptanceCriteria,
        decompositionBasis: wbsNodes.decompositionBasis,
        scopeStatus: wbsNodes.scopeStatus,
      }).from(wbsNodes).where(and(eq(wbsNodes.projectId, context.projectId), eq(wbsNodes.code, code))).limit(1);
      if (!node) throw new Error(`Nó EAP ${code} não encontrado.`);

      if (name === "consultar_no_eap") return node;
      return await db.select({
        id: wbsNodes.id,
        code: wbsNodes.code,
        name: wbsNodes.name,
        parentId: wbsNodes.parentId,
        level: wbsNodes.level,
        nodeType: wbsNodes.nodeType,
        unit: wbsNodes.unit,
        plannedQuantity: wbsNodes.plannedQuantity,
        location: wbsNodes.location,
        scopeStatus: wbsNodes.scopeStatus,
      }).from(wbsNodes)
        .where(and(eq(wbsNodes.projectId, context.projectId), eq(wbsNodes.parentId, node.id)))
        .orderBy(wbsNodes.sortOrder, wbsNodes.id);
    };

    const generate = async (messages: GatewayRequest["messages"], maxTokens: number, tools: LlmTool[]) => {
      return invokeLlmGateway({
        messages,
        tools,
        responseFormat: tools.length ? undefined : { type: "json_object" },
        maxTokens,
        timeoutMs: request.databaseContext ? 180_000 : undefined,
        allowEmptyResponse: true,
      });
    };

    const outputBudget = request.maxTokens ?? 4096;
    const maxToolIterations = request.databaseContext ? 3 : 0;
    let messages = baseMessages;

    for (let iteration = 0; iteration <= maxToolIterations; iteration++) {
      const response = await generate(messages, outputBudget, databaseTools);
      const message = response.choices?.[0]?.message;
      const toolCalls = message?.tool_calls ?? [];

      if (!toolCalls.length) {
        const raw = extractText(response);
        const json = raw ? normalizeStructuredJson(raw) : null;
        if (json) return json;
        break;
      }

      if (iteration === maxToolIterations) {
        break;
      }

      messages = [
        ...messages,
        {
          role: "assistant",
          content: message?.content ?? null,
          tool_calls: toolCalls,
        },
      ];

      const results = await Promise.all(toolCalls.map(async call => {
        try {
          const value = await executeDatabaseTool(call.function.name, call.function.arguments);
          return { role: "tool" as const, tool_call_id: call.id, content: JSON.stringify(value).slice(0, 20000) };
        } catch (error) {
          return { role: "tool" as const, tool_call_id: call.id, content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) };
        }
      }));
      messages = [...messages, ...results];
    }

    throw new Error("O Arquimedes não conseguiu concluir a revisão EAP após consultar os dados atuais da obra.");
  }
}
