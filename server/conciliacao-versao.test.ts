import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  budgetItems,
  budgetVersions,
  projectPlanVersions,
  projects,
  scheduleActivities,
  users,
  wbsNodes,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

const estado = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./db", async importOriginal => {
  const real = await importOriginal<typeof import("./db")>();
  return { ...real, getDb: async () => estado.db };
});

const { appRouter } = await import("./routers");

let pg: PGlite;
let db: ReturnType<typeof drizzlePglite>;
let ownerId: number;
let projectId: number;
let caller: ReturnType<typeof appRouter.createCaller>;

function context(user: { id: number; openId: string; name: string }): TrpcContext {
  return {
    user: user as TrpcContext["user"],
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg);
  estado.db = db;

  const [owner] = await db.insert(users)
    .values({ openId: "conciliacao-versao-owner", name: "Planejador" })
    .returning({ id: users.id });
  ownerId = owner.id;

  const [project] = await db.insert(projects)
    .values({
      ownerUserId: ownerId,
      code: "OBRA-CONCILIACAO-VERSAO",
      name: "Obra de teste de versões",
      location: "Local",
      plannedStart: new Date("2026-01-01T00:00:00Z"),
      plannedFinish: new Date("2026-12-31T00:00:00Z"),
    })
    .returning({ id: projects.id });
  projectId = project.id;
  caller = appRouter.createCaller(context({ id: ownerId, openId: "conciliacao-versao-owner", name: "Planejador" }));
});

afterEach(async () => {
  await pg.close();
  estado.db = null;
});

describe("budgets.conciliacao", () => {
  it("conta somente atividades da versão vigente do cronograma", async () => {
    for (let versionNumber = 1; versionNumber <= 4; versionNumber++) {
      const [version] = await db.insert(projectPlanVersions)
        .values({ projectId, versionNumber, status: versionNumber === 4 ? "draft" : "superseded" })
        .returning({ id: projectPlanVersions.id });
      const [node] = await db.insert(wbsNodes).values({
        projectId,
        versionId: version.id,
        code: "1.1.1",
        name: `Folha da versão ${versionNumber}`,
        level: 1,
        nodeType: "pacote",
        sortOrder: 0,
      }).returning({ id: wbsNodes.id });

      const activityCount = versionNumber === 4 ? 1 : 83;
      await db.insert(scheduleActivities).values(Array.from({ length: activityCount }, (_, index) => ({
        projectId,
        versionId: version.id,
        wbsNodeId: node.id,
        wbsCode: "1.1.1",
        name: `Atividade ${versionNumber}-${index + 1}`,
        phase: "Execução",
        startOffset: 0,
        durationDays: 1,
      })));
    }

    const [budget] = await db.insert(budgetVersions).values({
      projectId,
      name: "Orçamento de teste",
      versionNumber: 1,
      status: "em_revisao",
    }).returning({ id: budgetVersions.id });
    await db.insert(budgetItems).values({
      budgetVersionId: budget.id,
      code: "C2595",
      description: "Tubo sanitário PVC DN 40",
      unit: "m",
      quantity: "10.000",
      unitPrice: "1.00",
    });

    const result = await caller.planning.conciliacao({ projectId });

    expect(result.cobertura.atividadesTotal).toBe(1);
    expect(result.pendencias).toHaveLength(1);
    expect(result.pendencias[0]?.name).toBe("Atividade 4-1");
  });
});
