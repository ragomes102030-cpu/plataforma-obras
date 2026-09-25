import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TRPC_URL = process.env.PLATAFORMA_URL || "https://plataforma-obras-api.onrender.com/api/trpc";

const server = new McpServer({
  name: "plataforma-obra",
  version: "1.0.0",
  description: "MCP para Plataforma Obras tRPC API - planejamento de obras",
});

async function callTrpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(TRPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
  });
  if (!res.ok) throw new Error(`tRPC ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.json?.message || method);
  return data.result;
}

server.tool("projects_list", "Listar projetos", {}, async () => {
  const r = await callTrpc("projects.list", {});
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("projects_get", "Detalhes de um projeto", { projectId: z.string() }, async ({ projectId }) => {
  const r = await callTrpc("projects.get", { projectId });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("tasks_list", "Listar tarefas do projeto", { projectId: z.string() }, async ({ projectId }) => {
  const r = await callTrpc("tasks.list", { projectId });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("gantt_generate", "Gerar cronograma Gantt", { projectId: z.string() }, async ({ projectId }) => {
  const r = await callTrpc("gantt.generate", { projectId });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("eap_build", "Gerar EAP/WBS", { projectId: z.string() }, async ({ projectId }) => {
  const r = await callTrpc("eap.build", { projectId });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("costs_search", "Buscar custos", { query: z.string(), projectId: z.string().optional() }, async ({ query, projectId }) => {
  const r = await callTrpc("costs.search", { query, projectId });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("costs_sync", "Sincronizar custos", { batchSize: z.number().optional().default(100) }, async ({ batchSize }) => {
  const r = await callTrpc("costs.sync", { batchSize });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("sinapi_search", "Buscar insumo SINAPI", { query: z.string(), uf: z.string().optional().default("CE") }, async ({ query, uf }) => {
  const r = await callTrpc("sinapi.search", { query, uf });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("seinfra_search", "Buscar insumo SEINFRA", { query: z.string(), uf: z.string().optional().default("CE") }, async ({ query, uf }) => {
  const r = await callTrpc("seinfra.search", { query, uf });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("schedule_generate", "Gerar schedule", { projectId: z.string() }, async ({ projectId }) => {
  const r = await callTrpc("schedule.generate", { projectId });
  return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: false };
});

server.tool("platform_health", "Verificar saúde da plataforma", {}, async () => {
  try {
    const r = await callTrpc("platform.health", {});
    return { content: [{ type: "text", text: JSON.stringify({ status: "online", ...r }, null, 2) }], isError: false };
  } catch (e: unknown) {
    return { content: [{ type: "text", text: JSON.stringify({ status: "offline", error: String(e) }, null, 2) }], isError: true };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
console.error("[plataforma-obra-mcp] ready");
