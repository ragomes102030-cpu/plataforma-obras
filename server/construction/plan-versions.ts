import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
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
 *
 * A ADOÇÃO ESTÁ FORA DOS DOIS RAMOS, E ISSO É O PONTO.
 *
 * A primeira versão deste código era um `if (reuse) return {...}` seguido de
 * `associateOrphanPlanNodes`. O `return` vinha antes, e a adoção nunca rodava
 * quando a versão já existia — que é o caso de toda obra depois da primeira
 * edição. Os nós que nascem sem `versionId` (é assim que os três seeders
 * gravam: nenhum deles conhece versão, porque na criação da obra ela ainda não
 * existe) ficavam órfãos para sempre, e o painel reportava zero numa obra com
 * 117 nós.
 *
 * A adoção é idempotente — `WHERE "versionId" IS NULL` — e por isso roda nos
 * dois caminhos sem custo quando não há o que adotar. O que não pode é voltar
 * para dentro do `if`, porque a diferença entre os dois ramos é a versão
 * escolhida, não a necessidade de reconciliar.
 */
export async function ensureWritablePlanVersion(
  projectId: number,
  userId: number
): Promise<{ id: number; versionNumber: number; status: PlanVersionStatus }> {
  const db = requireDatabase(await getDb());
  const versions = await listPlanVersions(projectId);
  const decision = resolveWritablePlanVersion(versions);
  if (decision.kind === "reuse") {
    await associateOrphanPlanNodes(projectId, decision.version.id);
    return {
      id: decision.version.id,
      versionNumber: decision.version.versionNumber,
      status: decision.version.status,
    };
  }
  return db.transaction(async tx => {
    const [created] = await tx
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

    // Antes do fork, reconciliamos órfãos com a versão que realmente os
    // referencia. Uma atividade ainda pertencente à versão base não pode ficar
    // apontando para um WBS sem versão, porque o mapa de IDs do fork depende
    // dessa relação.
    if (decision.baseVersionId) {
      const atividadesDaBase = await tx
        .select({ wbsNodeId: scheduleActivities.wbsNodeId })
        .from(scheduleActivities)
        .where(
          and(
            eq(scheduleActivities.projectId, projectId),
            eq(scheduleActivities.versionId, decision.baseVersionId)
          )
        );
      const wbsReferenciados = [...new Set(atividadesDaBase.map(row => row.wbsNodeId))];
      if (wbsReferenciados.length > 0) {
        await tx
          .update(wbsNodes)
          .set({ versionId: decision.baseVersionId })
          .where(
            and(
              eq(wbsNodes.projectId, projectId),
              isNull(wbsNodes.versionId),
              inArray(wbsNodes.id, wbsReferenciados)
            )
          );
      }
    }

    // O restante dos órfãos pertence ao novo estado de trabalho.
    await tx
      .update(wbsNodes)
      .set({ versionId: created })
      .where(and(eq(wbsNodes.projectId, projectId), isNull(wbsNodes.versionId)));
    await tx
      .update(scheduleActivities)
      .set({ versionId: created })
      .where(and(eq(scheduleActivities.projectId, projectId), isNull(scheduleActivities.versionId)));
    await tx
      .update(scheduleDependencies)
      .set({ versionId: created })
      .where(and(eq(scheduleDependencies.projectId, projectId), isNull(scheduleDependencies.versionId)));

    // Uma reabertura é um FORK real: a versão aprovada continua intacta e a
    // nova versão recebe cópias próprias da EAP, atividades e dependências.
    // IDs mudam; os mapas abaixo preservam as referências entre os três níveis.
    if (decision.baseVersionId) {
      const baseNodes = await tx
        .select()
        .from(wbsNodes)
        .where(
          and(
            eq(wbsNodes.projectId, projectId),
            eq(wbsNodes.versionId, decision.baseVersionId)
          )
        )
        .orderBy(wbsNodes.level, wbsNodes.sortOrder, wbsNodes.id);

      const wbsIdMap = new Map<number, number>();
      for (const node of baseNodes) {
        const [inserted] = await tx
          .insert(wbsNodes)
          .values({
            projectId: node.projectId,
            externalId: node.externalId,
            externalUid: node.externalUid,
            parentId: node.parentId == null ? null : (wbsIdMap.get(node.parentId) ?? null),
            code: node.code,
            name: node.name,
            description: node.description,
            inclusions: node.inclusions,
            exclusions: node.exclusions,
            location: node.location,
            responsible: node.responsible,
            acceptanceCriteria: node.acceptanceCriteria,
            decompositionBasis: node.decompositionBasis,
            scopeStatus: node.scopeStatus,
            level: node.level,
            nodeType: node.nodeType,
            unit: node.unit,
            plannedQuantity: node.plannedQuantity,
            versionId: created,
            sortOrder: node.sortOrder,
          })
          .$returningIds();
        if (!inserted) throw new Error(`Falha ao clonar o nó EAP ${node.code}.`);
        wbsIdMap.set(node.id, inserted);
      }

      const baseActivities = await tx
        .select()
        .from(scheduleActivities)
        .where(
          and(
            eq(scheduleActivities.projectId, projectId),
            eq(scheduleActivities.versionId, decision.baseVersionId)
          )
        )
        .orderBy(scheduleActivities.sortOrder, scheduleActivities.id);

      const activityIdMap = new Map<number, number>();
      for (const activity of baseActivities) {
        const newWbsId = wbsIdMap.get(activity.wbsNodeId);
        if (!newWbsId) {
          throw new Error(`Atividade ${activity.name} sem nó EAP correspondente na versão base.`);
        }
        const [inserted] = await tx
          .insert(scheduleActivities)
          .values({
            projectId: activity.projectId,
            wbsNodeId: newWbsId,
            externalId: activity.externalId,
            eapRef: activity.eapRef,
            wbsCode: activity.wbsCode,
            name: activity.name,
            phase: activity.phase,
            pavimento: activity.pavimento,
            startOffset: activity.startOffset,
            durationDays: activity.durationDays,
            plannedQuantity: activity.plannedQuantity,
            unit: activity.unit,
            productivity: activity.productivity,
            budgetItemId: activity.budgetItemId,
            progress: activity.progress,
            exemplo: activity.exemplo,
            status: activity.status,
            critical: activity.critical,
            earlyStart: activity.earlyStart,
            earlyFinish: activity.earlyFinish,
            lateStart: activity.lateStart,
            lateFinish: activity.lateFinish,
            totalFloat: activity.totalFloat,
            freeFloat: activity.freeFloat,
            mustStartOn: activity.mustStartOn,
            finishNoLaterThan: activity.finishNoLaterThan,
            cpmCalculatedAt: activity.cpmCalculatedAt,
            versionId: created,
            sortOrder: activity.sortOrder,
          })
          .$returningIds();
        if (!inserted) throw new Error(`Falha ao clonar a atividade ${activity.name}.`);
        activityIdMap.set(activity.id, inserted);
      }

      const baseDependencies = await tx
        .select()
        .from(scheduleDependencies)
        .where(
          and(
            eq(scheduleDependencies.projectId, projectId),
            eq(scheduleDependencies.versionId, decision.baseVersionId)
          )
        );
      for (const dependency of baseDependencies) {
        const predecessorId = activityIdMap.get(dependency.predecessorId);
        const successorId = activityIdMap.get(dependency.successorId);
        if (!predecessorId || !successorId) {
          throw new Error("Dependência da versão base aponta para atividade ausente no fork.");
        }
        await tx.insert(scheduleDependencies).values({
          projectId: dependency.projectId,
          externalId: dependency.externalId,
          predecessorId,
          successorId,
          type: dependency.type,
          lag: dependency.lag,
          versionId: created,
        });
      }
    }

    // Compatibilidade com dados antigos: qualquer nó ainda órfão do projeto
    // entra na versão de trabalho. O fork acima nunca depende desse caminho.
    await tx
      .update(wbsNodes)
      .set({ versionId: created })
      .where(
        and(eq(wbsNodes.projectId, projectId), isNull(wbsNodes.versionId))
      );
    await tx
      .update(scheduleActivities)
      .set({ versionId: created })
      .where(
        and(eq(scheduleActivities.projectId, projectId), isNull(scheduleActivities.versionId))
      );
    await tx
      .update(scheduleDependencies)
      .set({ versionId: created })
      .where(
        and(eq(scheduleDependencies.projectId, projectId), isNull(scheduleDependencies.versionId))
      );

    return {
      id: created,
      versionNumber: decision.nextNumber,
      status: "draft" as const,
    };
  });
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

  // Uma obra pode ter somente uma versão vigente com status approved.
  // Aprovar uma nova versão não apaga o histórico: versões aprovadas anteriores
  // passam a superseded, preservando decisão, auditoria e rastreabilidade.
  await db
    .update(projectPlanVersions)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(
      and(
        eq(projectPlanVersions.projectId, projectId),
        eq(projectPlanVersions.status, "approved"),
        ne(projectPlanVersions.id, ensured.id)
      )
    );

  await db
    .update(projectPlanVersions)
    .set({ status: "approved", decisionId, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(projectPlanVersions.id, ensured.id));
  return { id: ensured.id, versionNumber: ensured.versionNumber };
}

export type PlanVersionDetail = PlanVersionSummary & {
  eapNodeCount: number;
  activityCount: number;
  dependencyCount: number;
  /**
   * Nós da obra — EAP, atividades e dependências — que NÃO pertencem a
   * nenhuma versão. Somados nas três tabelas, porque o gate só precisa saber
   * se existe trabalho fora de qualquer geração.
   *
   * ESTE CAMPO EXISTE PORQUE A AUSÊNCIA É O DEFEITO.
   *
   * Com `WHERE "versionId" IN (1, 2)`, uma linha com `versionId` nulo não é
   * filtrada: ela é INVISÍVEL. O `IN` devolve `UNKNOWN` para nulo, o `GROUP BY`
   * nunca produz o bucket `null`, e a contagem sai zero sem que nenhuma linha de
   * código precise mentir. O painel lia "EAP 0 nós" numa obra com 117, e o gate
   * tratava esse zero como obra vazia.
   *
   * Por isso a consulta AGORA PEDE os órfãos, com `isNull` ao lado do `IN`, e o
   * bucket `null` é contado em vez de descartado. Um zero explícito neste campo
   * troca a mentira pela lacuna, e lacuna é o que um gate consegue usar.
   */
  unversionedNodeCount: number;
};

/** Quantas linhas caem em cada versão, e quantas não caem em nenhuma. */
type ContagemPorVersao = {
  porVersao: Map<number, number>;
  semVersao: number;
};

function contarPorVersao(
  rows: { versionId: number | null; total: number }[]
): ContagemPorVersao {
  const porVersao = new Map<number, number>();
  let semVersao = 0;
  for (const row of rows) {
    if (row.versionId === null) {
      semVersao += Number(row.total);
      continue;
    }
    porVersao.set(row.versionId, Number(row.total));
  }
  return { porVersao, semVersao };
}

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
  // `or(isNull(...), inArray(...))`, e não só `inArray(...)`: o `or` é o que traz
  // os órfãos de volta. Sem ele nenhuma linha sem versão entra na contagem, e
  // uma obra inteira chega como zero — não como "não sei".
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
          or(isNull(wbsNodes.versionId), inArray(wbsNodes.versionId, ids))
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
          or(
            isNull(scheduleActivities.versionId),
            inArray(scheduleActivities.versionId, ids)
          )
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
          or(
            isNull(scheduleDependencies.versionId),
            inArray(scheduleDependencies.versionId, ids)
          )
        )
      )
      .groupBy(scheduleDependencies.versionId),
  ]);
  const eap = contarPorVersao(eapRows);
  const atividade = contarPorVersao(activityRows);
  const dependencia = contarPorVersao(dependencyRows);
  const unversionedNodeCount =
    eap.semVersao + atividade.semVersao + dependencia.semVersao;
  return versions.map(version => ({
    ...version,
    eapNodeCount: eap.porVersao.get(version.id) ?? 0,
    activityCount: atividade.porVersao.get(version.id) ?? 0,
    dependencyCount: dependencia.porVersao.get(version.id) ?? 0,
    unversionedNodeCount,
  }));
}