import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const PROTOCOL_VERSION = process.env.MCP_PROTOCOL_VERSION?.trim() || "2025-03-26";

type ServerKey = "eap" | "cronograma" | "gantt";

type RemoteServer = {
  url: string;
  name: string;
  token?: string;
};

const MCP_SERVERS: Record<ServerKey, RemoteServer> = {
  eap: {
    url: process.env.MCP_EAP_URL?.trim() || "https://mcp-eap-server.onrender.com/mcp",
    name: "eap-server",
    token: process.env.MCP_EAP_TOKEN?.trim(),
  },
  cronograma: {
    url:
      process.env.MCP_CRONOGRAMA_URL?.trim() ||
      "https://mcp-cronograma-server.onrender.com/mcp",
    name: "cronograma-server",
    token: process.env.MCP_CRONOGRAMA_TOKEN?.trim(),
  },
  gantt: {
    url:
      process.env.MCP_GANTT_LOB_URL?.trim() ||
      "https://mcp-gantt-lob-server.onrender.com/mcp",
    name: "gantt-lob-server",
    token: process.env.MCP_GANTT_LOB_TOKEN?.trim(),
  },
};

const sessions: Record<ServerKey, string> = {
  eap: "",
  cronograma: "",
  gantt: "",
};

function headers(key: ServerKey) {
  const token = MCP_SERVERS[key].token;
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(sessions[key] ? { "mcp-session-id": sessions[key] } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function parseSseOrJson(text: string): any {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim());
    for (const data of dataLines) {
      if (!data) continue;
      try {
        return JSON.parse(data);
      } catch {
        // Continue until a complete JSON data event is found.
      }
    }
  }
  return { content: [{ type: "text", text }] };
}

async function post(
  key: ServerKey,
  payload: Record<string, unknown>
): Promise<any> {
  const response = await fetch(MCP_SERVERS[key].url, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) sessions[key] = sessionId;

  if (!response.ok) {
    throw new Error(
      `MCP ${key} ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 500)}`
    );
  }

  const data = parseSseOrJson(body);
  if (data.error) {
    throw new Error(`MCP ${key}: ${data.error.message || "erro remoto"}`);
  }
  return data;
}

async function initializeServer(key: ServerKey): Promise<void> {
  if (sessions[key]) return;
  await post(key, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "plataforma-obra-mcp", version: "2.0.0" },
    },
  });
  await post(key, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });
}

async function callTool(
  key: ServerKey,
  toolName: string,
  args: Record<string, unknown>
): Promise<any> {
  await initializeServer(key);
  const data = await post(key, {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  return data.result ?? { content: [] };
}

async function listTools(key: ServerKey): Promise<any[]> {
  await initializeServer(key);
  const data = await post(key, {
    jsonrpc: "2.0",
    id: Date.now() + 1,
    method: "tools/list",
    params: {},
  });
  return Array.isArray(data.result?.tools) ? data.result.tools : [];
}

const server = new McpServer({
  name: "plataforma-obra",
  version: "2.0.0",
});

async function registerAllTools() {
  for (const key of Object.keys(MCP_SERVERS) as ServerKey[]) {
    const tools = await listTools(key);
    for (const tool of tools) {
      const toolName = String(tool.name);
      const description = String(tool.description || "");
      server.tool(toolName, description, async (args: Record<string, unknown>) => {
        return callTool(key, toolName, args);
      });
    }
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
await registerAllTools();
console.error("[plataforma-obra-mcp] Ready");
