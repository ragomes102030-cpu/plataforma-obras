import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "../_core/env";
import { McpClient } from "./mcp-client";
import {
  callControlledMcpTool,
  callMutationMcpTool,
  callReadOnlyMcpTool,
  createConstructionMcpClients,
  createProjectConstructionMcpClients,
  validateProjectMcpEndpoint,
  isPublicMcpUrl,
  runConstructionMcpHomologation,
  getConstructionMcpStatus,
  MCP_TOOL_POLICY,
  resetMcpResilienceState,
} from "./construction-mcps";

/**
 * Os guards de política, escopo de projeto e "project_id default" rodam ANTES
 * de qualquer cliente MCP ser criado — por isso são testáveis sem rede. O
 * circuit breaker é testado com clientes falsos que sempre falham.
 *
 * A regra que estes testes protegem: um guard que nunca falha não é um guard.
 * Cada um tem o caso que DEVE disparar e o caso legítimo que NÃO deve.
 */

const originalMcpUrls = {
  eap: ENV.mcpEapUrl,
  cronograma: ENV.mcpCronogramaUrl,
  ganttLob: ENV.mcpGanttLobUrl,
};

afterEach(() => {
  resetMcpResilienceState();
  ENV.mcpEapUrl = originalMcpUrls.eap;
  ENV.mcpCronogramaUrl = originalMcpUrls.cronograma;
  ENV.mcpGanttLobUrl = originalMcpUrls.ganttLob;
});

describe("construction-mcps — domínios opcionais", () => {
  it("mantém domínios configurados quando outro MCP está sem URL", async () => {
    ENV.mcpEapUrl = "https://eap.example";
    ENV.mcpCronogramaUrl = "";
    ENV.mcpGanttLobUrl = "";

    const clients = createConstructionMcpClients();

    expect(clients.eap).toBeInstanceOf(McpClient);
    await expect(clients.cronograma.listTools()).rejects.toThrow(
      "URL do MCP não configurada"
    );
    await expect(clients.ganttLob.callTool("listar_temas")).rejects.toThrow(
      "URL do MCP não configurada"
    );
  });
});

describe("construction-mcps — política de ferramentas", () => {
  it("recusa ferramenta de escrita em modo somente leitura", async () => {
    await expect(callReadOnlyMcpTool("eap", "criar_eap_node", {})).rejects.toThrow(
      /não permitida em modo somente leitura/
    );
  });

  it("não confunde leitura com escrita na política", () => {
    // get_eap_tree é leitura; criar_eap_node é escrita. A interseção tem que ser vazia.
    expect(MCP_TOOL_POLICY.readOnly.has("get_eap_tree" as never)).toBe(true);
    expect(MCP_TOOL_POLICY.readOnly.has("criar_eap_node" as never)).toBe(false);
  });

  it("não barra leitura legítima na política (falha depois, na conexão)", async () => {
    await expect(callReadOnlyMcpTool("eap", "get_eap_tree", {})).rejects.not.toThrow(
      /não permitida em modo somente leitura/
    );
  });

  it("não barra mutação legítima com project_id válido (falha depois, na conexão)", async () => {
    await expect(
      callMutationMcpTool("eap", "criar_eap_node", { project_id: "obra-1" })
    ).rejects.not.toThrow(/exige project_id explícito|project_id default é bloqueado/);
  });

  it("exige project_id explícito para mutação com escopo de obra", async () => {
    await expect(
      callMutationMcpTool("eap", "criar_eap_node", {})
    ).rejects.toThrow(/exige project_id explícito/);
  });

  it("bloqueia o project_id 'default' em mutação real", async () => {
    await expect(
      callMutationMcpTool("eap", "criar_eap_node", { project_id: "default" })
    ).rejects.toThrow(/project_id default é bloqueado/);
  });

  it("recusa mutação que não é conhecida", async () => {
    await expect(
      callMutationMcpTool("eap", "ferramenta_inventada", { project_id: "obra-1" })
    ).rejects.toThrow(/não é uma mutação conhecida/);
  });

  it("recusa mutação fora da política de teste controlado", async () => {
    await expect(
      callControlledMcpTool("cronograma", "deletar_atividade", { project_id: "obra-1" })
    ).rejects.toThrow(/não liberada para teste controlado/);
  });

  it("bloqueia o project_id 'default' também no teste controlado", async () => {
    await expect(
      callControlledMcpTool("eap", "atualizar_projeto", { project_id: "default" })
    ).rejects.toThrow(/project_id default é bloqueado/);
  });
});

describe("construction-mcps — circuit breaker", () => {
  const failingClient = {
    listTools: async () => {
      throw new Error("timeout: MCP não respondeu");
    },
    callTool: async () => {
      throw new Error("timeout: MCP não respondeu");
    },
  };

  it("abre o circuito após falhas consecutivas e barra a tentativa seguinte", async () => {
    const clients = {
      eap: failingClient,
      cronograma: failingClient,
      ganttLob: failingClient,
    };

    // 3 falhas consecutivas abrem o circuito.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const status = await getConstructionMcpStatus(`cb-${attempt}`, clients);
      expect(status.status).toBe("offline");
      expect(status.servers.eap.lastError).not.toMatch(/[Cc]ircuit breaker/);
    }

    // A tentativa seguinte é barrada pelo circuito aberto, não por nova chamada.
    const blocked = await getConstructionMcpStatus("cb-4", clients);
    expect(blocked.servers.eap.lastError).toMatch(/[Cc]ircuit breaker/);
  });
});


describe("Aurora — endpoints públicos isolados por obra", () => {
  const allowed = {
    eap: "https://arquimedes-mcp-eap.vercel.app/public-mcp",
    cronograma: "https://arquimedes-mcp-cronograma.vercel.app/public-mcp",
    ganttLob: "https://arquimedes-mcp-gantt-lob.vercel.app/public-mcp",
  };

  it("não envia credenciais privadas a MCPs públicos", () => {
    expect(isPublicMcpUrl("https://arquimedes-mcp-eap.vercel.app/public-mcp")).toBe(true);
    expect(isPublicMcpUrl("https://arquimedes-mcp-eap.vercel.app/public-mcp/")).toBe(true);
    expect(isPublicMcpUrl("https://mcp-eap-server.onrender.com/mcp")).toBe(false);
  });

  it("aceita exclusivamente /public-mcp no host oficial de cada domínio", () => {
    const clients = createProjectConstructionMcpClients(allowed);
    expect(clients.eap).toBeInstanceOf(McpClient);
    expect(clients.cronograma).toBeInstanceOf(McpClient);
    expect(clients.ganttLob).toBeInstanceOf(McpClient);
    expect(validateProjectMcpEndpoint("eap", allowed.eap)).toBe(allowed.eap);
    for (const invalid of [
      "http://arquimedes-mcp-eap.vercel.app/public-mcp",
      "https://arquimedes-mcp-eap.vercel.app/mcp",
      "https://arquimedes-mcp-eap.vercel.app/public-mcp?x=1",
      "https://arquimedes-mcp-eap.vercel.app.evil.example/public-mcp",
      "https://localhost/public-mcp",
      "https://127.0.0.1/public-mcp",
      "https://user:pass@arquimedes-mcp-eap.vercel.app/public-mcp",
      allowed.cronograma,
    ]) {
      expect(() => validateProjectMcpEndpoint("eap", invalid)).toThrow(/Endpoint público não autorizado/);
    }
  });

  it("homologa os três motores com cálculos sintéticos válidos e sem project_id", async () => {
    const calls: Record<string, Record<string, unknown>> = {};
    const make = (tool: string, result: object) => ({
      listTools: async () => [{ name: tool }],
      callTool: async (_name: string, args: Record<string, unknown>) => {
        calls[tool] = args;
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      },
    });
    const clients = {
      eap: make("validar_estrutura_eap", { ok: true, total_nos: 3, erros: [], persistido: false }),
      cronograma: make("calcular_cpm_com_evidencia", { valid: true, duracao_projeto_dias: 5, persistido: false }),
      ganttLob: make("calcular_lob_com_vinculos", { total_tarefas: 2, persistido: false }),
    };
    const r = await runConstructionMcpHomologation({eap:"AURORA",cronograma:"AURORA",ganttLob:"AURORA"}, "qa-aurora",clients);
    expect(Object.values(r.servers).map(x => x.status)).toEqual(["passed", "passed", "passed"]);
    expect((calls.validar_estrutura_eap.nos as unknown[]).length).toBe(3);
    expect((calls.calcular_cpm_com_evidencia.dependencias as Array<{ tipo: string }>)[0].tipo).toBe("FS");
    expect((calls.calcular_lob_com_vinculos.dependencias as Array<{ tipo: string }>)[0].tipo).toBe("FS");
    expect(JSON.stringify(calls)).not.toContain("project_id");
  });

  it("não aprova um MCP que retorna diagnóstico inválido em HTTP 200", async () => {
    const failed = {
      listTools: async () => [{ name: "validar_estrutura_eap" }],
      callTool: async () => ({content:[{type:"text", text: JSON.stringify({ok:false,erros:["Pai inválido"]})}]}),
    };
    const ok = {
      listTools: async () => [{name: "calcular_cpm_com_evidencia"}],
      callTool: async () => ({content:[{type:"text", text: JSON.stringify({valid:true,persistido:false})}]}),
    };
    const result = await runConstructionMcpHomologation({eap:"QA",cronograma:"QA",ganttLob:"QA"}, "qa-failure", {
      eap:failed, cronograma:ok, ganttLob:{...ok,listTools:async()=>[{name:"calcular_lob_com_vinculos"}]},
    });
    expect(result.servers.eap.status).toBe("failed");
    expect(result.servers.cronograma.status).toBe("passed");
    expect(result.servers.ganttLob.status).toBe("passed");
  });
});
