import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AgentMessage, AgentProjectContext } from "./agent";
import { agentRunEvents, agentRuns, type AgentRun } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import {
  runProjectOrchestrator,
  type OrchestratorEvent,
  type OrchestratorDeps,
  type OrchestratorResult,
  type ToolDomain,
} from "./orchestrator";

export const AGENT_RUN_STATUSES = [
  "executando",
  "respondido",
  "falhou",
  "timeout",
  "aguardando_confirmacao",
  "dados_incompletos",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export type AgentRunView = {
  requestId: string;
  projectId: number;
  status: AgentRunStatus;
  currentStep: string | null;
  provider: string | null;
  model: string | null;
  iterations: number;
  startedAt: Date;
  finishedAt: Date | null;
  result: OrchestratorResult | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type RunDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type StartAgentExecutionInput = {
  db: RunDb | null | undefined;
  projectId: number;
  userId: number;
  context: AgentProjectContext;
  messages: AgentMessage[];
  mcpProjectIds: Partial<Record<ToolDomain, string>>;
  requestId?: string;
  deps?: OrchestratorDeps;
  totalTimeoutMs?: number;
};

type MemoryRun = AgentRunView & { userId: number };

const memoryRuns = new Map<string, MemoryRun>();
const TERMINAL_STATUSES = new Set<AgentRunStatus>([
  "respondido",
  "falhou",
  "timeout",
  "aguardando_confirmacao",
  "dados_incompletos",
]);

function isTerminal(status: AgentRunStatus) {
  return TERMINAL_STATUSES.has(status);
}

function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Não foi possível serializar o contexto." });
  }
}

function initialView(
  input: StartAgentExecutionInput,
  requestId: string,
  startedAt: Date
): AgentRunView {
  return {
    requestId,
    projectId: input.projectId,
    status: "executando",
    currentStep: "Preparando contexto da obra",
    provider: null,
    model: null,
    iterations: 0,
    startedAt,
    finishedAt: null,
    result: null,
    errorCode: null,
    errorMessage: null,
  };
}

function toView(row: AgentRun): AgentRunView {
  let result: OrchestratorResult | null = null;
  if (row.resultJson) {
    try {
      result = JSON.parse(row.resultJson) as OrchestratorResult;
    } catch {
      result = null;
    }
  }
  return {
    requestId: row.requestId,
    projectId: row.projectId,
    status: row.status,
    currentStep: row.currentStep,
    provider: row.provider,
    model: row.model,
    iterations: row.iterations,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    result,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

async function persistEvent(
  db: RunDb,
  input: StartAgentExecutionInput,
  requestId: string,
  event: OrchestratorEvent
) {
  await db.insert(agentRunEvents).values({
    requestId,
    projectId: input.projectId,
    userId: input.userId,
    eventType: event.type,
    eventJson: safeJson(event),
  });
}

function eventStep(event: OrchestratorEvent) {
  switch (event.type) {
    case "catalog_started":
      return "Consultando catálogo de ferramentas dos MCPs";
    case "catalog_loaded":
      return `Catálogo carregado (${event.toolCount} ferramentas de leitura)`;
    case "llm_started":
      return `Consultando o provider de IA${event.iteration ? ` · iteração ${event.iteration}` : ""}`;
    case "llm_response":
      return event.toolCallCount > 0
        ? `Provider solicitou ${event.toolCallCount} consulta(s) MCP`
        : "Resposta do provider recebida; validando conteúdo final";
    case "tool_started":
      return `Consultando MCP ${event.domain} · ${event.toolName}`;
    case "tool_finished":
      return event.status === "success"
        ? `Resposta recebida do MCP ${event.domain}`
        : `MCP ${event.domain} respondeu com erro controlado`;
    case "response_parsed":
      return "Resposta final validada";
    case "execution_failed":
      return "Execução encerrada com diagnóstico";
    default:
      return "Processando análise da obra";
  }
}

function classifyError(error: unknown) {
  const message = compactError(error);
  if (/timeout|tempo limite|excedeu o timeout/i.test(message)) {
    return {
      status: "timeout" as const,
      errorCode: "execution_timeout",
      message,
    };
  }
  if (/conteúdo final|resposta textual|sem conteúdo/i.test(message)) {
    return {
      status: "dados_incompletos" as const,
      errorCode: "empty_final_response",
      message,
    };
  }
  if (/contrato de leitura|faltam seções|pergunta inequívoca/i.test(message)) {
    return {
      status: "dados_incompletos" as const,
      errorCode: "readonly_response_contract",
      message,
    };
  }
  if (/confirmação|confirmacao/i.test(message)) {
    return {
      status: "aguardando_confirmacao" as const,
      errorCode: "confirmation_required",
      message,
    };
  }
  return {
    status: "falhou" as const,
    errorCode: "agent_execution_failed",
    message,
  };
}

async function updateMemoryRun(
  requestId: string,
  patch: Partial<AgentRunView>
) {
  const current = memoryRuns.get(requestId);
  if (!current) return;
  memoryRuns.set(requestId, { ...current, ...patch });
}

export async function startAgentExecution(input: StartAgentExecutionInput) {
  const requestId = input.requestId?.trim() || randomUUID();
  const startedAt = new Date();
  const view = initialView(input, requestId, startedAt);
  memoryRuns.set(requestId, { ...view, userId: input.userId });

  if (input.db) {
    await input.db.insert(agentRuns).values({
      requestId,
      projectId: input.projectId,
      userId: input.userId,
      status: "executando",
      currentStep: view.currentStep,
      contextJson: safeJson({
        context: input.context,
        messages: input.messages,
        mcpProjectIds: input.mcpProjectIds,
      }),
      startedAt,
    });
  }

  void executeAgentRun(input, requestId).catch(error => {
    console.error(
      JSON.stringify({
        evento: "agent_execution_unhandled_error",
        requestId,
        projectId: input.projectId,
        erro: compactError(error),
      })
    );
  });

  return view;
}

async function executeAgentRun(
  input: StartAgentExecutionInput,
  requestId: string
) {
  const db = input.db;
  let finalized = false;

  const update = async (patch: Partial<AgentRunView>) => {
    if (finalized) return;
    await updateMemoryRun(requestId, patch);
    if (!db) return;
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.currentStep !== undefined)
      dbPatch.currentStep = patch.currentStep;
    if (patch.provider !== undefined) dbPatch.provider = patch.provider;
    if (patch.model !== undefined) dbPatch.model = patch.model;
    if (patch.iterations !== undefined) dbPatch.iterations = patch.iterations;
    if (patch.result !== undefined)
      dbPatch.resultJson = patch.result ? safeJson(patch.result) : null;
    if (patch.errorCode !== undefined) dbPatch.errorCode = patch.errorCode;
    if (patch.errorMessage !== undefined)
      dbPatch.errorMessage = patch.errorMessage;
    if (patch.finishedAt !== undefined) dbPatch.finishedAt = patch.finishedAt;
    if (Object.keys(dbPatch).length > 0) {
      await db
        .update(agentRuns)
        .set(dbPatch)
        .where(eq(agentRuns.requestId, requestId));
    }
  };

  const emit = async (event: OrchestratorEvent) => {
    if (finalized) return;
    if (db) {
      try {
        await persistEvent(db, input, requestId, event);
      } catch (error) {
        console.warn(
          JSON.stringify({
            evento: "agent_run_event_persist_error",
            requestId,
            tipo: event.type,
            erro: compactError(error),
          })
        );
      }
    }
    await update({ currentStep: eventStep(event) });
  };

  const totalTimeoutMs =
    Number.isFinite(input.totalTimeoutMs) && input.totalTimeoutMs! > 0
      ? input.totalTimeoutMs!
      : Number.isFinite(ENV.agentTotalTimeoutMs) && ENV.agentTotalTimeoutMs > 0
        ? ENV.agentTotalTimeoutMs
        : 120_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const orchestration = runProjectOrchestrator(
      input.context,
      input.messages,
      {
        mcpProjectIds: input.mcpProjectIds,
        userId: input.userId,
        taskId: requestId,
        maxIterations: ENV.agentMaxIterations,
        onEvent: emit,
        deps: input.deps,
      }
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(
          new Error(
            `Execução do agente excedeu o timeout total de ${totalTimeoutMs}ms.`
          )
        );
      }, totalTimeoutMs);
    });
    const result = await Promise.race([orchestration, timeout]);
    if (timedOut || finalized) return;
    finalized = true;
    await updateMemoryRun(requestId, {
      status: result.status,
      currentStep: "Execução concluída",
      provider: result.provider ?? null,
      model: result.model,
      iterations: result.iterations,
      result,
      finishedAt: new Date(),
    });
    if (db) {
      await db
        .update(agentRuns)
        .set({
          status: result.status,
          currentStep: "Execução concluída",
          provider: result.provider ?? null,
          model: result.model,
          iterations: result.iterations,
          resultJson: safeJson(result),
          finishedAt: new Date(),
        })
        .where(eq(agentRuns.requestId, requestId));
    }
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (finalized) return;
    const classified = timedOut
      ? {
          status: "timeout" as const,
          errorCode: "execution_timeout",
          message: compactError(error),
        }
      : classifyError(error);
    await emit({
      type: "execution_failed",
      status: classified.status,
      errorCode: classified.errorCode,
      message: classified.message,
    });
    finalized = true;
    await updateMemoryRun(requestId, {
      status: classified.status,
      currentStep: "Execução encerrada com diagnóstico",
      errorCode: classified.errorCode,
      errorMessage: classified.message,
      finishedAt: new Date(),
    });
    if (db) {
      await db
        .update(agentRuns)
        .set({
          status: classified.status,
          currentStep: "Execução encerrada com diagnóstico",
          errorCode: classified.errorCode,
          errorMessage: classified.message,
          finishedAt: new Date(),
        })
        .where(eq(agentRuns.requestId, requestId));
    }
    console.error(
      JSON.stringify({
        evento: "agent_execution_finished",
        requestId,
        projectId: input.projectId,
        estado: classified.status,
        codigo: classified.errorCode,
        erro: classified.message,
      })
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getAgentExecutionStatus(
  db: RunDb | null | undefined,
  requestId: string,
  userId: number
): Promise<AgentRunView | null> {
  if (!db) {
    const run = memoryRuns.get(requestId);
    if (!run || run.projectId <= 0 || run.userId !== userId) return null;
    const { userId: _userId, ...view } = run;
    return view;
  }
  const [row] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.requestId, requestId), eq(agentRuns.userId, userId))
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  return row ? toView(row) : null;
}

export function isAgentRunTerminal(status: AgentRunStatus) {
  return isTerminal(status);
}

export function resetAgentExecutionMemory() {
  memoryRuns.clear();
}
