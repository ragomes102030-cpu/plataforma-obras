import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  projectPlanVersions,
  scheduleActivities,
  scheduleDependencies,
  wbsNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type PlanVersionStatus = "draft" | "proposed" | "approved" | "superseded";

export type PlanVersionSummary = {
  id: number;
  versionNumber: number;
  status: PlanVersionStatus;
  baseVersionId: number | null;
  decisionId: number | null;
  approvedAt: Date | null;
};

export type WritableVersionDecision =
  | { kind: "create"; nextNumber: number; baseVersionId: number | null }
  | { kind: "reuse"; version: PlanVersionSummary };

/**
 * Regra do "estado de trabalho" do plano:
 * - sem nenhuma versão           -> cria v1 (baseVersionId null)
 * - última draft/proposed        -> reutiliza (trabalho em curso)
 * - última approved/superseded   -> cria v+1 draft (reabertura), base = versão atual
 *
 * A versão identifica a GERAÇÃO dos nós (EAP/atividades/dependências):
 * o versionId é fixado na criação do nó; edições de atributos não trocam o nó
 * de versão. Aprovação congela a versão corrente (approvedAt + decisionId).
 */
export function resolveWritablePlanVersion(
  versions: PlanVersionSummary[]
): WritableVersionDecision {
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
  const last = sorted.at(-1) ?? null;
  if (!last) return { kind: "create", nextNumber: 1, baseVersionId: null };
  if (last.status === "draft" || last.status === "proposed") {
    return { kind: "reuse", version: last };
  }
  return {
    kind: "create",
    nextNumber: last.versionNumber + 1,
    baseVersionId: last.id,
  };
}

function requireDatabase<T>(db: T | null): T {
  if (!db) {
    throw new Error(
      "Banco local indisponível; DATABASE_URL não configurada ou conexão não criada."
    );
  }
  return db;
}

async function listPlanVersions(projectId: number): Promise<PlanVersionSummary[]> {
  const db = requireDatabase(await getDb());
  const rows = await db
    .select({
      id: projectPlanVersions.id,
      versionNumber: projectPlanVersions.versionNumber,
      status: projectPlanVersions.status,
      baseVersionId: projectPlanVersions.baseVersionId,
      decisionId: projectPlanVersions.decisionId,
      approvedAt: projectPlanVersions.approvedAt,
    })
    .from(projectPlanVersions)
    .where(eq(projectPlanVersions.projectId, projectId))
    .orderBy(desc(projectPlanVersions.versionNumber));
  return rows;
}

/**
 * Associa nós órfãos (criados antes do versionamento) à versão informada.
 * Preserva os dados existentes: a primeira versão criada absorve todo o
 * plano atual do projeto.
 */
export async function associateOrphanPlanNodes(
  projectId: number,
  versionId: number
): Promise<void> {
  const db = requireDatabase(await getDb());
  await db
    .update(wbsNodes)
    .set({ versionId })
    .where(
      and(eq(wbsNodes.projectId, projectId), isNull(wbsNodes.versionId))
    );
  await db
    .update(scheduleActivities)
    .set({ versionId })
    .where(
      and(
        eq(scheduleActivities.projectId, projectId),
        isNull(scheduleActivities.versionId)
      )
    );
  await db
    .update(scheduleDependencies)
    .set({ versionId })
    .where(
      and(
        eq(scheduleDependencies.projectId, projectId),
        isNull(scheduleDependencies.versionId)
      )
    );
}

/**
 * Garante uma versão gravável (draft/proposed) para o estado de trabalho do
 * projeto, criando-a conforme a regra de reabertura quando necessário.
 * Sempre associa os nós órfãos à versão retornada.
 */
export async function ensureWritablePlanVersion(
  projectId: number,
  userId: number
): Promise<{ id: number; versionNumber: number; status: PlanVersionStatus }> {
  const db = requireDatabase(await getDb());
  const versions = await listPlanVersions(projectId);
  const decision = resolveWritablePlanVersion(versions);
  if (decision.kind === "reuse") {
    return {
      id: decision.version.id,
      versionNumber: decision.version.versionNumber,
      status: decision.version.status,
    };
  }
  const [created] = await db
    .insert(projectPlanVersions)
    .values({
      projectId,
      versionNumber: decision.nextNumber,
      status: "draft",
      baseVersionId: decision.baseVersionId,
      createdBy: userId,
      notes: null,
    })
    .$returningIds();
  if (!created) {
    throw new Error("Não foi possível criar uma versão do plano.");
  }
  await associateOrphanPlanNodes(projectId, created);
  return {
    id: created,
    versionNumber: decision.nextNumber,
    status: "draft",
  };
}

/**
 * Congela a versão gravável atual como aprovada e vincula a decisão que a
 * aprovou. É o ponto que responde "qual EAP, quais atividades e quais
 * dependências foram aprovadas?".
 */
export async function approveCurrentPlanVersion(
  projectId: number,
  decisionId: number,
  userId: number
): Promise<{ id: number; versionNumber: number }> {
  const ensured = await ensureWritablePlanVersion(projectId, userId);
  const db = requireDatabase(await getDb());
  await db
    .update(projectPlanVersions)
    .set({ status: "approved", decisionId, approvedAt: new Date() })
    .where(eq(projectPlanVersions.id, ensured.id));
  return { id: ensured.id, versionNumber: ensured.versionNumber };
}

export type PlanVersionDetail = PlanVersionSummary & {
  eapNodeCount: number;
  activityCount: number;
  dependencyCount: number;
};

/**
 * Lista as versões do plano com a contagem de nós de cada uma — alimenta o
 * painel de gate ("versão 3 aprovada · EAP 12 nós · 18 atividades").
 */
export async function listPlanVersionDetails(
  projectId: number
): Promise<PlanVersionDetail[]> {
  const versions = await listPlanVersions(projectId);
  if (versions.length === 0) return [];
  const ids = versions.map(version => version.id);
  const db = requireDatabase(await getDb());
  const [eapRows, activityRows, dependencyRows] = await Promise.all([
    db
      .select({
        versionId: wbsNodes.versionId,
        total: sql<number>`COUNT(*)`,
      })
      .from(wbsNodes)
      .where(
        and(
          eq(wbsNodes.projectId, projectId),
          inArray(wbsNodes.versionId, ids)
        )
      )
      .groupBy(wbsNodes.versionId),
    db
      .select({
        versionId: scheduleActivities.versionId,
        total: sql<number>`COUNT(*)`,
      })
      .from(scheduleActivities)
      .where(
        and(
          eq(scheduleActivities.projectId, projectId),
          inArray(scheduleActivities.versionId, ids)
        )
      )
      .groupBy(scheduleActivities.versionId),
    db
      .select({
        versionId: scheduleDependencies.versionId,
        total: sql<number>`COUNT(*)`,
      })
      .from(scheduleDependencies)
      .where(
        and(
          eq(scheduleDependencies.projectId, projectId),
          inArray(scheduleDependencies.versionId, ids)
        )
      )
      .groupBy(scheduleDependencies.versionId),
  ]);
  const countBy = (
    rows: { versionId: number | null; total: number }[]
  ): Map<number, number> => {
    const map = new Map<number, number>();
    for (const row of rows) {
      if (row.versionId !== null) map.set(row.versionId, Number(row.total));
    }
    return map;
  };
  const eapCount = countBy(eapRows);
  const activityCount = countBy(activityRows);
  const dependencyCount = countBy(dependencyRows);
  return versions.map(version => ({
    ...version,
    eapNodeCount: eapCount.get(version.id) ?? 0,
    activityCount: activityCount.get(version.id) ?? 0,
    dependencyCount: dependencyCount.get(version.id) ?? 0,
  }));
}