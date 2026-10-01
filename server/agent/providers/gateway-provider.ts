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

function extractText(response: Awaited<ReturnType<typeof invokeLlmGateway>>) {
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

  const toolCalls = message?.tool_calls?.length ?? 0;
  throw new Error(
    `O provedor ${response.provider} não retornou conteúdo final textual. A resposta ficou vazia, somente com reasoning ou somente com tool call. tool_calls=${toolCalls}, model=${response.model ?? "desconhecido"}.`
  );
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
      });
      const raw = extractText(response);
      return {
        response,
        raw,
        json: extractJsonObject(raw),
      };
    };

    const first = await generate(baseMessages, 16384);
    if (first.json) return first.json;

    const finishReason = first.response.choices?.[0]?.finish_reason;
    const recoveryReason =
      finishReason === "length"
        ? "A resposta anterior foi interrompida antes de fechar o JSON. Gere novamente uma versão compacta e completa."
        : "A resposta anterior não pôde ser interpretada como JSON válido. Gere novamente a mesma proposta de forma compacta e completa.";

    const recoveryMessages: GatewayRequest["messages"] = [
      ...baseMessages,
      {
        role: "user",
        content:
          recoveryReason +
          " Responda SOMENTE com um objeto JSON válido. Máximo de 120 nós. " +
          "Mantenha apenas action, basis, assumptions, missingInformation e nodes. " +
          "Em cada node, mantenha parentCode, code quando necessário, name, nodeType, operation e uma rationale curta. " +
          "Não use markdown, comentários, explicações ou texto fora do JSON.",
      },
    ];

    const second = await generate(recoveryMessages, 16384);
    if (second.json) return second.json;

    throw new Error(
      "O Arquimedes recebeu uma proposta EAP incompleta ou inválida do provedor e não conseguiu recuperá-la com segurança. Nenhuma alteração foi aplicada à obra."
    );
  }
}
