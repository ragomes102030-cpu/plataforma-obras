import { invokeLlmGateway, type GatewayRequest } from "../../llm-provider-gateway";
import type { ArquimedesLlmProvider, ArquimedesLlmRequest } from "../core/types";

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}

  const fenced = trimmed.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/i);
  if (fenced) {
    try {
      JSON.parse(fenced[1].trim());
      return fenced[1].trim();
    } catch {}
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {}
  }

  return null;
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

  // Alguns modelos de raciocínio devolvem o raciocínio em vez de preencher
  // message.content. Como o Arquimedes exige JSON, aceitamos somente se o
  // próprio raciocínio contiver um objeto JSON válido.
  const reasoning = message?.reasoning ?? message?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) {
    const json = extractJsonObject(reasoning);
    if (json) return json;
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

    const generate = async (messages: GatewayRequest["messages"], maxTokens: number) => {
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
        json: raw ? extractJsonObject(raw) : null,
      };
    };

    const outputBudget = request.maxTokens ?? 16384;
    const first = await generate(baseMessages, outputBudget);
    if (first.json) return first.json;

    const finishReason = first.response.choices?.[0]?.finish_reason;
    const recoveryReason =
      finishReason === "length"
        ? "A resposta anterior foi interrompida antes de fechar o JSON. Gere novamente uma versão compacta e completa."
        : !first.raw
          ? "A resposta anterior veio vazia. Gere novamente a mesma proposta de forma compacta e completa."
          : "A resposta anterior não pôde ser interpretada como JSON válido. Gere novamente a mesma proposta de forma compacta e completa.";

    const recoveryMessages: GatewayRequest["messages"] = [
      ...baseMessages,
      {
        role: "user",
        content:
          recoveryReason +
          " Responda SOMENTE com um objeto JSON válido. Mantenha a resposta dentro do orçamento solicitado. " +
          "Mantenha apenas action, basis, assumptions, missingInformation e nodes. " +
          "Em cada node, mantenha parentCode, code quando necessário, name, nodeType, operation e uma rationale curta. " +
          "Não use markdown, comentários, explicações ou texto fora do JSON.",
      },
    ];

    const second = await generate(recoveryMessages, outputBudget);
    if (second.json) return second.json;

    throw new Error(
      "O Arquimedes recebeu uma proposta EAP incompleta ou inválida do provedor e não conseguiu recuperá-la com segurança. Nenhuma alteração foi aplicada à obra."
    );
  }
}
