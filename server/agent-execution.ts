import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AgentMessage, AgentProjectContext } from "./agent";
import { agentRunEvents, agentRuns, agentProjectStates, projectAuditEvents, type AgentRun } from "../drizzle/schema";
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

async function persistDiagnosticCheckpoint(
  db: RunDb,
  input: StartAgentExecutionInput,
  requestId: string,
  status: AgentRunStatus,
  result: OrchestratorResult | null,
  errorCode: string | null,
  errorMessage: string | null
) {
  const [state] = await db
    .select({ stage: agentProjectStates.stage, lastSummary: agentProjectStates.lastSummary })
    .from(agentProjectStates)
    .where(eq(agentProjectStates.projectId, input.projectId))
    .limit(1);

  const checkpoint = {
    type: "diagnostic_completion",
    requestId,
    status,
    stage: state?.stage ?? input.context.coordinator?.stage ?? "DESCRITIVO",
    summary: state?.lastSummary ?? input.context.coordinator?.lastSummary ?? null,
    blockerCount: input.context.coordinator?.blockerCount ?? null,
    openFindings: input.context.coordinator?.openFindings?.length ?? 0,
    approvedDecisions: input.context.coordinator?.approvedDecisions?.length ?? 0,
    formalProposalRecorded: false,
    changesApplied: false,
    readOnlyExecution: result?.readOnly ?? false,
    iterations: result?.iterations ?? 0,
    errorCode,
    errorMessage,
    recordedAt: new Date().toISOString(),
  };

  await db.insert(projectAuditEvents).values({
    projectId: input.projectId,
    userId: input.userId,
    action: "agent_diagnostic_checkpoint",
    payload: checkpoint,
  });
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Não foi possível serializar o contexto." });