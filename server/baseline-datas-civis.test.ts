import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentDecisions, budgetItems, budgetVersions, calendarExceptions, projectAuditEvents, projectPlanVersions, projects, scheduleActivities, scheduleBaselines, users, wbsNodes, workCalendars } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

const estado = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("./db", async importOriginal => ({ ...await importOriginal<typeof import("./db")>(), getDb: async () => estado.db }));
const { appRouter } = await import("./routers");
let pg: PGlite | undefined;
afterEach(async () => { await pg?.close(); pg = undefined; estado.db = null; });

async function preparar() {
  pg = await pgliteComSchema();
  const db = drizzle(pg);
  estado.db = db;
  const [user] = await db.insert(users).values({ openId: "baseline-civil", name: "Engenheiro" }).returning();
  const [obra] = await db.insert(projects).values({
    code: "BASELINE-CIVIL", name: "Obra de teste", location: "Fortaleza", ownerUserId: user.id,
    plannedStart: new Date("2026-10-23T12:00:00Z"), plannedFinish: new Date("2026-11-30T12:00:00Z"),
  }).returning();
  const [versao] = await db.insert(projectPlanVersions).values({ projectId: obra.id, versionNumber: 1, status: "approved" }).returning();
  const [no] = await db.insert(wbsNodes).values({
    projectId: obra.id, versionId: versao.id, code: "1", name: "Pacote", level: 1, nodeType: "pacote",
    description: "Pacote do teste", inclusions: "Serviço do teste", exclusions: "Serviços externos",
    responsible: "Engenheiro", acceptanceCriteria: "Inspeção", decompositionBasis: "deliverable",
  }).returning();
  await db.insert(agentDecisions).values({ projectId: obra.id, userId: user.id, stage: "EAP_DICIONARIO", decision: "approved", scopeJson: JSON.stringify({ requiredFields: ["description"] }) });
  const [atividade] = await db.insert(scheduleActivities).values({
    projectId: obra.id, versionId: versao.id, wbsNodeId: no.id, wbsCode: "1", name: "Serviço",
    phase: "Teste", durationDays: 2, startOffset: 0, earlyStart: 0, earlyFinish: 2,
    lateStart: 0, lateFinish: 2, totalFloat: 0, cpmCalculatedAt: new Date(Date.now() + 60_000),
  }).returning();
  const [calendario] = await db.insert(workCalendars).values({ projectId: obra.id, name: "Calendário oficial", weekPattern: { workingWeekdays: [1, 2, 3, 4, 5] } }).returning();
  await db.insert(calendarExceptions).values({ calendarId: calendario.id, date: "2026-10-26", type: "national_holiday" });
  const caller = appRouter.createCaller({ user, req: { headers: {} }, res: {} } as TrpcContext);
  return { db, obra, versao, atividade, calendario, caller };
}

describe("fotografia civil da baseline", () => {
  it("congela datas oficiais e preserva-as após mudar início, calendário e CPM atual", async () => {
    const { db, obra, atividade, calendario, caller } = await preparar();
    const captura = await caller.planning.captureBaseline({ projectId: obra.id, name: "Referência civil" });
    const antes = await caller.planning.compararComBaseline({ projectId: obra.id, baselineId: captura.id });
    expect(antes?.baseline.datasCapturadas).toEqual([
      { activityId: atividade.id, wbsCode: "1", name: "Serviço", inicio: "2026-10-23", fim: "2026-10-27" },
    ]);
    await db.update(projects).set({ plannedStart: new Date("2027-01-04T12:00:00Z") }).where(eq(projects.id, obra.id));
    await db.update(workCalendars).set({ weekPattern: { workingWeekdays: [0, 1, 2, 3, 4, 5, 6] } }).where(eq(workCalendars.id, calendario.id));
    await db.delete(calendarExceptions).where(eq(calendarExceptions.calendarId, calendario.id));
    await db.update(scheduleActivities).set({ earlyStart: 5, earlyFinish: 7 }).where(eq(scheduleActivities.id, atividade.id));
    const depois = await caller.planning.compararComBaseline({ projectId: obra.id, baselineId: captura.id });
    expect(depois?.baseline.datasCapturadas).toEqual(antes?.baseline.datasCapturadas);
    expect(depois?.linhas[0]).toMatchObject({ baselineAtividadeId: atividade.id, baselineInicio: 0, baselineFim: 2, deltaFim: 5 });
    const [evento] = await db.select().from(projectAuditEvents).where(eq(projectAuditEvents.action, "schedule_baseline_captured"));
    expect(evento.payload).toMatchObject({ baselineId: captura.id, snapshotVersion: 1 });
  });

  it("baseline legada permanece sem sobreposição civil e outra obra não acessa a fotografia", async () => {
    const { db, obra, versao, caller } = await preparar();
    const [legada] = await db.insert(scheduleBaselines).values({ projectId: obra.id, versionId: versao.id, name: "Legada", status: "ativa" }).returning();
    expect((await caller.planning.compararComBaseline({ projectId: obra.id, baselineId: legada.id }))?.baseline.datasCapturadas).toBeNull();
    await expect(caller.planning.compararComBaseline({ projectId: obra.id + 99, baselineId: legada.id })).rejects.toThrow();
  });

  it("falha ao registrar fotografia reverte a nova baseline e preserva a vigente", async () => {
    const { db, obra, caller } = await preparar();
    const primeira = await caller.planning.captureBaseline({ projectId: obra.id, name: "Primeira" });
    await pg!.exec(`CREATE FUNCTION rejeitar_fotografia() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha de fotografia'; END $$;
      CREATE TRIGGER rejeitar_fotografia BEFORE INSERT ON project_audit_events FOR EACH ROW EXECUTE FUNCTION rejeitar_fotografia();`);
    await expect(caller.planning.captureBaseline({ projectId: obra.id, name: "Segunda" })).rejects.toThrow();
    const todas = await db.select().from(scheduleBaselines);
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ id: primeira.id, status: "ativa" });
  });

  it("captura prazo e mantém avisos financeiros didáticos ou incompletos auditáveis", async () => {
    const { db, obra, caller } = await preparar();
    const [orcamento] = await db.insert(budgetVersions).values({ projectId: obra.id, versionNumber: 1, name: "Didático", status: "aprovado" }).returning();
    await db.insert(budgetItems).values({ budgetVersionId: orcamento.id, code: "TESTE", description: "Exemplo de custo", quantity: "1", unit: "un", unitPrice: "100", source: "didatico" });
    const captura = await caller.planning.captureBaseline({ projectId: obra.id, name: "Somente prazo" });
    expect(captura.activityCount).toBe(1);
    expect(captura.avisosOrcamento).toHaveLength(2);
    const comparacao = await caller.planning.compararComBaseline({ projectId: obra.id, baselineId: captura.id });
    expect(comparacao?.baseline.avisosOrcamento).toEqual(captura.avisosOrcamento);
    expect(comparacao?.baseline.datasCapturadas).toHaveLength(1);
  });
});
