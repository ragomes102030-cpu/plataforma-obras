import { and, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { agentMemories, agentRuns } from "../../drizzle/schema";

const MEMORY_CACHE_TTL_MS = 15_000;
type ArquimedesMemoryRecord = {
  id: number;
  projectId: number | null;
  scope: string;
  category: string;
  memoryKey: string;
  value: unknown;
  sourceType: string;
  sourceRef: string | null;
  confidence: string;
  status: string;
  updatedAt: Date;
};

const memoryRecallCache = new Map<string, { expiresAt: number; value: ArquimedesMemoryRecord[] }>();
import { getDb } from "../db";

export type ArquimedesMemorySource =
  | "engenheiro"
  | "obra"
  | "documento"
  | "mcp"
  | "pesquisa_externa"
  | "arquimedes"
  | "sistema";

export type ArquimedesMemoryInput = {
  projectId?: number | null;
  ownerUserId: number;
  scope: "project" | "client" | "library";
  category: string;
  memoryKey: string;
  value: unknown;
  sourceType: ArquimedesMemorySource | string;
  sourceRef?: string | null;
  confidence?: "high" | "medium" | "low";
};

function normalize(value: string, max: number) {
  return value.trim().slice(0, max);
}

/**
 * Pequena memória persistente do Arquimedes.
 *
 * V1 deliberadamente não tenta ser um banco vetorial. Ela guarda fatos,
 * decisões, propostas e pendências estruturadas e permite recuperação por
 * projeto + busca textual. A proveniência fica registrada junto da memória.
 */
export async function rememberArquimedes(input: ArquimedesMemoryInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para a memória do Arquimedes.");

  const memoryKey = normalize(input.memoryKey, 180);
  const category = normalize(input.category, 80);
  if (!memoryKey || !category) throw new Error("memoryKey e category são obrigatórios.");

  const projectId = input.projectId ?? null;
  const valueJson = JSON.stringify(input.value);

  const existing = await db
    .select({ id: agentMemories.id })
    .from(agentMemories)
    .where(
      projectId === null
        ? and(
            eq(agentMemories.ownerUserId, input.ownerUserId),
            eq(agentMemories.scope, input.scope),
            eq(agentMemories.memoryKey, memoryKey),
            ilike(agentMemories.category, category)
          )
        : and(
            eq(agentMemories.ownerUserId, input.ownerUserId),
            eq(agentMemories.projectId, projectId),
            eq(agentMemories.scope, input.scope),
            eq(agentMemories.memoryKey, memoryKey),
            ilike(agentMemories.category, category)
          )
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(agentMemories)
      .set({
        valueJson,
        sourceType: normalize(input.sourceType, 80),
        sourceRef: input.sourceRef ? normalize(input.sourceRef, 180) : null,
        confidence: input.confidence ?? "medium",
        status: "proposed",
        updatedAt: new Date(),
      })
      .where(eq(agentMemories.id, existing[0].id))
      .returning();
    invalidateMemoryRecallCache();
    return updated;
  }

  const [created] = await db
    .insert(agentMemories)
    .values({
      projectId,
      ownerUserId: input.ownerUserId,
      scope: input.scope,
      category,
      memoryKey,
      valueJson,
      sourceType: normalize(input.sourceType, 80),
      sourceRef: input.sourceRef ? normalize(input.sourceRef, 180) : null,
      confidence: input.confidence ?? "medium",
      status: "proposed",
    })
    .returning();

  invalidateMemoryRecallCache();
  return created;
}

export async function rememberArquimedesLearning(input: {
  ownerUserId: number;
  projectId?: number | null;
  learningKey: string;
  problem: string;
  evidence: string[];
  rule: string;
  scope?: "project" | "library";
  confidence?: "high" | "medium" | "low";
  regressionTest?: string | null;
  sourceRef?: string | null;
}) {
  return rememberArquimedes({
    projectId: input.projectId ?? null,
    ownerUserId: input.ownerUserId,
    scope: input.scope ?? (input.projectId ? "project" : "library"),
    category: "aprendizado",
    memoryKey: input.learningKey,
    value: {
      lifecycle: "candidate",
      problem: input.problem,
      evidence: input.evidence.slice(0, 12),
      rule: input.rule,
      regressionTest: input.regressionTest ?? null,
      recordedAt: new Date().toISOString(),
    },
    sourceType: "arquimedes",
    sourceRef: input.sourceRef ?? null,
    confidence: input.confidence ?? "medium",
  });
}


/**
 * Registra automaticamente a conversa operacional recebida pelo Arquimedes.
 *
 * Regra de continuidade: toda conversa sobre funcionamento, comportamento,
 * decisões, QA, arquitetura ou uso do sistema que chegar ao orquestrador deve
 * ficar recuperável no cérebro. O transcript é evidência histórica; não vira
 * regra validada nem autorização de mutação.
 */
export async function rememberArquimedesConversation(input: {
  ownerUserId: number;
  projectId?: number | null;
  taskId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  response?: string | null;
  sourceRef?: string | null;
}) {
  const scope = input.projectId ? "project" as const : "library" as const;
  const projectId = input.projectId ?? null;
  const transcript = input.messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
  const value = {
    kind: "operational_conversation",
    lifecycle: "historical",
    taskId: input.taskId,
    projectId,
    transcript,
    response: input.response ?? null,
    capturedAt: new Date().toISOString(),
    rule:
      "Use esta conversa como continuidade histórica. Separe fatos confirmados, hipóteses, propostas e regras validadas antes de reutilizar qualquer conteúdo.",
  };

  const remembered = await rememberArquimedes({
    projectId,
    ownerUserId: input.ownerUserId,
    scope,
    category: "conversa_sistema",
    memoryKey: `conversation-${input.taskId}`,
    value,
    sourceType: "engenheiro",
    sourceRef: input.sourceRef ?? input.taskId,
    confidence: "medium",
  });

  // Higiene: cada conversa vira uma linha; sem teto, a tabela cresce sem fim.
  // As mais antigas viram histórico (obsolete) — continuam no banco, saem do ativo.
  await pruneArquimedesConversations(input.ownerUserId, projectId);

  return remembered;
}

function toMemoryRecord(row: typeof agentMemories.$inferSelect): ArquimedesMemoryRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    scope: row.scope,
    category: row.category,
    memoryKey: row.memoryKey,
    value: parseJson(row.valueJson),
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    confidence: row.confidence,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

export const ARQUIMEDES_MEMORY_STATUSES = ["proposed", "approved", "rejected", "obsolete"] as const;
export type ArquimedesMemoryStatus = (typeof ARQUIMEDES_MEMORY_STATUSES)[number];

/**
 * Transições permitidas. Uma memória só nasce proposta; obsoleta é terminal.
 * Sem isto, tudo nasce "proposed" e nunca sai dele — o agente não distingue o que
 * o engenheiro já validou do que ainda é só uma hipótese.
 */
const ALLOWED_TRANSITIONS: Record<ArquimedesMemoryStatus, ArquimedesMemoryStatus[]> = {
  proposed: ["approved", "rejected", "obsolete"],
  approved: ["obsolete", "rejected"],
  rejected: ["approved", "obsolete"],
  obsolete: [],
};

/** Transição permitida entre dois status de memória (puro, testável sem banco). */
export function canTransitionMemoryStatus(from: string, to: ArquimedesMemoryStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from as ArquimedesMemoryStatus];
  return allowed ? allowed.includes(to) : false;
}

/** Move o ciclo de vida de uma memória (só o dono). */
export async function setArquimedesMemoryStatus(
  ownerUserId: number,
  memoryId: number,
  nextStatus: ArquimedesMemoryStatus
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para a memória do Arquimedes.");

  const [memory] = await db
    .select({ id: agentMemories.id, status: agentMemories.status })
    .from(agentMemories)
    .where(and(eq(agentMemories.id, memoryId), eq(agentMemories.ownerUserId, ownerUserId)))
    .limit(1);
  if (!memory) throw new Error("Memória do Arquimedes não encontrada.");

  if (!canTransitionMemoryStatus(memory.status, nextStatus)) {
    throw new Error(`Transição inválida de memória: ${memory.status} -> ${nextStatus}.`);
  }

  const [updated] = await db
    .update(agentMemories)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(agentMemories.id, memoryId))
    .returning();
  invalidateMemoryRecallCache();
  return updated;
}

/**
 * Lista as memórias do projeto (observabilidade do cérebro). Devolve tudo,
 * inclusive rejected/obsolete: o engenheiro precisa ver o que foi descartado.
 */
export async function listArquimedesMemories(
  ownerUserId: number,
  projectId?: number | null
) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(agentMemories)
    .where(
      projectId
        ? and(
            eq(agentMemories.ownerUserId, ownerUserId),
            or(eq(agentMemories.projectId, projectId), eq(agentMemories.scope, "library"))
          )
        : and(eq(agentMemories.ownerUserId, ownerUserId), eq(agentMemories.scope, "library"))
    )
    .orderBy(desc(agentMemories.updatedAt))
    .limit(200);
  return rows.map(toMemoryRecord);
}

/** Quantas conversas por obra ficam ativas; as mais antigas viram histórico. */
const MAX_CONVERSATIONS_PER_PROJECT = 50;

async function pruneArquimedesConversations(ownerUserId: number, projectId: number | null) {
  const db = await getDb();
  if (!db) return;
  const base = projectId
    ? and(eq(agentMemories.projectId, projectId), eq(agentMemories.category, "conversa_sistema"))
    : and(isNull(agentMemories.projectId), eq(agentMemories.category, "conversa_sistema"));

  const older = await db
    .select({ id: agentMemories.id })
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.ownerUserId, ownerUserId),
        base,
        ne(agentMemories.status, "obsolete")
      )
    )
    .orderBy(desc(agentMemories.updatedAt))
    .offset(MAX_CONVERSATIONS_PER_PROJECT)
    .limit(500);

  if (!older.length) return;
  await db
    .update(agentMemories)
    .set({ status: "obsolete", updatedAt: new Date() })
    .where(
      inArray(
        agentMemories.id,
        older.map(row => row.id)
      )
    );
  invalidateMemoryRecallCache();
}

async function recallArquimedesInternal(
  ownerUserId: number,
  projectId: number | undefined,
  query: string,
  limit = 10,
  excludeCategories: string[] = []
) {
  const db = await getDb();
  if (!db) return [];

  const q = normalize(query, 180);
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const projectFilter = projectId
    ? or(eq(agentMemories.projectId, projectId), eq(agentMemories.scope, "library"))
    : eq(agentMemories.scope, "library");

  const rows = await db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.ownerUserId, ownerUserId),
        projectFilter,
        ne(agentMemories.status, "obsolete"),
        ne(agentMemories.status, "rejected"),
        ...excludeCategories.map(category => ne(agentMemories.category, category)),
        q
          ? or(
              ilike(agentMemories.memoryKey, `%${q}%`),
              ilike(agentMemories.category, `%${q}%`),
              ilike(agentMemories.valueJson, `%${q}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(agentMemories.updatedAt))
    .limit(safeLimit);

  return rows.map(toMemoryRecord);
}

export async function recallArquimedes(
  ownerUserId: number,
  projectId: number | undefined,
  query: string,
  limit = 10,
  excludeCategories: string[] = []
) {
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const key = JSON.stringify([ownerUserId, projectId ?? null, normalize(query, 180), safeLimit, [...excludeCategories].sort()]);
  const cached = memoryRecallCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) memoryRecallCache.delete(key);
  const value = await recallArquimedesInternal(ownerUserId, projectId, query, safeLimit, excludeCategories);
  memoryRecallCache.set(key, { expiresAt: Date.now() + MEMORY_CACHE_TTL_MS, value });
  return value;
}

function invalidateMemoryRecallCache() {
  memoryRecallCache.clear();
}

export async function buildArquimedesMemoryContext(
  ownerUserId: number,
  projectId: number | undefined
) {
  const memories = await recallArquimedes(ownerUserId, projectId, "", 12, ["conversa_sistema", "historico_execucao"]);

  // Backfill de continuidade: antes da V1 do cérebro, análises já executadas
  // ficaram persistidas em agent_runs. Se ainda não houver memória estruturada,
  // recuperamos a última execução da mesma obra para não perder o trabalho
  // anterior. Isso é contexto de leitura, nunca autorização de mutação.
  if (!memories.length && projectId) {
    const db = await getDb();
    if (db) {
      const runs = await db
        .select({
          requestId: agentRuns.requestId,
          resultJson: agentRuns.resultJson,
          status: agentRuns.status,
          startedAt: agentRuns.startedAt,
        })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.projectId, projectId),
            eq(agentRuns.userId, ownerUserId)
          )
        )
        .orderBy(desc(agentRuns.startedAt))
        .limit(3);

      const persistedRuns = runs
        .filter(run => Boolean(run.resultJson))
        .map(run => ({
          requestId: run.requestId,
          status: run.status,
          startedAt: run.startedAt,
          result: parseJson(run.resultJson ?? ""),
        }));

      if (persistedRuns.length) {
        const latest = persistedRuns[0];
        const historicalValue = {
          requestId: latest.requestId,
          status: latest.status,
          startedAt: latest.startedAt.toISOString(),
          result: latest.result,
        };
        const compactValue = JSON.stringify(historicalValue).slice(0, 12000);

        try {
          await rememberArquimedes({
            projectId,
            ownerUserId,
            scope: "project",
            category: "historico_execucao",
            memoryKey: `legacy-run-${latest.requestId}`,
            value: parseJson(compactValue),
            sourceType: "sistema",
            sourceRef: latest.requestId,
            confidence: "medium",
          });
        } catch {
          // A continuidade histórica continua disponível mesmo se o backfill falhar.
        }

        return [
          "Memória persistente do Arquimedes: ainda não havia memória estruturada; uma execução anterior foi recuperada e registrada como contexto histórico.",
          "Trate esse histórico como evidência contextual, confirme contra os dados atuais e nunca use-o como autorização de mutação.",
          `[historico/${latest.status}] request=${latest.requestId} | iniciado=${latest.startedAt.toISOString()} | resultado=${compactValue}`,
        ].join("\n");
      }
    }
  }

  if (!memories.length) return "Memória persistente do Arquimedes: nenhuma memória relevante registrada.";

  const lines = memories.map(memory => {
    const value = typeof memory.value === "string"
      ? memory.value
      : JSON.stringify(memory.value);
    return [
      `[${memory.status}/${memory.confidence}]`,
      memory.category,
      memory.memoryKey,
      value,
      `fonte=${memory.sourceType}`,
    ].join(" | ");
  });

  return [
    "Memória persistente do Arquimedes. Use-a como evidência contextual, não como verdade absoluta.",
    ...lines,
  ].join("\n");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
