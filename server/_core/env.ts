export const ENV = {
  appId: process.env.VITE_APP_ID?.trim() || "plataforma-obras",
  // O .trim() + ?? "" permitia que uma variavel presente com valor vazio
  // virasse string vazia sem sinal: o boot passava e o login quebrava depois,
  // em createSessionToken, com "Zero-length key is not supported". O valor
  // e normalizado aqui e a presenca real e verificada no boot.
  cookieSecret: process.env.JWT_SECRET?.trim() ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  allowDemoData: process.env.ALLOW_DEMO_DATA === "true",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID?.trim() ?? "",
  autoAdminFirstUser: process.env.AUTO_ADMIN_FIRST_USER === "true",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  aiApiUrl: process.env.AI_API_BASE_URL ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "",
  llmPrimaryProvider: process.env.LLM_PRIMARY_PROVIDER ?? "",
  llmPrimaryBaseUrl: process.env.LLM_PRIMARY_BASE_URL ?? "",
  llmPrimaryApiKey: process.env.LLM_PRIMARY_API_KEY ?? "",
  llmPrimaryModel: process.env.LLM_PRIMARY_MODEL ?? "",
  llmFallbackProvider: process.env.LLM_FALLBACK_PROVIDER ?? "",
  llmFallbackBaseUrl: process.env.LLM_FALLBACK_BASE_URL ?? "",
  llmFallbackApiKey: process.env.LLM_FALLBACK_API_KEY ?? "",
  llmFallbackModel: process.env.LLM_FALLBACK_MODEL ?? "",
  llmSecondFallbackProvider: process.env.LLM_SECONDARY_PROVIDER ?? "",
  llmSecondFallbackBaseUrl: process.env.LLM_SECONDARY_BASE_URL ?? "",
  llmSecondFallbackApiKey: process.env.LLM_SECONDARY_API_KEY ?? "",
  llmSecondFallbackModel: process.env.LLM_SECONDARY_MODEL ?? "",
  llmMaxAttempts: Number(process.env.LLM_MAX_ATTEMPTS ?? "3"),
  llmTimeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? "60000"),
  mcpTimeoutMs: Number(process.env.MCP_REQUEST_TIMEOUT_MS ?? "25000"),
  agentTotalTimeoutMs: Number(process.env.AGENT_TOTAL_TIMEOUT_MS ?? "120000"),
  agentMaxIterations: Number(process.env.AGENT_MAX_ITERATIONS ?? "8"),
  mcpCatalogTtlMs: Number(process.env.MCP_CATALOG_TTL_MS ?? "300000"),
  // Hosts conferidos contra a config MCP real. Ja foram *.vercel.app e
  // estavam errados: os MCP servers nunca_publicaram na Vercel. Nao reverter.
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "https://plataforma-obras-api.onrender.com",
  mcpEapUrl: process.env.MCP_EAP_URL ?? "https://mcp-eap-server.onrender.com",
  mcpCronogramaUrl: process.env.MCP_CRONOGRAMA_URL ?? "https://mcp-cronograma-server.onrender.com",
  mcpGanttLobUrl: process.env.MCP_GANTT_LOB_URL ?? "https://mcp-gantt-lob-server.onrender.com",
  priceVariationThresholdPct: Number(process.env.PRICE_VARIATION_THRESHOLD_PCT ?? "30"),
  arquimedesCodeRepository:
    process.env.ARQUIMEDES_CODE_REPOSITORY?.trim() || "ragomes102030-cpu/plataforma-obras",
  arquimedesCodeBranch:
    process.env.ARQUIMEDES_CODE_BRANCH?.trim() || "arquimedes-agent",
  arquimedesSelfEditEnabled:
    process.env.ARQUIMEDES_SELF_EDIT_ENABLED === "true",
  arquimedesGithubToken: process.env.ARQUIMEDES_GITHUB_TOKEN?.trim() ?? "",
  webResearchBaseUrl: process.env.WEB_RESEARCH_BASE_URL?.trim() || "https://s.jina.ai",
  webResearchApiKey: process.env.WEB_RESEARCH_API_KEY?.trim() ?? "",
  webResearchTimeoutMs: Number(process.env.WEB_RESEARCH_TIMEOUT_MS ?? "30000"),
};
