import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  productionEntries,
  projects,
  scheduleActivities,
  users,
  wbsNodes,
} from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";
import { coletarLancamentosExecutados } from "./grade-dados";
import type { DbConexao } from "./lookahead-dados";

let pg: PGlite;
let db: DbConexao;

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as unknown as DbConexao;
});

afterEach(async () => {
  await pg.close();
});

describe("coletarLancamentosExecutados", () => {
  it("inclui apenas produção confirmada, real e ocorrida até a data de referência", async () => {
    const [user] = await db.insert(users)
      .values({ openId: "teste-grade-execucao", name: "Teste" })
      .returning({ id: users.id });
    const [project] = await db.insert(projects)
      .values({
        ownerUserId: user.id,
        code: "OBRA-GRADE",
        name: "Obra do teste da grade",
        location: "Local",
        plannedStart: new Date("2026-01-01T00:00:00"),
        plannedFinish: new Date("2026-12-31T00:00:00"),
      })
      .returning({ id: projects.id });
    const [node] = await db.insert(wbsNodes)
      .values({ projectId: project.id, code: "1.1", name: "Pacote", level: 2 })
      .returning({ id: wbsNodes.id });
    const [activity] = await db.insert(scheduleActivities)
      .values({
        projectId: project.id,
        wbsNodeId: node.id,
        wbsCode: "1.1",
        name: "Atividade",
        phase: "Execução",
        startOffset: 0,
        durationDays: 5,
      })
      .returning({ id: scheduleActivities.id });
    const [qaNode] = await db.insert(wbsNodes)
      .values({ projectId: project.id, code: "QA.1", name: "Pacote de demonstração", level: 2 })
      .returning({ id: wbsNodes.id });
    const [qaActivity] = await db.insert(scheduleActivities)
      .values({
        projectId: project.id,
        wbsNodeId: qaNode.id,
        wbsCode: "QA.1",
        name: "Atividade de demonstração",
        phase: "QA",
        startOffset: 0,
        durationDays: 1,
        exemplo: 1,
      })
      .returning({ id: scheduleActivities.id });

    await db.insert(productionEntries).values([
      { projectId: project.id, activityId: activity.id, productionDate: new Date("2026-01-05T12:00:00Z"), quantity: "12.000", measurementUnit: "m²", status: "confirmada" },
      { projectId: project.id, activityId: activity.id, productionDate: new Date("2026-01-06T12:00:00Z"), quantity: "20.000", measurementUnit: "m²", status: "confirmada" },
      { projectId: project.id, activityId: activity.id, productionDate: new Date("2026-01-04T12:00:00Z"), quantity: "30.000", measurementUnit: "m²", status: "rascunho" },
      { projectId: project.id, activityId: activity.id, productionDate: new Date("2026-01-04T12:00:00Z"), quantity: "40.000", measurementUnit: "m²", status: "confirmada", exemplo: 1 },
      { projectId: project.id, activityId: qaActivity.id, productionDate: new Date("2026-01-04T12:00:00Z"), quantity: "50.000", measurementUnit: "m²", status: "confirmada" },
    ]);

    const rows = await coletarLancamentosExecutados(db, project.id, "2026-01-05");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ activityId: activity.id, quantity: "12.000" });
  });
});
