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

  it("não envia tool calling quando a requisição não possui ferramentas", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await invokeLlmGateway(
      { messages: [{ role: "user", content: "teste" }], tools: [] },
      providers
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.max_tokens).toBe(1024);
  });

  it("envia somente headers ASCII ao provedor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await invokeLlmGateway(
      { messages: [{ role: "user", content: "teste" }], tools: [] },
      providers
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const headers = request?.headers as Record<string, string>;
    expect(headers["X-Title"]).toBe("Plataforma Obras - Agent Orchestrator");
    expect([...headers["X-Title"]].every(character => character.charCodeAt(0) < 256)).toBe(true);
  });

  it("não expõe links internos quando o provedor rejeita a chamada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "insufficient credits; visit https://openrouter.ai/settings/credits",
          },
        }),
        { status: 402 }
      )
    );

    await expect(
      invokeLlmGateway(
        { messages: [{ role: "user", content: "teste" }], tools: [] },
        [providers[0]]
      )
    ).rejects.toThrow("[link do provedor omitido]");
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
