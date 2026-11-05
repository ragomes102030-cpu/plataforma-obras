import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectPlanVersions, projects, scheduleActivities, users, wbsNodes } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

const estado = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", async importOriginal => {
  const real = await importOriginal<typeof import("./db")>();
  return { ...real, getDb: async () => estado.db };
});
const { appRouter } = await import("./routers");

describe("pesos físicos do cronograma", () => {
  let pg: PGlite;
  let caller: ReturnType<typeof appRouter.createCaller>;
  let projectId: number;
  let activityId: number;

  beforeEach(async () => {
    pg = await pgliteComSchema();
    const db = drizzlePglite(pg);
    estado.db = db;
    const [user] = await db.insert(users).values({ openId: "peso-user", name: "Planejador" }).returning({ id: users.id });
    const [project] = await db.insert(projects).values({ ownerUserId: user.id, code: "PESOS-1", name: "Obra de pesos", location: "Fortaleza", plannedStart: new Date("2026-01-05T00:00:00Z"), plannedFinish: new Date("2026-12-20T00:00:00Z") }).returning({ id: projects.id });
    projectId = project.id;
    const [version] = await db.insert(projectPlanVersions).values({ projectId, versionNumber: 1, status: "draft" }).returning({ id: projectPlanVersions.id });
    const nodes = await db.insert(wbsNodes).values([1, 2].map(i => ({ projectId, versionId: version.id, code: `1.${i}`, name: `Pacote ${i}`, level: 2, nodeType: "pacote" as const }))).returning({ id: wbsNodes.id });
    const activities = await db.insert(scheduleActivities).values(nodes.map((node, i) => ({ projectId, versionId: version.id, wbsNodeId: node.id, wbsCode: `1.${i + 1}`, name: `Atividade ${i + 1}`, phase: "Execução", startOffset: i * 5, durationDays: 5, plannedQuantity: "10.000", unit: i ? "m2" : "m3" }))).returning({ id: scheduleActivities.id });
    activityId = activities[0]!.id;
    caller = appRouter.createCaller({ user: { id: user.id, openId: "peso-user", name: "Planejador" }, req: { headers: {} }, res: {} } as TrpcContext);
  });

  afterEach(async () => { await pg.close(); estado.db = null; });

  it("propõe 100%, exige aprovação e invalida o conjunto quando um peso muda", async () => {
    await caller.planning.distribuirPesosFisicosUniformes({ projectId });
    const db = drizzlePglite(pg);
    let rows = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    expect(rows.reduce((total, row) => total + Number(row.physicalWeight), 0)).toBeCloseTo(100, 6);
    expect(rows.every(row => row.physicalWeightApprovedAt == null)).toBe(true);

    await caller.planning.aprovarPesosFisicos({ projectId });
    rows = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    expect(rows.every(row => row.physicalWeightApprovedAt != null)).toBe(true);

    await caller.planning.atualizarAtividade({ projectId, atividadeId: activityId, campo: "peso_fisico", valor: "40" });
    rows = await db.select().from(scheduleActivities).where(and(eq(scheduleActivities.projectId, projectId), eq(scheduleActivities.exemplo, 0)));
    expect(rows.every(row => row.physicalWeightApprovedAt == null)).toBe(true);
  });
});
