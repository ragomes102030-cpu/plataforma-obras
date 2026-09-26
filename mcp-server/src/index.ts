import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Backend MCP servers (SSE protocol)
const MCP_SERVERS = {
  eap: { url: "https://mcp-eap-server.onrender.com/mcp", name: "eap-server" },
  cronograma: { url: "https://mcp-cronograma-server.onrender.com/mcp", name: "cronograma-server" },
  gantt: { url: "https://mcp-gantt-lob-server.onrender.com/mcp", name: "mcp-gantt-lob-server" },
};

type ServerKey = keyof typeof MCP_SERVERS;

// Initialize empty session map with all keys
const sessions: Record<ServerKey, string> = {
  eap: "",
  cronograma: "",
  gantt: "",
};

async function initializeServer(key: ServerKey): Promise<string> {
  const srv = MCP_SERVERS[key];
  const response = await fetch(srv.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "plataforma-obra-mcp", version: "1.0.0" },
      },
    }),
  });
  const text = await response.text();
  const sessionMatch = text.match(/mcp-session-id:\s*([a-f0-9]+)/i);
  if (sessionMatch) {
    sessions[key] = sessionMatch[1];
    return sessions[key];
  }
  return "";
}

async function callTool(key: ServerKey, toolName: string, args: Record<string, unknown>): Promise<any> {
  if (!sessions[key]) await initializeServer(key);
  const srv = MCP_SERVERS[key];
  const response = await fetch(srv.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "mcp-session-id": sessions[key],
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  const text = await response.text();
  const dataMatch = text.match(/data:\s*(\{[^}]+\})/s);
  if (dataMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("JSON")) {
        return { content: [{ type: "text", text: text }] };
      }
      throw e;
    }
  }
  return { content: [{ type: "text", text: text }] };
}

async function listTools(key: ServerKey): Promise<any[]> {
  if (!sessions[key]) await initializeServer(key);
  const srv = MCP_SERVERS[key];
  const response = await fetch(srv.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text-event-stream",
      "mcp-session-id": sessions[key],
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now() + 1,
      method: "tools/list",
      params: {},
    }),
  });
  const text = await response.text();
  const dataMatch = text.match(/data:\s*(\{[^}]+\})/s);
  if (dataMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      return data.result?.tools || [];
    } catch {}
  }
  return [];
}

const server = new McpServer({
  name: "plataforma-obra",
  version: "1.0.0",
});

async function registerAllTools() {
  for (const key of Object.keys(MCP_SERVERS) as ServerKey[]) {
    const tools = await listTools(key);
    for (const tool of tools) {
      const toolName: string = String(tool.name);
      const description: string = String(tool.description || "");
      server.tool(toolName, description, async (args: Record<string, unknown>) => {
        const result = await callTool(key, toolName, args);
        return result;
      });
    }
  }
}

const transport = new StdioServerTransport();
server.connect(transport);

registerAllTools()
  .then(() => console.error("[plataforma-obra-mcp] Ready"))
  .catch(e => console.error("[plataforma-obra-mcp] Error:", e));
