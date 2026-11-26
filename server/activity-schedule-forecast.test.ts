import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activityScheduleUpdates,
  productionEntries,
  projectPlanVersions,
  projects,
  scheduleActivities,
  scheduleBaselineItems,
  scheduleBaselines,
  scheduleDependencies,
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

async function preparar(inicio: Date | null = new Date("2026-11-02T12:00:00.000Z")) {
  pg = await pgliteComSchema();
  const db = drizzle(pg);
  estado.db = db;
  const [owner] = await db.insert(users).values({ openId: "forecast-owner", name: "Planejadora" }).returning();
  const [project] = await db.insert(projects).values({
    ownerUserId: owner.id,
    code: "FORECAST-QA",
    name: "Obra de teste por prazo",
    location: "Fortaleza",
    plannedStart: inicio,
  }).returning();
  const [oldVersion] = await db.insert(projectPlanVersions).values({ projectId: project.id, versionNumber: 1, status: "superseded" }).returning();
  const [currentVersion] = await db.insert(projectPlanVersions).values({ projectId: project.id, versionNumber: 2, status: "approved" }).returning();
  const [oldNode] = await db.insert(wbsNodes).values({ projectId: project.id, versionId: oldVersion.id, code: "1", name: "Pacote antigo", level: 1, nodeType: "pacote" }).returning();
  const [foundationNode, structureNode] = await db.insert(wbsNodes).values([
    { projectId: project.id, versionId: currentVersion.id, code: "1", name: "Fundação", level: 1, nodeType: "pacote" },
    { projectId: project.id, versionId: currentVersion.id, code: "2", name: "Estrutura", level: 1, nodeType: "pacote" },
  ]).returning();
  const calculatedAt = new Date("2026-11-20T12:00:00.000Z");
  const updatedAt = new Date("2026-11-19T12:00:00.000Z");
  const [oldActivity] = await db.insert(scheduleActivities).values({
    projectId: project.id, versionId: oldVersion.id, wbsNodeId: oldNode.id,
    wbsCode: "1", name: "Atividade antiga", phase: "Execução", startOffset: 0, durationDays: 1,
  }).returning();
  const [foundation, structure] = await db.insert(scheduleActivities).values([
    { projectId: project.id, versionId: currentVersion.id, wbsNodeId: foundationNode!.id, wbsCode: "1", name: "Fundação", phase: "Execução", startOffset: 0, durationDays: 5, earlyStart: 0, earlyFinish: 5, cpmCalculatedAt: calculatedAt, updatedAt },
    { projectId: project.id, versionId: currentVersion.id, wbsNodeId: structureNode!.id, wbsCode: "2", name: "Estrutura", phase: "Execução", startOffset: 5, durationDays: 3, earlyStart: 5, earlyFinish: 8, cpmCalculatedAt: calculatedAt, updatedAt },
  ]).returning();
  await db.insert(scheduleDependencies).values({ projectId: project.id, versionId: currentVersion.id, predecessorId: foundation!.id, successorId: structure!.id, type: "FS", lag: 0 });
  const [baseline] = await db.insert(scheduleBaselines).values({ projectId: project.id, versionId: currentVersion.id, name: "Baseline preservada", status: "ativa", createdBy: owner.id }).returning();
  await db.insert(scheduleBaselineItems).values({ baselineId: baseline!.id, activityId: foundation!.id, startOffset: 0, durationDays: 5, earlyStart: 0, earlyFinish: 5 });
  await db.insert(activityScheduleUpdates).values({
    projectId: project.id, versionId: oldVersion.id, activityId: oldActivity!.id,
    positionDate: "2026-11-20", status: "bloqueada", blockerReason: "Versão antiga", authorUserId: owner.id,
  });
  const first = await db.insert(activityScheduleUpdates).values({
    projectId: project.id, versionId: currentVersion.id, activityId: foundation!.id,
    positionDate: "2026-11-20", status: "em_andamento", actualStartDate: "2026-11-17", remainingDurationDays: 2, authorUserId: owner.id,
  }).returning();
  await db.insert(activityScheduleUpdates).values({
    projectId: project.id, versionId: currentVersion.id, activityId: foundation!.id,
    positionDate: "2026-11-19", status: "em_andamento", actualStartDate: "2026-11-17", remainingDurationDays: 1,
    supersedesId: first[0]!.id, authorUserId: owner.id,
  });
  const caller = appRouter.createCaller(contexto(owner));
  return { db, owner, project, foundation, structure, currentVersion, caller };
}

describe("previsão read-only do cronograma por relatos", () => {
  it("usa versão atual e posição até a data de corte, exclui correções substituídas e não grava no plano", async () => {
    const { db, project, foundation, currentVersion, caller } = await preparar();
    const activitiesBefore = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, project.id));
    const baselineBefore = await db.select().from(scheduleBaselineItems);
    const productionBefore = await db.select().from(productionEntries);

    const beforeCorrection = await caller.planning.activityScheduleForecast({ projectId: project.id, asOf: "2026-11-20" });
    const afterCorrection = await caller.planning.activityScheduleForecast({ projectId: project.id, asOf: "2026-11-26" });

    expect(beforeCorrection).toMatchObject({ versionId: currentVersion.id, totalActivities: 2, activitiesWithUpdate: 1, available: true });
    // A posição de corte avança quatro dias úteis; a correção vigente tem um
    // dia a menos que o evento substituído. Sem filtrar a correção, o fim seria
    // cinco dias úteis depois do primeiro resultado.
    expect(afterCorrection.projectFinishOffset).toBe(beforeCorrection.projectFinishOffset + 4);
    expect(beforeCorrection.activitiesWithoutUpdate).toBe(1);
    expect((await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, project.id))).map(row => row.id))
      .toEqual(activitiesBefore.map(row => row.id));
    expect((await db.select().from(scheduleActivities).where(eq(scheduleActivities.id, foundation!.id)))[0])
      .toEqual(activitiesBefore.find(row => row.id === foundation!.id));
    expect(await db.select().from(scheduleBaselineItems)).toEqual(baselineBefore);
    expect(await db.select().from(productionEntries)).toEqual(productionBefore);
    expect(await db.select().from(activityScheduleUpdates)).toHaveLength(3);
  });

  it("informa o requisito civil ausente e bloqueia consulta sem acesso à obra", async () => {
    const { db, project, owner } = await preparar(null);
    const caller = appRouter.createCaller(contexto(owner));
    const result = await caller.planning.activityScheduleForecast({ projectId: project.id, asOf: "2026-11-26" });
    expect(result).toMatchObject({ available: false, forecastFinishDate: null });
    expect(result.unavailableReason).toMatch(/data inicial planejada/i);

    const [otherOwner] = await db.insert(users).values({ openId: "forecast-other", name: "Outra pessoa" }).returning();
    const otherCaller = appRouter.createCaller(contexto(otherOwner!));
    await expect(otherCaller.planning.activityScheduleForecast({ projectId: project.id, asOf: "2026-11-26" }))
      .rejects.toThrow(/sem permissão/i);
  });

  it("explica quando o CPM salvo está desatualizado", async () => {
    const { db, project, foundation, caller } = await preparar();
    await db.update(scheduleActivities).set({ updatedAt: new Date("2026-11-26T12:00:00.000Z") })
      .where(eq(scheduleActivities.id, foundation!.id));

    const result = await caller.planning.activityScheduleForecast({ projectId: project.id, asOf: "2026-11-26" });
    expect(result).toMatchObject({ available: false, forecastFinishDate: null });
    expect(result.unavailableReason).toMatch(/recalcule o CPM da versão atual/i);
  });
});
