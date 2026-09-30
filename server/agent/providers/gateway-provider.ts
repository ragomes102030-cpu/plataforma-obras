import { invokeLlmGateway, type GatewayRequest } from "../../llm-provider-gateway";
import type { ArquimedesLlmProvider, ArquimedesLlmRequest } from "../core/types";

function extractText(response: Awaited<ReturnType<typeof invokeLlmGateway>>) {
  const message = response.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text)
      .join("\n");
    if (text.trim()) return text;
  }
  throw new Error("O provedor LLM não retornou conteúdo textual.");
}

export class GatewayArquimedesProvider implements ArquimedesLlmProvider {
  async complete(request: ArquimedesLlmRequest): Promise<string> {
    const gatewayRequest: GatewayRequest = {
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      tools: [],
      responseFormat: { type: "json_object" },
    };
    const response = await invokeLlmGateway(gatewayRequest);
    return extractText(response);
  }
}
