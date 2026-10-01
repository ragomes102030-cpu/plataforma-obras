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

    const firstRequest: GatewayRequest = {
      messages: baseMessages,
      tools: [],
      responseFormat: { type: "json_object" },
      maxTokens: 16384,
    };

    const firstResponse = await invokeLlmGateway(firstRequest);
    const firstRaw = extractText(firstResponse);
    if (extractJsonObject(firstRaw)) return extractJsonObject(firstRaw)!;

    const recoveryRequest: GatewayRequest = {
      messages: [
        ...baseMessages,
        {
          role: "user",
          content:
            "A resposta anterior não pôde ser interpretada como JSON válido. Gere novamente a mesma proposta EAP como um único objeto JSON válido e compacto. Não use markdown, não inclua comentários, não inclua texto fora do JSON e reduza as justificativas a frases curtas.",
        },
      ],
      tools: [],
      responseFormat: { type: "json_object" },
      maxTokens: 16384,
    };

    const recoveryResponse = await invokeLlmGateway(recoveryRequest);
    const recoveryRaw = extractText(recoveryResponse);
    const recoveryJson = extractJsonObject(recoveryRaw);
    if (recoveryJson) return recoveryJson;

    throw new Error(
      "O Arquimedes recebeu uma resposta do provedor, mas ela não pôde ser convertida em JSON válido para a proposta da EAP. Tente novamente."
    );
  }
}
