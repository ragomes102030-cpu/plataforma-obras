import { and, desc, eq, ilike, or, ne } from "drizzle-orm";
import { agentMemories } from "../../drizzle/schema";
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

  return created;
}

export async function recallArquimedes(
  ownerUserId: number,
  projectId: number | undefined,
  query: string,
  limit = 10
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

  return rows.map(row => ({
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
  }));
}

export async function buildArquimedesMemoryContext(
  ownerUserId: number,
  projectId: number | undefined
) {
  const memories = await recallArquimedes(ownerUserId, projectId, "", 12);
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
