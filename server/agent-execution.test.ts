import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentExecutionStatus,
  getAgentExecutionMemorySizeForTest,
  resetAgentExecutionMemory,
  setAgentExecutionMemoryLimitForTest,
  startAgentExecution,
} from "./agent-execution";
import type { AgentProjectContext } from "./agent";

const context: AgentProjectContext = {
  project: {
    code: "TEST-EXEC",
    name: "Obra de execução",
    location: "São Paulo, SP",
    status: "Planejamento",
    progress: 0,
    plannedStart: "2026-01-01",
    plannedFinish: "2026-12-31",
  },
  activities: [],
};

const catalog = { eap: [], cronograma: [], ganttLob: [] };
const messages = [{ role: "user" as const, content: "Qual é o marco atual?" }];

async function waitForTerminal(requestId: string, userId = 7) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const status = await getAgentExecutionStatus(null, requestId, userId);
    if (
      status &&
      [
        "respondido",
        "falhou",
        "timeout",
        "aguardando_confirmacao",
        "dados_incompletos",
      ].includes(status.status)
    ) {
      return status;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("A execução não terminou no tempo do teste.");
}

afterEach(() => resetAgentExecutionMemory());

describe("agent-execution", () => {
  it("deixa o orçamento de rodadas ser escolhido pelo orquestrador", () => {
    const source = readFileSync(join(process.cwd(), "server/agent-execution.ts"), "utf8");
    expect(source).toContain("maxIterations: undefined");
    expect(source).toContain("orçamento adaptativo");
  });

  it("retorna request_id imediatamente e conclui por polling", async () => {
    const started = await startAgentExecution({
      db: null,
      projectId: 11,
      userId: 7,
      context,
      messages,
      mcpProjectIds: {},
      requestId: "req-success",
      deps: {
        listTools: async () => catalog,
        callLlm: async () => ({
          provider: "fake",
          model: "fake-model",
          choices: [
            {
              message: {
                role: "assistant",
                content:
                  "MARCO ATUAL\nLeitura inicial.\n\nEVIDÊNCIAS CONSULTADAS\nDados locais.\n\nPROPOSTA\nManter a leitura.\n\nEXEMPLOS/REFERÊNCIAS\nContexto da obra.\n\nDIVERGÊNCIAS E LACUNAS\nNenhuma bloqueadora.\n\nIMPACTO DE APROVAR\nNenhuma gravação será realizada.\n\nPRÓXIMA DECISÃO DO CLIENTE\nVocê aprova esta leitura?",
              },
            },
          ],
        }),
      },
    });

    expect(started).toMatchObject({
      requestId: "req-success",
      status: "executando",
      projectId: 11,
    });
    const finished = await waitForTerminal("req-success");
    expect(finished).toMatchObject({
      requestId: "req-success",
      status: "respondido",
      provider: "fake",
      model: "fake-model",
    });
    expect(finished.result?.content).toContain("MARCO ATUAL");
  });

  it("recupera resposta final vazia com uma mensagem honesta ao engenheiro", async () => {
    await startAgentExecution({
      db: null,
      projectId: 12,
      userId: 7,
      context,
      messages,
      mcpProjectIds: {},
      requestId: "req-empty",
      deps: {
        listTools: async () => catalog,
        callLlm: async () => ({
          provider: "fake",
          choices: [{ message: { role: "assistant", content: null } }],
        }),
      },
    });

    const finished = await waitForTerminal("req-empty");
    expect(finished).toMatchObject({
      status: "respondido",
      errorCode: null,
    });
    expect(finished.result?.content).toContain(
      "nenhuma alteração de EAP foi confirmada"
    );
  });

  it("encerra provider lento com timeout explícito", async () => {
    await startAgentExecution({
      db: null,
      projectId: 13,
      userId: 7,
      context,
      messages,
      mcpProjectIds: {},
      requestId: "req-timeout",
      totalTimeoutMs: 15,
      deps: {
        listTools: async () => catalog,
        callLlm: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return {
            choices: [{ message: { role: "assistant", content: "tarde" } }],
          };
        },
      },
    });

    await expect(waitForTerminal("req-timeout")).resolves.toMatchObject({
      status: "timeout",
      errorCode: "execution_timeout",
    });
  });

  it("expõe métricas da execução (duração, read-only, ferramentas, evidências)", async () => {
    await startAgentExecution({
      db: null,
      projectId: 40,
      userId: 7,
      context,
      messages,
      mcpProjectIds: { eap: "obra-1" },
      requestId: "req-metrics",
      deps: {
        listTools: async () => ({
          eap: [{ name: "get_eap_tree", description: "EAP", inputSchema: { type: "object", properties: {} } }],
          cronograma: [],
          ganttLob: [],
        }),
        callTool: async () => ({ content: [{ type: "text", text: "EAP" }] }),
        callLlm: async ({ messages }) => {
          if (messages.length === 2) {
            return {
              model: "fake",
              choices: [{
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [{ id: "t1", type: "function", function: { name: "get_eap_tree", arguments: "{}" } }],
                },
              }],
            };
          }
          return { model: "fake", choices: [{ message: { role: "assistant", content: "ok" } }] };
        },
      },
    });

    const finished = await waitForTerminal("req-metrics");
    expect(finished.status).toBe("respondido");
    expect(finished.readOnly).toBe(true);
    expect(finished.toolsConsulted).toContain("get_eap_tree");
    expect(typeof finished.durationMs).toBe("number");
    expect(finished.durationMs!).toBeGreaterThanOrEqual(0);
    expect(finished.evidenceCount).toBeGreaterThanOrEqual(0);
  });

  it("limita a memória de execuções (evita vazamento crescente)", async () => {
    setAgentExecutionMemoryLimitForTest(2);
    const requestIds: string[] = [];
    for (let index = 0; index < 3; index++) {
      const requestId = `req-cap-${index}`;
      await startAgentExecution({
        db: null,
        projectId: 30 + index,
        userId: 7,
        context,
        messages,
        mcpProjectIds: {},
        requestId,
        deps: {
          listTools: async () => catalog,
          callLlm: async () => ({
            provider: "fake",
            choices: [{ message: { role: "assistant", content: "ok" } }],
          }),
        },
      });
      requestIds.push(requestId);
    }
    expect(getAgentExecutionMemorySizeForTest()).toBeLessThanOrEqual(2);
    expect(await getAgentExecutionStatus(null, requestIds[0], 7)).toBeNull();
    expect(await getAgentExecutionStatus(null, requestIds[2], 7)).not.toBeNull();
  });
});
