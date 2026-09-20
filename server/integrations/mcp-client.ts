export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpCallResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  [key: string]: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
};

type McpClientOptions = {
  name?: string;
  version?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export const DEFAULT_MCP_TIMEOUT_MS = 60_000;

const PROTOCOL_VERSION = "2025-03-26";

function parseSseOrJson(body: string): JsonRpcResponse {
  const dataLine = body.split(/\r?\n/).find(line => line.startsWith("data:"));
  const jsonText = dataLine ? dataLine.slice(5).trim() : body.trim();
  if (!jsonText) throw new Error("MCP respondeu sem payload JSON");
  return JSON.parse(jsonText) as JsonRpcResponse;
}

function endpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/mcp") ? normalized : `${normalized}/mcp`;
}

export class McpClient {
  private sessionId: string | undefined;
  private requestId = 0;
  private initialized = false;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly clientInfo: { name: string; version: string };

  constructor(
    private readonly baseUrl: string,
    options: McpClientOptions = {}
  ) {
    if (!baseUrl) throw new Error("URL do MCP não configurada");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
    this.clientInfo = {
      name: options.name ?? "plataforma-obras",
      version: options.version ?? "1.0.0",
    };
  }

  private async post(payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(endpoint(this.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`MCP ${response.status}: ${body.slice(0, 500)}`);
      }
      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) this.sessionId = sessionId;
      if (!body.trim()) return { jsonrpc: "2.0" } as JsonRpcResponse;
      return parseSseOrJson(body);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MCP excedeu o timeout de ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    const response = await this.post({
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: this.clientInfo,
      },
    });
    if (response.error)
      throw new Error(`MCP initialize: ${response.error.message}`);
    this.initialized = true;
    await this.post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
  }

  async listTools(): Promise<McpTool[]> {
    await this.ensureInitialized();
    const response = await this.post({
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: "tools/list",
      params: {},
    });
    if (response.error)
      throw new Error(`MCP tools/list: ${response.error.message}`);
    return (response.result?.tools ?? []) as McpTool[];
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<McpCallResult> {
    await this.ensureInitialized();
    const response = await this.post({
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (response.error)
      throw new Error(`MCP tools/call ${name}: ${response.error.message}`);
    return response.result as McpCallResult;
  }
}

export function extractMcpText(result: McpCallResult): string {
  return (result.content ?? [])
    .filter(item => item.type === "text" && typeof item.text === "string")
    .map(item => item.text)
    .join("\n");
}
