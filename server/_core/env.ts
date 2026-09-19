export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  aiApiUrl: process.env.AI_API_BASE_URL ?? "",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "",
  mcpEapUrl: process.env.MCP_EAP_URL ?? "https://mcp-eap-server.onrender.com",
  mcpCronogramaUrl:
    process.env.MCP_CRONOGRAMA_URL ??
    "https://mcp-cronograma-server.onrender.com",
  mcpGanttLobUrl:
    process.env.MCP_GANTT_LOB_URL ??
    "https://mcp-gantt-lob-server.onrender.com",
};
