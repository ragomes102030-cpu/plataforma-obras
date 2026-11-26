import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activityScheduleUpdates,
  projectAuditEvents,
  projectPlanVersions,
  projects,
  productionEntries,
  scheduleActivities,
  users,
  wbsNodes,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

const estado = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", async importOriginal => ({
  ...await importOriginal<typeof import("./db")>(),
  getDb: async () => estado.db,
}));
const { appRouter } = await import("./routers");

let pg: PGlite | undefined;
afterEach(async () => {
  await pg?.close();
  pg = undefined;
  estado.db = null;
});

function contexto(user: { id: number; openId: string; name: string }): TrpcContext {
  return { user: user as TrpcContext["user"], req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

async function preparar() {
  pg = await pgliteComSchema();
  const db = drizzle(pg);
  estado.db = db;
  const [owner] = await db.insert(users).values({ openId: "activity-update-owner", name: "Planejadora" }).returning();
  const [project] = await db.insert(projects).values({
    ownerUserId: owner.id,
    code: "ACTIVITY-UPDATE-QA",
    name: "Obra de teste por prazo",
    location: "Fortaleza",
    plannedStart: null,
    plannedFinish: null,
  }).returning();
  const [oldVersion] = await db.insert(projectPlanVersions).values({ projectId: project.id, versionNumber: 1, status: "superseded" }).returning();
  const [currentVersion] = await db.insert(projectPlanVersions).values({ projectId: project.id, versionNumber: 2, status: "approved" }).returning();
  const [oldNode] = await db.insert(wbsNodes).values({ projectId: project.id, versionId: oldVersion.id, code: "1", name: "Pacote antigo", level: 1, nodeType: "pacote" }).returning();
  const [currentNode] = await db.insert(wbsNodes).values({ projectId: project.id, versionId: currentVersion.id, code: "1", name: "Pacote atual", level: 1, nodeType: "pacote" }).returning();
  const [oldActivity] = await db.insert(scheduleActivities).values({
    projectId: project.id, versionId: oldVersion.id, wbsNodeId: oldNode.id,
    wbsCode: "1", name: "Atividade histórica", phase: "Execução", startOffset: 0, durationDays: 5,
  }).returning();
  const [currentActivity] = await db.insert(scheduleActivities).values({
    projectId: project.id, versionId: currentVersion.id, wbsNodeId: currentNode.id,
    wbsCode: "1", name: "Atividade atual", phase: "Execução", startOffset: 0, durationDays: 5,
  }).returning();
  const caller = appRouter.createCaller(contexto(owner));
  return { db, owner, project, oldActivity, currentActivity, currentVersion, caller };
}

describe("acompanhamento temporal por atividade", () => {
  it("preserva correções no histórico e não cria produção nem altera o plano aprovado", async () => {
    const { db, project, currentActivity, currentVersion, caller } = await preparar();
    const first = await caller.planning.registerActivityScheduleUpdate({
      projectId: project.id,
      activityId: currentActivity.id,
      positionDate: "2026-11-20",
      status: "em_andamento",
      actualStartDate: "2026-11-18",
      forecastFinishDate: "2026-12-01",
      note: "Equipe mobilizada; previsão revisada.",
      evidenceRef: "diario://2026-11-20/atividade-1",
    });
    expect(first).toMatchObject({ recorded: true });

    const correction = await caller.planning.registerActivityScheduleUpdate({
      projectId: project.id,
      activityId: currentActivity.id,
      positionDate: "2026-11-21",
      status: "bloqueada",
      blockerReason: "Aguardando liberação do projeto executivo.",
      note: "Correção do estado informado no dia anterior.",
      correctsUpdateId: first.id,
    });

    const history = await caller.planning.activityScheduleUpdates({ projectId: project.id, activityId: currentActivity.id });
    expect(history.history).toHaveLength(2);
    expect(history.history.find(item => item.id === first.id)).toMatchObject({ vigente: false, corrigivel: false });
    expect(history.current).toMatchObject({ id: correction.id, status: "bloqueada", blockerReason: "Aguardando liberação do projeto executivo.", authorName: "Planejadora" });

    await caller.planning.registerActivityScheduleUpdate({
      projectId: project.id,
      activityId: currentActivity.id,
      positionDate: "2026-11-25",
      status: "em_andamento",
      actualStartDate: "2026-11-18",
      forecastFinishDate: "2026-11-25",
    });
    const summary = await caller.planning.activityScheduleStatusSummary({ projectId: project.id, asOf: "2026-11-26" });
    expect(summary).toMatchObject({
      versionId: currentVersion.id,
      totalActivities: 1,
      activitiesWithUpdate: 1,
      activitiesWithoutUpdate: 0,
      overdueCount: 1,
      statusCounts: { nao_iniciada: 0, em_andamento: 1, concluida: 0, bloqueada: 0 },
    });
    expect(await db.select().from(productionEntries)).toHaveLength(0);
    expect((await db.select().from(scheduleActivities).where(eq(scheduleActivities.id, currentActivity.id)))[0]).toMatchObject({ progress: 0 });
    expect((await db.select().from(projectPlanVersions).where(eq(projectPlanVersions.id, currentVersion.id)))[0]).toMatchObject({ status: "approved", versionNumber: 2 });
    expect(await db.select().from(activityScheduleUpdates)).toHaveLength(3);
    expect(await db.select().from(projectAuditEvents)).toHaveLength(3);
  });

  it("invalida um relato sem registrá-lo como não iniciado nem criar produção", async () => {
    const { db, project, currentActivity, currentVersion, caller } = await preparar();
    const update = await caller.planning.registerActivityScheduleUpdate({
      projectId: project.id,
      activityId: currentActivity.id,
      positionDate: "2026-11-20",
      status: "em_andamento",
      actualStartDate: "2026-11-18",
      remainingDurationDays: 2,
      note: "Registro de cenário sem diário de obra.",
    });

    const invalidation = await caller.planning.invalidateActivityScheduleUpdate({
      projectId: project.id,
      activityId: currentActivity.id,
      updateId: update.id,
      reason: "Registro de cenário sem evidência de campo.",
    });

    const history = await caller.planning.activityScheduleUpdates({
      projectId: project.id,
      activityId: currentActivity.id,
    });
    expect(invalidation).toMatchObject({ invalidated: true });
    expect(history.current).toBeNull();
    expect(history.history).toHaveLength(2);
    expect(history.history.find(item => item.id === invalidation.id)).toMatchObject({
      status: "relato_invalidado",
      vigente: false,
      corrigivel: false,
      note: "Registro de cenário sem evidência de campo.",
    });
    expect(history.history.find(item => item.id === update.id)).toMatchObject({
      vigente: false,
      corrigivel: false,
    });

    const summary = await caller.planning.activityScheduleStatusSummary({
      projectId: project.id,
      asOf: "2026-11-26",
    });
    expect(summary).toMatchObject({
      versionId: currentVersion.id,
      totalActivities: 1,
      activitiesWithUpdate: 0,
      activitiesWithoutUpdate: 1,
      statusCounts: { nao_iniciada: 0, em_andamento: 0, concluida: 0, bloqueada: 0 },
    });
    expect(await db.select().from(productionEntries)).toHaveLength(0);
    expect(await db.select().from(activityScheduleUpdates)).toHaveLength(2);
    expect(await db.select().from(projectAuditEvents)).toHaveLength(2);
  });

  it("bloqueia versão substituída, campos incompletos e data de posição futura", async () => {
    const { project, oldActivity, currentActivity, caller } = await preparar();
    await expect(caller.planning.registerActivityScheduleUpdate({
      projectId: project.id, activityId: oldActivity.id, positionDate: "2026-11-20", status: "nao_iniciada",
    })).rejects.toThrow(/versão operacional atual/i);
    await expect(caller.planning.registerActivityScheduleUpdate({
      projectId: project.id, activityId: currentActivity.id, positionDate: "2026-11-20", status: "em_andamento",
    })).rejects.toThrow(/início real/i);
    await expect(caller.planning.registerActivityScheduleUpdate({
      projectId: project.id, activityId: currentActivity.id, positionDate: "2999-01-01", status: "nao_iniciada",
    })).rejects.toThrow(/não pode estar no futuro/i);
    expect(await caller.planning.activityScheduleUpdates({ projectId: project.id, activityId: currentActivity.id })).toMatchObject({ current: null, history: [] });
    expect(await caller.planning.activityScheduleStatusSummary({ projectId: project.id })).toMatchObject({ activitiesWithUpdate: 0, activitiesWithoutUpdate: 1 });
  });

  it("impede consultar e atualizar atividade de outra obra", async () => {
    const { db, owner, project, caller } = await preparar();
    const [otherOwner] = await db.insert(users).values({ openId: "activity-update-other-owner", name: "Outra pessoa" }).returning();
    const [otherProject] = await db.insert(projects).values({ ownerUserId: otherOwner.id, code: "OUTRA-OBRA", name: "Outra obra", location: "Local" }).returning();
    const [otherVersion] = await db.insert(projectPlanVersions).values({ projectId: otherProject.id, versionNumber: 1, status: "approved" }).returning();
    const [otherNode] = await db.insert(wbsNodes).values({ projectId: otherProject.id, versionId: otherVersion.id, code: "1", name: "Pacote", level: 1, nodeType: "pacote" }).returning();
    const [otherActivity] = await db.insert(scheduleActivities).values({
      projectId: otherProject.id, versionId: otherVersion.id, wbsNodeId: otherNode.id,
      wbsCode: "1", name: "Atividade externa", phase: "Execução", startOffset: 0, durationDays: 1,
    }).returning();

    await expect(caller.planning.activityScheduleUpdates({ projectId: otherProject.id, activityId: otherActivity.id })).rejects.toThrow(/sem permissão/i);
    await expect(caller.planning.registerActivityScheduleUpdate({
      projectId: project.id, activityId: otherActivity.id, positionDate: "2026-11-20", status: "nao_iniciada",
    })).rejects.toThrow(/não encontrada nesta obra/i);
    expect(owner.id).not.toBe(otherOwner.id);
    expect(await db.select().from(activityScheduleUpdates)).toHaveLength(0);
  });

  it("registra justificativa fora da LOB sem invalidar CPM e mantém a pendência apenas no domínio de LOB", async () => {
    const { db, project, currentActivity, caller } = await preparar();
    const [before] = await db.select().from(scheduleActivities).where(eq(scheduleActivities.id, currentActivity.id));
    await expect(caller.planning.setActivityLobApplicability({
      projectId: project.id, activityId: currentActivity.id, applicability: "fora_lob", reason: "Curva de concretagem pontual, sem repetição por pavimento.",
    })).resolves.toMatchObject({ applicability: "fora_lob", reason: "Curva de concretagem pontual, sem repetição por pavimento." });
    await expect(caller.planning.setActivityLobApplicability({
      projectId: project.id, activityId: currentActivity.id, applicability: "fora_lob", reason: "Pontual",
    })).rejects.toThrow(/mínimo de 12 caracteres/i);

    const [after] = await db.select().from(scheduleActivities).where(eq(scheduleActivities.id, currentActivity.id));
    expect(after).toMatchObject({ updatedAt: before!.updatedAt, cpmCalculatedAt: before!.cpmCalculatedAt });
    const plan = await caller.planning.list({ projectId: project.id });
    expect(plan.activities[0]).toMatchObject({ lobApplicability: "fora_lob", lobApplicabilityReason: "Curva de concretagem pontual, sem repetição por pavimento." });
    const readiness = await caller.planning.readiness({ projectId: project.id });
    expect(readiness.dominios.linhaDeBalanco.bloqueios.map(item => item.codigo)).not.toContain("LOB_ATIVIDADES_SEM_UNIDADE");

    await caller.planning.setActivityLobApplicability({ projectId: project.id, activityId: currentActivity.id, applicability: "aplicavel" });
    expect((await caller.planning.readiness({ projectId: project.id })).dominios.linhaDeBalanco.bloqueios.map(item => item.codigo)).toContain("LOB_ATIVIDADES_SEM_UNIDADE");
  });
});
