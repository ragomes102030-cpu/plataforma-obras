import { ENV } from "./_core/env";
import { getStoredLlmProviders } from "./llm-settings";

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content:
    | string
    | null
    | Array<{ type?: string; text?: string; [key: string]: unknown }>;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type LlmTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmResponse = {
  model?: string;
  provider?: string;
  choices?: Array<{
    message?: {
      role?: "assistant";
      content?: LlmMessage["content"];
      reasoning?: string;
      reasoning_content?: string;
      tool_calls?: LlmMessage["tool_calls"];
    };
    finish_reason?: string | null;
  }>;
};

export type LlmProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type GatewayResult = LlmResponse & {
  provider: string;
  attempts: number;
};

export type GatewayRequest = {
  messages: LlmMessage[];
  tools: LlmTool[];
  responseFormat?: { type: "text" | "json_object" };
  maxTokens?: number;
  timeoutMs?: number;
  allowEmptyResponse?: boolean;
};

const RETRYABLE_STATUS = new Set([408, 409, 425, 429]);
const DEFAULT_MODEL = "gpt-5-mini";

function normalizeChatCompletionsUrl(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/$/, "");
  if (!base) return "";
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  if (base.endsWith("/v1beta/openai")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function configuredProvider(
  name: string,
  baseUrl: string,
  apiKey: string,
  model: string
): LlmProviderConfig | null {
  if (!baseUrl.trim() || !apiKey.trim()) return null;
  return {
    name,
    baseUrl: normalizeChatCompletionsUrl(baseUrl),
    apiKey,
    model: model.trim() || DEFAULT_MODEL,
  };
}

export function getConfiguredProviders(): LlmProviderConfig[] {
  const candidates = [
    configuredProvider(
      ENV.llmPrimaryProvider || "primary",
      ENV.llmPrimaryBaseUrl,
      ENV.llmPrimaryApiKey,
      ENV.llmPrimaryModel
    ),
    configuredProvider(
      ENV.llmFallbackProvider || "fallback",
      ENV.llmFallbackBaseUrl,
      ENV.llmFallbackApiKey,
      ENV.llmFallbackModel
    ),
    configuredProvider(
      ENV.llmSecondFallbackProvider || "secondary",
      ENV.llmSecondFallbackBaseUrl,
      ENV.llmSecondFallbackApiKey,
      ENV.llmSecondFallbackModel
    ),
    configuredProvider("legacy-ai", ENV.aiApiUrl, ENV.aiApiKey, ENV.aiModel),
    configuredProvider(
      "manus-forge",
      ENV.forgeApiUrl,
      ENV.forgeApiKey,
      ENV.aiModel
    ),
  ];

  const unique = new Map<string, LlmProviderConfig>();
  for (const provider of candidates) {
    if (provider) unique.set(`${provider.baseUrl}|${provider.model}`, provider);
  }
  return Array.from(unique.values());
}

export async function getConfiguredProvidersAsync(): Promise<
  LlmProviderConfig[]
> {
  const providers = getConfiguredProviders();
  try {
    const storedProviders = await getStoredLlmProviders();
    if (storedProviders.length) {
      const configuredStored = storedProviders
        .filter(provider => provider.enabled !== false)
        .map(provider =>
          configuredProvider(provider.provider, provider.baseUrl, provider.apiKey, provider.model)
        )
        .filter((provider): provider is LlmProviderConfig => Boolean(provider));
      if (configuredStored.length) {
        const unique = new Map<string, LlmProviderConfig>();
        for (const provider of [...configuredStored, ...providers]) {
          unique.set(provider.baseUrl + "|" + provider.model, provider);
        }
        return Array.from(unique.values());
      }
    }
  } catch (error) {
    console.warn("[LLM] Falha ao carregar configuração persistida:", error);
  }
  return providers;
}

function shouldRetry(status: number) {
  return RETRYABLE_STATUS.has(status) || status >= 500;
}

function shouldTryFallback(status: number | undefined) {
  return (
    status === undefined ||
    status === 401 ||
    status === 402 ||
    status === 403 ||
    shouldRetry(status)
  );
}

function safeError(status: number, body: string) {
  const compact = body
    .replace(/https?:\/\/\S+/gi, "[link do provedor omitido]")
    .replace(/\s+/g, " ")
    .slice(0, 500);
  return new Error(`Provedor LLM respondeu ${status}: ${compact}`);
}

async function callProvider(
  provider: LlmProviderConfig,
  request: GatewayRequest
): Promise<LlmResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(request.timeoutMs) && request.timeoutMs > 0
      ? request.timeoutMs
      : Number.isFinite(ENV.llmTimeoutMs) && ENV.llmTimeoutMs > 0
        ? ENV.llmTimeoutMs
        : 60_000
  );
  try {
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
        ...(ENV.publicAppUrl ? { "HTTP-Referer": ENV.publicAppUrl } : {}),
        "X-Title": "Plataforma Obras - Agent Orchestrator",
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        max_tokens: request.maxTokens ?? Number(process.env.LLM_MAX_TOKENS ?? "8192"),
        messages: request.messages,
        ...(provider.name.toLowerCase().includes("deepseek")
          ? { thinking: { type: "disabled" }, reasoning_effort: "none" }
          : {}),
        ...(request.tools.length
          ? { tools: request.tools, tool_choice: "auto" }
          : {}),
        ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw safeError(response.status, await response.text());
    return (await response.json()) as LlmResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timeout no provedor ${provider.name}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function invokeLlmGateway(
  request: GatewayRequest,
  providers?: LlmProviderConfig[]
): Promise<GatewayResult> {
  const configuredProviders =
    providers ?? (await getConfiguredProvidersAsync());
  if (configuredProviders.length === 0) {
    throw new Error(
      "Nenhum provedor LLM configurado. Defina um provedor OpenAI-compatible no Render."
    );
  }

  const errors: string[] = [];
  const maxAttempts =
    Number.isFinite(ENV.llmMaxAttempts) && ENV.llmMaxAttempts > 0
      ? Math.min(Math.floor(ENV.llmMaxAttempts), configuredProviders.length)
      : configuredProviders.length;

  for (let index = 0; index < maxAttempts; index++) {
    const provider = configuredProviders[index];
    try {
      const response = await callProvider(provider, request);
      const message = response.choices?.[0]?.message;
      const hasContent =
        (typeof message?.content === "string" && Boolean(message.content.trim())) ||
        (Array.isArray(message?.content) && message.content.some(part => typeof part?.text === "string" && part.text.trim()));
      const hasToolCalls = Boolean(message?.tool_calls?.length);
      if (
        !hasContent &&
        !hasToolCalls &&
        request.tools.length === 0 &&
        !request.allowEmptyResponse
      ) {
        throw new Error(`Provedor ${provider.name} retornou resposta vazia.`);
      }
      return {
        ...response,
        model: response.model || provider.model,
        provider: provider.name,
        attempts: index + 1,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida";
      errors.push(`${provider.name}: ${message}`);
      const statusMatch = message.match(/respondeu (\d{3})/);
      const status = statusMatch ? Number(statusMatch[1]) : undefined;
      if (!shouldTryFallback(status)) break;
    }
  }

  throw new Error(`Todos os provedores LLM falharam. ${errors.join(" | ")}`);
}

export { normalizeChatCompletionsUrl };
