import { describe, expect, it, vi } from "vitest";
import { McpClient, extractMcpText } from "./mcp-client";
import {
  getConstructionMcpStatus,
  MCP_TOOL_POLICY,
} from "./construction-mcps";

function response(
  body: string,
  headers: Record<string, string> = {},
  status = 200
) {
  return new Response(body, { status, headers });
}

describe("McpClient", () => {
  it("inicializa sessão, mantém session id e lista ferramentas", async () => {
    const calls: Array<{ method: string; headers: HeadersInit }> = [];
    const client = new McpClient("https://example.test", {
      fetchImpl: (async (_input, init) => {
        const payload = JSON.parse(String(init?.body));
        calls.push({ method: payload.method, headers: init?.headers ?? {} });
        if (payload.method === "initialize") {
          return response(
          `event: message
data: {"jsonrpc":"2.0","id":1,"result":{}}`,
            { "mcp-session-id": "session-1" }
          );
        }
        if (payload.method === "notifications/initialized") return response("");
        return response(
          'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"get_eap_tree"}]}}'
        );
      }) as typeof fetch,
    });

    await expect(client.listTools()).resolves.toEqual([
      { name: "get_eap_tree" },
    ]);
    expect(calls.map(call => call.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(calls[2].headers).toEqual(
      expect.objectContaining({ "mcp-session-id": "session-1" })
    );
  });

  it("extrai texto de resultado MCP", () => {
    expect(
      extractMcpText({
        content: [
          { type: "text", text: "linha 1" },
          { type: "image" },
          { type: "text", text: "linha 2" },
        ],
      })
    ).toBe("linha 1\nlinha 2");
  });
});

describe("MCP_TOOL_POLICY", () => {
  it("separa consultas automáticas de alterações", () => {
    expect(MCP_TOOL_POLICY.readOnly.has("calcular_caminho_critico")).toBe(true);
    expect(MCP_TOOL_POLICY.requiresConfirmation.has("criar_eap_node")).toBe(
      true
    );
    expect(MCP_TOOL_POLICY.destructive.has("deletar_projeto")).toBe(true);
  });
});

describe("getConstructionMcpStatus", () => {
  it("mantém os servidores independentes e correlaciona a falha", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await getConstructionMcpStatus("req-status-1", {
      eap: { listTools: async () => [{ name: "get_eap_tree" }] },
      cronograma: {
        listTools: async () => {
          throw new Error("MCP 503: indisponível");
        },
      },
      ganttLob: { listTools: async () => [] },
    });

    expect(status.status).toBe("degraded");
    expect(status.requestId).toBe("req-status-1");
    expect(status.servers.eap.status).toBe("online");
    expect(status.servers.eap.toolCount).toBe(1);
    expect(status.servers.cronograma.status).toBe("offline");
    expect(status.servers.cronograma.lastError).toContain("503");
    expect(status.servers.ganttLob.status).toBe("online");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"req-status-1"')
    );
    errorSpy.mockRestore();
  });
});
