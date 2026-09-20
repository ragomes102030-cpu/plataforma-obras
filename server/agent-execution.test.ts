import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentExecutionStatus,
  resetAgentExecutionMemory,
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
                content: "Marco atual: descritivo.",
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
    expect(finished.result?.content).toContain("Marco atual");
  });

  it("classifica provider sem conteúdo final como dados incompletos", async () => {
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

    await expect(waitForTerminal("req-empty")).resolves.toMatchObject({
      status: "dados_incompletos",
      errorCode: "empty_final_response",
    });
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
});
