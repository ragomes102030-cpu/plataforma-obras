import { describe, expect, it } from "vitest";
import { McpClient } from "../integrations/mcp-client";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
}

describe("regressões do cliente MCP", () => {
  it("traduz erro HTTP do servidor sem perder o status", async () => {
    const client = new McpClient("https://mcp.example", {
      fetchImpl: async () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "content-type": "text/plain" },
        }),
    });

    await expect(client.listTools()).rejects.toThrow(
      "MCP 429: Too Many Requests"
    );
  });

  it("traduz timeout do AbortController para erro operacional", async () => {
    const client = new McpClient("https://mcp.example", {
      timeoutMs: 5,
      fetchImpl: async (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });

    await expect(client.listTools()).rejects.toThrow(
      "MCP excedeu o timeout de 5ms"
    );
  });

  it("mantém o contrato JSON-RPC e encaminha argumentos exatamente uma vez", async () => {
    const payloads: any[] = [];
    const client = new McpClient("https://mcp.example", {
      fetchImpl: (async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        payloads.push(body);
        if (body.method === "initialize") {
          return jsonResponse(
            { jsonrpc: "2.0", id: body.id, result: { capabilities: {} } },
            { headers: { "mcp-session-id": "session-contract" } }
          );
        }
        if (body.method === "notifications/initialized") return new Response("");
        return jsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          result: { structuredContent: { ok: true } },
        });
      }) as typeof fetch,
    });

    const result = await client.callTool("validar_estrutura", {
      project_id: "aurora-ext",
      include_warnings: true,
    });

    expect(result.structuredContent).toEqual({ ok: true });
    expect(payloads.filter(item => item.method === "tools/call")).toHaveLength(1);
    expect(payloads.at(-1)).toMatchObject({
      method: "tools/call",
      params: {
        name: "validar_estrutura",
        arguments: {
          project_id: "aurora-ext",
          include_warnings: true,
        },
      },
    });
  });
});
