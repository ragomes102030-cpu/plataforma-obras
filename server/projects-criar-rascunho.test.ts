import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentProjectStates, projectPlanVersions, projects, users, wbsNodes } from "../drizzle/schema";
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

describe("criação de obra para planejamento por prazo", () => {
  it("cria rascunho sem orçamento, data inicial ou término presumidos", async () => {
    pg = await pgliteComSchema();
    const db = drizzle(pg);
    estado.db = db;
    const [user] = await db.insert(users).values({ openId: "project-draft-schedule", name: "Planejador" }).returning();
    const caller = appRouter.createCaller({
      user: user as TrpcContext["user"],
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    const created = await caller.projects.create({ name: "Obra sem orçamento", location: "Fortaleza" });
    expect(created).toMatchObject({ name: "Obra sem orçamento", plannedStart: null, plannedFinish: null, status: "Planejamento" });
    const [version] = await db.select().from(projectPlanVersions).where(eq(projectPlanVersions.projectId, created.id));
    expect(version).toMatchObject({ versionNumber: 1, status: "draft" });
    const [state] = await db.select().from(agentProjectStates).where(eq(agentProjectStates.projectId, created.id));
    expect(state).toMatchObject({ stage: "EAP_PROPOSTA", activeSection: "eap" });

    await db.insert(wbsNodes).values({ projectId: created.id, versionId: version!.id, code: "1", name: "Serviço inicial", level: 1, nodeType: "pacote" });
    await db.update(projectPlanVersions).set({ status: "approved", approvedAt: new Date() }).where(eq(projectPlanVersions.id, version!.id));
    const activity = await caller.planning.createActivity({
      projectId: created.id, wbsCode: "1", name: "Executar serviço inicial", phase: "Execução", startOffset: 0, durationDays: 8,
    });
    expect(activity.durationDays).toBe(8);
    const plan = await caller.planning.list({ projectId: created.id });
    expect(plan.activities).toHaveLength(1);
    expect(plan.activities[0]).toMatchObject({ id: activity.id, startOffset: 0, durationDays: 8, versionId: activity.planVersionId });
    const [stillWithoutCivilAnchor] = await db.select().from(projects).where(eq(projects.id, created.id));
    expect(stillWithoutCivilAnchor).toMatchObject({ plannedStart: null, plannedFinish: null });
  });
});
