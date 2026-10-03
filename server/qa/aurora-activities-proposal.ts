import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  agentFindings,
  agentProjectStates,
  projectAuditEvents,
  projects,
  scheduleActivities,
  wbsNodes,
  users,
} from "../../drizzle/schema";
import { ensureWritablePlanVersion } from "../construction/plan-versions";

export async function runAuroraActivitiesProposal(): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado.");

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(users.id)
    .limit(1);
  if (!owner) throw new Error("Nenhum usuário disponível para a Aurora Teste.");

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.code, "OB-PUPOCN"))
    .limit(1);
  if (!project) throw new Error("Obra OB-PUPOCN — AURORA TESTE não encontrada.");

  const writable = await ensureWritablePlanVersion(project.id, owner.id);

  const nodes = await db
    .select()
    .from(wbsNodes)
    .where(and(eq(wbsNodes.projectId, project.id), eq(wbsNodes.versionId, writable.id)))
    .orderBy(wbsNodes.level, wbsNodes.sortOrder, wbsNodes.id);

  const childIds = new Set(
    nodes
      .map(node => node.parentId)
      .filter((id): id is number => id !== null)
  );
  const leaves = nodes.filter(node => !childIds.has(node.id));

  const existing = await db
    .select({
      id: scheduleActivities.id,
      eapRef: scheduleActivities.eapRef,
    })
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.projectId, project.id), eq(scheduleActivities.versionId, writable.id)));

  const existingRefs = new Set(existing.map(row => row.eapRef).filter((v): v is string => Boolean(v)));

  const byId = new Map(nodes.map(node => [node.id, node]));
  const missingLeaves = leaves.filter(leaf => !existingRefs.has(leaf.code));

  let created = 0;
  let reused = existing.length;

  const [last] = await db
    .select({ sortOrder: scheduleActivities.sortOrder })
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.projectId, project.id), eq(scheduleActivities.versionId, writable.id)))
    .orderBy(scheduleActivities.sortOrder)
    .limit(1);

  let nextSort = last?.sortOrder ?? -1;

  for (const leaf of missingLeaves) {
    const parent = leaf.parentId == null ? null : byId.get(leaf.parentId);
    nextSort += 1;

    await db.insert(scheduleActivities).values({
      projectId: project.id,
      wbsNodeId: leaf.id,
      externalId: leaf.code,
      eapRef: leaf.code,
      wbsCode: leaf.code,
      name: leaf.name,
      phase: parent?.name ?? leaf.name,
      pavimento: leaf.location ?? null,
      startOffset: 0,
      durationDays: 0,
      plannedQuantity: leaf.plannedQuantity ?? null,
      unit: leaf.unit ?? null,
      productivity: null,
      budgetItemId: null,
      progress: 0,
      exemplo: 0,
      status: "Não iniciado",
      critical: 0,
      versionId: writable.id,
      sortOrder: nextSort,
    });
    created += 1;
  }

  const [state] = await db
    .select()
    .from(agentProjectStates)
    .where(eq(agentProjectStates.projectId, project.id))
    .limit(1);

  const summary =
    `Aurora: proposta de atividades registrada. EAP ${leaves.length} folhas → ${created} atividades novas na versão ${writable.versionNumber}. Duração/início permanecem não planejados (0/0) até evidência de prazo; não avançar para DEPENDENCIAS_PROPOSTA.`;

  if (state) {
    await db
      .update(agentProjectStates)
      .set({
        stage: "ATIVIDADES_PROPOSTA",
        blockerCount: 1,
        lastSummary: summary,
        updatedAt: new Date(),
      })
      .where(eq(agentProjectStates.projectId, project.id));
  }

  const [openFinding] = await db
    .select({ id: agentFindings.id })
    .from(agentFindings)
    .where(
      and(
        eq(agentFindings.projectId, project.id),
        eq(agentFindings.stage, "ATIVIDADES_PROPOSTA"),
        eq(agentFindings.entityType, "schedule"),
        eq(agentFindings.status, "open")
      )
    )
    .limit(1);

  if (!openFinding) {
    await db.insert(agentFindings).values({
      projectId: project.id,
      stage: "ATIVIDADES_PROPOSTA",
      classification: "blocker",
      entityType: "schedule",
      entityRef: `plan-version-${writable.id}`,
      sourceJson: JSON.stringify({
        source: "aurora_engineer_test",
        rule: "activity_without_duration_is_missing_data",
        evidence: { leafCount: leaves.length, activityCount: existing.length + created },
      }),
      originalValueJson: JSON.stringify({ startOffset: 0, durationDays: 0 }),
      proposedValueJson: null,
      description: `${leaves.length} folhas da EAP foram convertidas em atividades da proposta, mas nenhuma recebeu prazo. Zero dias representa ausência de planejamento, não duração válida.`,
      impact: "Impede DEPENDENCIAS_PROPOSTA, CPM e cronograma até que início/duração sejam fundamentados.",
      confidence: "high",
      status: "open",
    });
  }

  await db.insert(projectAuditEvents).values({
    projectId: project.id,
    userId: owner.id,
    action: "aurora_activities_proposed",
    payload: {
      projectCode: project.code,
      planVersionId: writable.id,
      planVersionNumber: writable.versionNumber,
      eapLeaves: leaves.length,
      activitiesExistingBefore: existing.length,
      activitiesCreated: created,
      durationPolicy: "0 means missing data; never interpreted as one day",
      nextRequiredEvidence: "real or validated planned start and duration per activity",
      stageRemains: "ATIVIDADES_PROPOSTA",
      changesToApprovedVersion: false,
    },
  });

  return {
    projectId: project.id,
    projectCode: project.code,
    versionId: writable.id,
    versionNumber: writable.versionNumber,
    eapLeaves: leaves.length,
    activitiesExistingBefore: existing.length,
    activitiesCreated: created,
    totalActivities: existing.length + created,
    activitiesPlanned: 0,
    stage: "ATIVIDADES_PROPOSTA",
    blocker: "duration_missing",
  };
}
