import { invokeLlmGateway, type GatewayRequest } from "../../llm-provider-gateway";
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
    const baseMessages: GatewayRequest["messages"] = [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ];

    const generate = async (
      messages: GatewayRequest["messages"],
      maxTokens: number
    ) => {
      const response = await invokeLlmGateway({
        messages,
        tools: [],
        responseFormat: { type: "json_object" },
        maxTokens,
        allowEmptyResponse: true,
      });
      const raw = extractText(response);
      return {
        response,
        raw: raw ?? "",
        json: raw ? normalizeStructuredJson(raw) : null,
      };
    };

    const outputBudget = request.maxTokens ?? 16384;
    const recoveryBudgets = Array.from(
      new Set([
        outputBudget,
        Math.min(Math.max(outputBudget * 2, 8192), 32768),
        Math.min(Math.max(outputBudget * 4, 12288), 32768),
      ])
    );

    for (let attempt = 0; attempt < recoveryBudgets.length; attempt++) {
      const maxTokens = recoveryBudgets[attempt];
      const messages =
        attempt === 0
          ? baseMessages
          : [
              ...baseMessages,
              {
                role: "user" as const,
                content:
                  "A saída anterior não pôde ser usada com segurança. Gere novamente a mesma proposta de forma compacta e completa. " +
                  "Responda SOMENTE com JSON válido. " +
                  "Use exatamente esta forma mínima: " +
                  '{"basis":[],"assumptions":[],"missingInformation":[],"nodes":[]}.' +
                  " Não inclua markdown, comentários ou texto fora do JSON. " +
                  "Mantenha rationale curta em cada node e não invente dados.",
              },
            ];

      const current = await generate(messages, maxTokens);
      const finishReason = current.response.choices?.[0]?.finish_reason;

      if (!current.json) {
        console.warn("[Arquimedes][JSON] recuperação estruturada", {
          attempt: attempt + 1,
          maxTokens,
          provider: current.response.provider,
          finishReason,
          rawLength: current.raw.length,
        });
      }

      if (current.json) return current.json;
    }

    throw new Error(
      "O Arquimedes recebeu uma proposta EAP incompleta ou inválida do provedor e não conseguiu recuperá-la com segurança. Nenhuma alteração foi aplicada à obra."
    );
  }
}
