import { describe, expect, it, vi } from "vitest";
import { McpClient, extractMcpText } from "./mcp-client";
import {
  callControlledMcpTool,
  getConstructionMcpStatus,
  MCP_TOOL_POLICY,
  resetMcpResilienceState,
  runConstructionMcpHomologation,
  toCentralCommandMcpDomains,
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

  it("não libera exclusões nem domínios ainda não habilitados", async () => {
    await expect(
      callControlledMcpTool("eap", "deletar_projeto", {})
    ).rejects.toThrow("Mutação não liberada");
    const activityResult = await callControlledMcpTool("cronograma", "criar_atividade", {});
    expect(activityResult.isError).toBe(true);
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

  it("repete uma falha transitória somente leitura e informa as tentativas", async () => {
    resetMcpResilienceState();
    let calls = 0;
    const status = await getConstructionMcpStatus("req-retry-1", {
      eap: {
        listTools: async () => {
          calls += 1;
          if (calls === 1) throw new Error("MCP 503: temporário");
          return [{ name: "get_eap_tree" }];
        },
      },
      cronograma: { listTools: async () => [] },
      ganttLob: { listTools: async () => [] },
    });
    expect(status.servers.eap.status).toBe("online");
    expect(status.servers.eap.attempts).toBe(2);
  });

  it("abre o circuito depois de falhas consecutivas no mesmo MCP", async () => {
    resetMcpResilienceState();
    const clients = {
      eap: { listTools: async () => { throw new Error("MCP 503: indisponível"); } },
      cronograma: { listTools: async () => [] },
      ganttLob: { listTools: async () => [] },
    };
    await getConstructionMcpStatus("req-circuit-1", clients);
    await getConstructionMcpStatus("req-circuit-2", clients);
    await getConstructionMcpStatus("req-circuit-3", clients);
    const fourth = await getConstructionMcpStatus("req-circuit-4", clients);
    expect(fourth.servers.eap.attempts).toBe(0);
    expect(fourth.servers.eap.lastError).toContain("Circuit breaker aberto");
    resetMcpResilienceState();
  });
});

describe("runConstructionMcpHomologation", () => {
  it("executa uma consulta permitida por domínio com o ID correto", async () => {
    const calls: Array<{ domain: string; name: string; args: unknown }> = [];
    const result = await runConstructionMcpHomologation(
      {
        eap: "eap-123",
        cronograma: "cronograma-456",
        ganttLob: "lob-789",
      },
      "req-homologation-1",
      {
        eap: {
          listTools: async () => [{ name: "get_eap_tree" }],
          callTool: async (name, args) => {
            calls.push({ domain: "eap", name, args });
            return { content: [{ type: "text", text: "EAP OK" }] };
          },
        },
        cronograma: {
          listTools: async () => [{ name: "listar_atividades" }],
          callTool: async (name, args) => {
            calls.push({ domain: "cronograma", name, args });
            return { structuredContent: { activities: 3 } };
          },
        },
        ganttLob: {
          listTools: async () => [{ name: "listar_temas" }],
          callTool: async (name, args) => {
            calls.push({ domain: "ganttLob", name, args });
            return { content: [{ type: "text", text: "LOB OK" }] };
          },
        },
      }
    );

    expect(result.readOnly).toBe(true);
    expect(Object.values(result.servers).every(item => item.status === "passed")).toBe(
      true
    );
    expect(calls).toEqual([
      { domain: "eap", name: "get_eap_tree", args: { project_id: "eap-123" } },
      {
        domain: "cronograma",
        name: "listar_atividades",
        args: { project_id: "cronograma-456" },
      },
      { domain: "ganttLob", name: "listar_temas", args: {} },
    ]);
  });
});
describe("toCentralCommandMcpDomains", () => {
  it("preserva estado, latência, tentativas e ferramentas dos três MCPs", () => {
    const domains = toCentralCommandMcpDomains({
      status: "degraded",
      requestId: "req-central",
      checkedAt: "2026-10-09T00:00:00.000Z",
      durationMs: 42,
      servers: {
        eap: { status: "online", latencyMs: 10, attempts: 1, toolCount: 2, tools: ["get_eap_tree", "validar_estrutura"], lastError: null },
        cronograma: { status: "offline", latencyMs: 20, attempts: 2, toolCount: 0, tools: [], lastError: "MCP 503" },
        ganttLob: { status: "online", latencyMs: 12, attempts: 1, toolCount: 1, tools: ["calcular_linha_balanco"], lastError: null },
      },
    });

    expect(domains).toHaveLength(3);
    expect(domains.map(domain => domain.name)).toEqual([
      "EAP",
      "Cronograma",
      "Gantt / Linha de Balanço",
    ]);
    expect(domains.map(domain => domain.status)).toEqual([
      "online",
      "offline",
      "online",
    ]);
    expect(domains[1].lastError).toBe("MCP 503");
    expect(domains[1].attempts).toBe(2);
    expect(domains[0].tools).toContain("validar_estrutura");
  });
});
