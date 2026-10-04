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
  const requestTimeoutMs = request.timeoutMs ?? 0;
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
      ? requestTimeoutMs
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