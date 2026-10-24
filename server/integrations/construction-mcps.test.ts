import { afterEach, describe, expect, it } from "vitest";
import {
  callControlledMcpTool,
  callMutationMcpTool,
  callReadOnlyMcpTool,
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

afterEach(() => resetMcpResilienceState());

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
