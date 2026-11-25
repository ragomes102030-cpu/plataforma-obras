import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetItems, budgetVersions, productionUnits, projectAuditEvents, projectPlanVersions, projects, scheduleActivities, users, wbsNodes } from "../drizzle/schema";
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

  it("não aprova rateio uniforme sem evidência de cada peso", async () => {
    const db = drizzlePglite(pg);
    await db.update(scheduleActivities).set({ physicalWeight: "50" }).where(eq(scheduleActivities.projectId, projectId));
    const rows = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    expect(rows.reduce((total, row) => total + Number(row.physicalWeight), 0)).toBeCloseTo(100, 6);
    expect(rows.every(row => row.physicalWeightApprovedAt == null)).toBe(true);

    await expect(caller.planning.aprovarPesosFisicos({ projectId })).rejects.toThrow(/evidência|justificativa/i);
  });

  it("exige uma memória rastreável por atividade e invalida a aprovação ao revisar o peso", async () => {
    const db = drizzlePglite(pg);
    await db.update(scheduleActivities).set({ physicalWeight: "50" }).where(eq(scheduleActivities.projectId, projectId));
    const rowsBefore = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    for (const row of rowsBefore) {
      await caller.planning.atualizarAtividade({
        projectId,
        atividadeId: row.id,
        campo: "peso_fisico",
        valor: "50",
        evidenciaPesoFisico: "Memória de cálculo FIS-001, item 2.1; critério por quantidade medida e escopo da atividade.",
      });
    }

    await caller.planning.aprovarPesosFisicos({ projectId });
    let rows = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    expect(rows.every(row => row.physicalWeightApprovedAt != null)).toBe(true);
    expect(rows.every(row => row.physicalWeightEvidence?.includes("FIS-001"))).toBe(true);

    await caller.planning.atualizarAtividade({ projectId, atividadeId: activityId, campo: "peso_fisico", valor: "40", evidenciaPesoFisico: "Memória de cálculo FIS-001, item 2.2; revisão da participação desta atividade." });
    rows = await db.select().from(scheduleActivities).where(and(eq(scheduleActivities.projectId, projectId), eq(scheduleActivities.exemplo, 0)));
    expect(rows.every(row => row.physicalWeightApprovedAt == null)).toBe(true);
  });

  it("não aceita peso físico digitado sem evidência rastreável", async () => {
    await expect(caller.planning.atualizarAtividade({ projectId, atividadeId: activityId, campo: "peso_fisico", valor: "50" }))
      .rejects.toThrow(/evidência/i);
  });

  it("libera rateio sintético QA na versão aprovada sem criar outra versão", async () => {
    const db = drizzlePglite(pg);
    const [version] = await db.select().from(projectPlanVersions).where(eq(projectPlanVersions.projectId, projectId));
    await db.update(projectPlanVersions).set({ status: "approved" }).where(eq(projectPlanVersions.id, version!.id));
    const nodes = await db.select().from(wbsNodes).where(eq(wbsNodes.projectId, projectId));
    await db.update(wbsNodes).set({ location: "Torre A" }).where(eq(wbsNodes.id, nodes[0]!.id));
    await db.insert(productionUnits).values({ projectId, code: "TA", name: "Torre A", unitType: "torre" });
    const [budget] = await db.insert(budgetVersions).values({ projectId, name: "Referência QA", versionNumber: 4, status: "aprovado" }).returning({ id: budgetVersions.id });
    await db.insert(budgetItems).values([1, 2].map(i => ({
      budgetVersionId: budget!.id,
      code: `QA-${i}`,
      description: `Serviço de teste ${i}`,
      unit: "un",
      quantity: "10.000",
      unitPrice: "100.00",
      source: "SEINFRA-CE 028.1",
      referencePeriod: "2025-10",
      quantityEvidence: "Premissa QA: quantitativo sintético para validar o cenário.",
      quantityEvidenceStatus: "cenario",
      isPriceException: true,
    })));

    const result = await caller.planning.aprovarPesosFisicosQa({ projectId, confirmarPremissasQa: true });
    const rows = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    const versions = await db.select().from(projectPlanVersions).where(eq(projectPlanVersions.projectId, projectId));
    const events = await db.select().from(projectAuditEvents).where(eq(projectAuditEvents.projectId, projectId));
    const plan = await caller.planning.list({ projectId });
    const readiness = await caller.planning.readiness({ projectId });

    expect(result).toMatchObject({ approved: true, total: 100, activityCount: 2, scenario: "premissa_qa", unitLinksFromEap: 1, classifiedOutsideLob: 1 });
    expect(rows.map(row => Number(row.physicalWeight))).toEqual([50, 50]);
    expect(rows.every(row => row.physicalWeightEvidence?.startsWith("Premissa QA:") && row.physicalWeightApprovedAt != null)).toBe(true);
    expect(rows.find(row => row.wbsCode === "1.1")?.pavimento).toBe("Torre A");
    expect(rows.find(row => row.wbsCode === "1.2")?.pavimento).toBeNull();
    expect(versions).toHaveLength(1);
    expect(versions[0]!.status).toBe("approved");
    expect(events.some(event => event.action === "physical_weights_qa_released")).toBe(true);
    expect(plan.lobQaExcludedCount).toBe(1);
    expect(plan.activities.filter(activity => activity.lobQaNonrepetitive)).toHaveLength(1);
    expect(readiness.etapas.execucao.bloqueios.map(item => item.codigo)).not.toContain("LOB_ATIVIDADES_SEM_UNIDADE");
  });

  it("rejeita liberação QA fora de uma versão aprovada com orçamento cenário aprovado", async () => {
    await expect(caller.planning.aprovarPesosFisicosQa({ projectId, confirmarPremissasQa: true }))
      .rejects.toThrow(/aprovada/i);
  });

  it("exige que os quantitativos do orçamento aprovado estejam declarados como cenário QA", async () => {
    const db = drizzlePglite(pg);
    const [version] = await db.select().from(projectPlanVersions).where(eq(projectPlanVersions.projectId, projectId));
    await db.update(projectPlanVersions).set({ status: "approved" }).where(eq(projectPlanVersions.id, version!.id));
    const [budget] = await db.insert(budgetVersions).values({ projectId, name: "Referência", versionNumber: 4, status: "aprovado" }).returning({ id: budgetVersions.id });
    await db.insert(budgetItems).values({
      budgetVersionId: budget!.id,
      code: "1.1",
      description: "Serviço",
      unit: "un",
      quantity: "10.000",
      unitPrice: "100.00",
      source: "SEINFRA-CE 028.1",
      quantityEvidence: "Memória revisada de quantitativo.",
      quantityEvidenceStatus: "validada",
    });

    await expect(caller.planning.aprovarPesosFisicosQa({ projectId, confirmarPremissasQa: true }))
      .rejects.toThrow(/todos os quantitativos.*cenário QA/i);
    const rows = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    expect(rows.every(row => row.physicalWeightApprovedAt == null)).toBe(true);
  });

  it("não permite que evidência Premissa QA passe pela aprovação de peso real", async () => {
    const db = drizzlePglite(pg);
    await db.update(scheduleActivities).set({ physicalWeight: "50", physicalWeightEvidence: "Premissa QA: rateio sintético igualmente distribuído para demonstração.", }).where(eq(scheduleActivities.projectId, projectId));
    await expect(caller.planning.aprovarPesosFisicos({ projectId }))
      .rejects.toThrow(/premissa QA/i);
  });
});
