import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredProviders,
  invokeLlmGateway,
  normalizeChatCompletionsUrl,
  type LlmProviderConfig,
} from "./llm-provider-gateway";

const providers: LlmProviderConfig[] = [
  {
    name: "openrouter",
    baseUrl: "https://openrouter.example/v1/chat/completions",
    apiKey: "primary-secret",
    model: "openrouter/free",
  },
  {
    name: "gemini",
    baseUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKey: "fallback-secret",
    model: "gemini-3-flash-preview",
  },
];

afterEach(() => vi.restoreAllMocks());

describe("llm-provider-gateway", () => {
  it("normaliza bases OpenAI-compatible sem duplicar o caminho", () => {
    expect(normalizeChatCompletionsUrl("https://api.example/v1")).toBe(
      "https://api.example/v1/chat/completions"
    );
    expect(
      normalizeChatCompletionsUrl("https://api.example/v1/chat/completions")
    ).toBe("https://api.example/v1/chat/completions");
    expect(normalizeChatCompletionsUrl("https://api.example")).toBe(
      "https://api.example/v1/chat/completions"
    );
  });

  it("troca para o fallback após um rate limit e retorna o provedor usado", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    const result = await invokeLlmGateway(
      { messages: [{ role: "user", content: "teste" }], tools: [] },
      providers
    );

    expect(result.provider).toBe("gemini");
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      providers[1].baseUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer fallback-secret",
        }),
      })
    );
  });

  it("tenta fallback quando o provedor primário está sem autorização", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "fallback-model",
            choices: [{ message: { content: "fallback" } }],
          }),
          { status: 200 }
        )
      );

    const result = await invokeLlmGateway(
      { messages: [{ role: "user", content: "teste" }], tools: [] },
      providers
    );
    expect(result.choices?.[0]?.message?.content).toBe("fallback");
    expect(result.model).toBe("fallback-model");
  });

  it("falha claramente quando não há provedor configurado", async () => {
    await expect(
      invokeLlmGateway({ messages: [], tools: [] }, [])
    ).rejects.toThrow("Nenhum provedor LLM configurado");
  });

  it("não inclui provedores incompletos no catálogo configurado", () => {
    const configured = getConfiguredProviders();
    expect(
      configured.every(provider => provider.apiKey && provider.baseUrl)
    ).toBe(true);
  });
});
