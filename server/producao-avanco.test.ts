import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  productionEntries,
  productionFronts,
  projectAuditEvents,
  projects,
  projectPlanVersions,
  scheduleActivities,
  users,
  wbsNodes,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { pgliteComSchema } from "./test-helpers/pglite";

/**
 * PRODUÇÃO QUE FECHA COM O PLANO — o caso real da AURORA TESTE (22/10/2026).
 *
 * Dez medições confirmadas (03/10 a 25/10) apontavam para atividades da versão
 * anterior da EAP. `confirmEntry` somava em `entry.activityId` e escrevia o `%`
 * na linha antiga; a atividade de hoje ficava em 0% e a Curva S dizia "Obra no
 * prazo, 0,0%". Não havia editar, nem excluir, nem desfazer confirmação.
 *
 * Este teste monta a mesma situação: atividade "1.2.3" na v1 e na v2 (versão de
 * trabalho), lançamento preso na v1.
 */

const estado = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./db", async importOriginal => {
  const real = await importOriginal<typeof import("./db")>();
  return { ...real, getDb: async () => estado.db };
});

const { appRouter } = await import("./routers");

let pg: PGlite;

function contexto(user: { id: number; openId: string; name: string }): TrpcContext {
  return {
    user: user as TrpcContext["user"],
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("avanço real por código da EAP", () => {
  let donoId: number;
  let obraId: number;
  let atividadeAntigaId: number;
  let atividadeAtualId: number;
  let lancamentoId: number;

  beforeEach(async () => {
    pg = await pgliteComSchema();
    const db = drizzlePglite(pg);
    estado.db = db;

    const [dono] = await db
      .insert(users)
      .values({ openId: "prod-dono", name: "Engenheiro responsável", email: "prod@exemplo.com" })
      .returning({ id: users.id });
    donoId = dono.id;

    const [obra] = await db
      .insert(projects)
      .values({
        code: "OBRA-PROD-1",
        name: "Aurora de teste",
        location: "Fortaleza",
        plannedStart: new Date("2026-10-01T00:00:00Z"),
        plannedFinish: new Date("2027-04-30T00:00:00Z"),
        ownerUserId: donoId,
      })
      .returning({ id: projects.id });
    obraId = obra.id;

    const [v1, v2] = await db
      .insert(projectPlanVersions)
      .values([
        { projectId: obraId, versionNumber: 1, status: "superseded" },
        { projectId: obraId, versionNumber: 2, status: "draft" },
      ])
      .returning({ id: projectPlanVersions.id });

    const [pacoteV1, pacoteV2] = await db
      .insert(wbsNodes)
      .values([
        { projectId: obraId, versionId: v1.id, code: "1.2.3", name: "Alvenaria", level: 3, nodeType: "pacote" },
        { projectId: obraId, versionId: v2.id, code: "1.2.3", name: "Alvenaria", level: 3, nodeType: "pacote" },
      ])
      .returning({ id: wbsNodes.id });

    const atividade = (versionId: number, wbsNodeId: number, planejado: string) => ({
      projectId: obraId,
      versionId,
      wbsNodeId,
      wbsCode: "1.2.3",
      name: "Alvenaria de bloco",
      phase: "Estrutura",
      startOffset: 10,
      durationDays: 20,
      plannedQuantity: planejado,
      unit: "m2",
    });

    const [antiga, atual] = await db
      .insert(scheduleActivities)
      .values([atividade(v1.id, pacoteV1.id, "100.000"), atividade(v2.id, pacoteV2.id, "200.000")])
      .returning({ id: scheduleActivities.id });
    atividadeAntigaId = antiga.id;
    atividadeAtualId = atual.id;

    const [lancamento] = await db
      .insert(productionEntries)
      .values({
        projectId: obraId,
        activityId: atividadeAntigaId,
        productionDate: new Date("2026-10-03T00:00:00Z"),
        quantity: "50.000",
        measurementUnit: "m2",
        status: "confirmada",
      })
      .returning({ id: productionEntries.id });
    lancamentoId = lancamento.id;
  });

  afterEach(async () => {
    await pg.close();
    estado.db = null;
  });

  const chamador = () => appRouter.createCaller(contexto({ id: donoId, openId: "prod-dono", name: "Engenheiro" }));

  it("somando pelo código, o lançamento antigo avança a atividade de hoje", async () => {
    const db = drizzlePglite(pg);
    const resultado = await chamador().production.recalcularAvanco({ projectId: obraId });

    const [atual] = await db
      .select({ progress: scheduleActivities.progress })
      .from(scheduleActivities)
      .where(eq(scheduleActivities.id, atividadeAtualId));
    const [antiga] = await db
      .select({ progress: scheduleActivities.progress })
      .from(scheduleActivities)
      .where(eq(scheduleActivities.id, atividadeAntigaId));

    // 50 de 200 = 25% na atividade da versão de trabalho.
    expect(atual.progress).toBe(25);
    // A linha da versão antiga não recebe mais o número (era isso que escondia o
    // avanço: 50/100 = 50% escrito numa atividade que a tela não mostra).
    expect(antiga.progress).toBe(0);
    expect(resultado.atividadesQueMudaram).toBeGreaterThan(0);
  });

  it("a lista de lançamentos mostra o código da EAP e o vínculo", async () => {
    const [lancamento] = await chamador().production.entries({ projectId: obraId });
    expect(lancamento.codigoEap).toBe("1.2.3");
    expect(lancamento.atividadeNome).toBe("Alvenaria de bloco");
    expect(lancamento.vinculo).toBe("versao_anterior");
  });

  it("usa a unidade da atividade exata quando o código EAP é compartilhado", async () => {
    const db = drizzlePglite(pg);
    const [atual] = await db.select().from(scheduleActivities).where(eq(scheduleActivities.id, atividadeAtualId));
    await db.insert(scheduleActivities).values({ projectId: obraId, versionId: atual.versionId, wbsNodeId: atual.wbsNodeId, wbsCode: atual.wbsCode, name: "Concreto", phase: "Estrutura", startOffset: 0, durationDays: 5, plannedQuantity: "10", unit: "m3" });
    await db.insert(productionEntries).values({ projectId: obraId, activityId: atividadeAtualId, productionDate: new Date("2026-10-04T00:00:00Z"), quantity: "5", measurementUnit: "m2", status: "confirmada" });
    const lancamentos = await chamador().production.entries({ projectId: obraId });
    const registro = lancamentos.find(item => item.activityId === atividadeAtualId);
    expect(registro?.unidadePlanejada).toBe("m2");
    expect(registro?.unidadeCompativel).toBe(true);
    expect(registro?.atividadeNome).toBe("Alvenaria de bloco");
  });

  it("não consolida o avanço do projeto incluindo atividade marcada como exemplo QA", async () => {
    const db = drizzlePglite(pg);
    const [operacional] = await db.select({ wbsNodeId: scheduleActivities.wbsNodeId })
      .from(scheduleActivities).where(eq(scheduleActivities.id, atividadeAtualId));
    await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: 2,
      wbsNodeId: operacional.wbsNodeId,
      wbsCode: "QA-PROJ-PCT",
      name: "Atividade sintética",
      phase: "Execução",
      startOffset: 0,
      durationDays: 20,
      plannedQuantity: "1.000",
      unit: "m2",
      progress: 100,
      exemplo: 1,
    });

    await chamador().production.recalcularAvanco({ projectId: obraId });
    const [obra] = await db.select({ progress: projects.progress }).from(projects).where(eq(projects.id, obraId));

    // A produção real existente continua valendo (50/200 = 25%); a atividade
    // QA com 100% não pode diluir o agregado do projeto.
    expect(obra.progress).toBe(25);
  });

  it("não conta produção ligada a atividade QA no controle e na Curva S", async () => {
    const db = drizzlePglite(pg);
    await db.update(productionEntries).set({ exemplo: 1 }).where(eq(productionEntries.id, lancamentoId));
    const [operacional] = await db.select({ wbsNodeId: scheduleActivities.wbsNodeId })
      .from(scheduleActivities).where(eq(scheduleActivities.id, atividadeAtualId));
    const [qa] = await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: 2,
      wbsNodeId: operacional.wbsNodeId,
      wbsCode: "1.2.3",
      name: "Atividade QA com mesmo WBS",
      phase: "Execução",
      startOffset: 0,
      durationDays: 1,
      plannedQuantity: "1.000",
      unit: "m2",
      exemplo: 1,
    }).returning({ id: scheduleActivities.id });
    const [lancamentoQa] = await db.insert(productionEntries).values({
      projectId: obraId,
      activityId: qa.id,
      productionDate: new Date("2026-10-02T00:00:00Z"),
      quantity: "50.000",
      measurementUnit: "m2",
      status: "confirmada",
      exemplo: 0,
    }).returning({ id: productionEntries.id });

    const control = await chamador().planning.control({ projectId: obraId, asOf: new Date("2026-10-03T00:00:00Z") });
    const activityControl = control.activities.find(activity => activity.id === atividadeAtualId);
    const curva = await chamador().planning.scurve({ projectId: obraId, asOf: new Date("2026-10-03T00:00:00Z") });
    const historico = await chamador().production.entries({ projectId: obraId });

    expect(activityControl?.actualQuantity).toBe(0);
    expect(curva.points[curva.points.length - 1]?.actualPct).toBe(0);
    expect(historico.find(entry => entry.id === lancamentoQa.id)?.exemplo).toBe(1);
  });

  it("não classifica como vínculo perdido a produção ligada a atividade de exemplo QA", async () => {
    const db = drizzlePglite(pg);
    await db.update(productionEntries).set({ exemplo: 1 }).where(eq(productionEntries.id, lancamentoId));
    const [atividadeAtual] = await db.select({ wbsNodeId: scheduleActivities.wbsNodeId })
      .from(scheduleActivities).where(eq(scheduleActivities.id, atividadeAtualId));
    const [atividadeQa] = await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: 2,
      wbsNodeId: atividadeAtual.wbsNodeId,
      wbsCode: "SEM-ALVO-QA",
      name: "Atividade QA sem equivalente operacional",
      phase: "Execução",
      startOffset: 0,
      durationDays: 1,
      plannedQuantity: "10.000",
      unit: "m2",
      exemplo: 1,
    }).returning({ id: scheduleActivities.id });
    await db.insert(productionEntries).values({
      projectId: obraId,
      activityId: atividadeQa.id,
      productionDate: new Date("2026-10-02T00:00:00Z"),
      quantity: "10.000",
      measurementUnit: "m2",
      status: "confirmada",
      exemplo: 0,
    });

    const resultado = await chamador().production.recalcularAvanco({ projectId: obraId });

    expect(resultado.lancamentosSemVinculo).toBe(0);
  });

  it("recusa medição em unidade diferente da atividade planejada", async () => {
    await expect(chamador().production.createEntry({
      projectId: obraId,
      activityId: atividadeAtualId,
      productionDate: new Date("2026-10-10T00:00:00.000Z"),
      quantity: 5,
      measurementUnit: "kg",
      status: "confirmada",
    })).rejects.toThrow(/unidade registrada .* deve corresponder à unidade planejada/i);
  });

  it("aplica a mesma validação ao lançamento em lote", async () => {
    await expect(chamador().production.createEntries({
      projectId: obraId,
      entries: [{
        activityId: atividadeAtualId,
        productionDate: new Date("2026-10-10T00:00:00.000Z"),
        quantity: 5,
        measurementUnit: "kg",
        status: "confirmada",
      }],
    })).rejects.toThrow(/unidade registrada .* deve corresponder à unidade planejada/i);
  });

  it("marca como QA toda produção criada para uma atividade de exemplo", async () => {
    const db = drizzlePglite(pg);
    const [pacoteQa] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: 2,
      code: "QA.1",
      name: "Pacote demonstrativo",
      level: 3,
      nodeType: "pacote",
    }).returning({ id: wbsNodes.id });
    const [atividadeQa] = await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: 2,
      wbsNodeId: pacoteQa.id,
      wbsCode: "QA.1",
      name: "Atividade demonstrativa",
      phase: "Execução",
      startOffset: 0,
      durationDays: 1,
      plannedQuantity: "10.000",
      unit: "m2",
      exemplo: 1,
    }).returning({ id: scheduleActivities.id });

    await chamador().production.createEntry({
      projectId: obraId,
      activityId: atividadeQa.id,
      productionDate: new Date("2026-10-10T00:00:00.000Z"),
      quantity: 5,
      measurementUnit: "m2",
      status: "confirmada",
    });

    const [lancamentoQa] = await db.select({ exemplo: productionEntries.exemplo })
      .from(productionEntries)
      .where(eq(productionEntries.activityId, atividadeQa.id));
    expect(lancamentoQa.exemplo).toBe(1);
  });

  it("marca como QA cada item de lote vinculado a uma atividade de exemplo", async () => {
    const db = drizzlePglite(pg);
    const [pacoteQa] = await db.insert(wbsNodes).values({
      projectId: obraId,
      versionId: 2,
      code: "QA.2",
      name: "Pacote demonstrativo em lote",
      level: 3,
      nodeType: "pacote",
    }).returning({ id: wbsNodes.id });
    const [atividadeQa] = await db.insert(scheduleActivities).values({
      projectId: obraId,
      versionId: 2,
      wbsNodeId: pacoteQa.id,
      wbsCode: "QA.2",
      name: "Atividade demonstrativa em lote",
      phase: "Execução",
      startOffset: 0,
      durationDays: 1,
      plannedQuantity: "10.000",
      unit: "m2",
      exemplo: 1,
    }).returning({ id: scheduleActivities.id });

    await chamador().production.createEntries({
      projectId: obraId,
      entries: [{
        activityId: atividadeQa.id,
        productionDate: new Date("2026-10-10T00:00:00.000Z"),
        quantity: 5,
        measurementUnit: "m2",
        status: "confirmada",
      }],
    });

    const [lancamentoQa] = await db.select({ exemplo: productionEntries.exemplo })
      .from(productionEntries)
      .where(eq(productionEntries.activityId, atividadeQa.id));
    expect(lancamentoQa.exemplo).toBe(1);
  });

  it("marca como QA um lançamento cuja nota identifica simulação, mesmo em atividade real", async () => {
    const db = drizzlePglite(pg);
    await chamador().production.createEntry({
      projectId: obraId,
      activityId: atividadeAtualId,
      productionDate: new Date("2026-10-10T00:00:00.000Z"),
      quantity: 5,
      measurementUnit: "m2",
      notes: "Premissa QA: quantidade sintética para demonstração.",
      status: "confirmada",
    });

    const [lancamento] = await db.select({ exemplo: productionEntries.exemplo })
      .from(productionEntries)
      .where(eq(productionEntries.activityId, atividadeAtualId));
    expect(lancamento.exemplo).toBe(1);
  });

  it("classifica como exemplo QA somente quando a nota identifica simulação", async () => {
    const db = drizzlePglite(pg);
    await chamador().production.recalcularAvanco({ projectId: obraId });
    const [antes] = await db.select({ progress: scheduleActivities.progress })
      .from(scheduleActivities).where(eq(scheduleActivities.id, atividadeAtualId));
    await db.update(productionEntries).set({ notes: "SIMULAÇÃO QA — quantidade sintética, não execução real." })
      .where(eq(productionEntries.id, lancamentoId));

    const resultado = await chamador().production.markAsQaExample({ projectId: obraId, entryId: lancamentoId });
    const [lancamento] = await db.select({ exemplo: productionEntries.exemplo, status: productionEntries.status })
      .from(productionEntries).where(eq(productionEntries.id, lancamentoId));
    const [depois] = await db.select({ progress: scheduleActivities.progress })
      .from(scheduleActivities).where(eq(scheduleActivities.id, atividadeAtualId));
    const [auditoria] = await db.select({ action: projectAuditEvents.action, payload: projectAuditEvents.payload })
      .from(projectAuditEvents).where(eq(projectAuditEvents.action, "production_entry_marked_qa_example"));

    expect(resultado.marked).toBe(true);
    expect(lancamento).toEqual({ exemplo: 1, status: "confirmada" });
    expect(antes.progress).toBe(25);
    expect(depois.progress).toBe(0);
    expect(auditoria?.action).toBe("production_entry_marked_qa_example");
  });

  it("recusa classificar como QA uma medição sem nota explícita de simulação", async () => {
    await expect(chamador().production.markAsQaExample({ projectId: obraId, entryId: lancamentoId }))
      .rejects.toThrow(/nota precisa identificar explicitamente/i);
  });

  it("não permite confirmar como real um rascunho cuja nota já identifica QA", async () => {
    const db = drizzlePglite(pg);
    await db.update(productionEntries)
      .set({ status: "rascunho", notes: "SIMULAÇÃO QA — valor sintético para cenário." })
      .where(eq(productionEntries.id, lancamentoId));

    await expect(chamador().production.confirmEntry({ projectId: obraId, entryId: lancamentoId }))
      .rejects.toThrow(/classifique como Premissa QA/i);
  });

  it("não permite confirmar como produção real um lançamento já marcado como Premissa QA", async () => {
    const db = drizzlePglite(pg);
    await db.update(productionEntries)
      .set({ status: "rascunho", notes: null, exemplo: 1 })
      .where(eq(productionEntries.id, lancamentoId));

    await expect(chamador().production.confirmEntry({ projectId: obraId, entryId: lancamentoId }))
      .rejects.toThrow(/Premissa QA não pode ser confirmada como produção real/i);

    const [lancamento] = await db.select({ status: productionEntries.status, exemplo: productionEntries.exemplo })
      .from(productionEntries)
      .where(eq(productionEntries.id, lancamentoId));
    expect(lancamento).toEqual({ status: "rascunho", exemplo: 1 });
  });

  it("não reconfirma lançamento legado com unidade incompatível", async () => {
    const db = drizzlePglite(pg);
    await db.update(productionEntries)
      .set({ status: "rascunho", measurementUnit: "kg" })
      .where(eq(productionEntries.id, lancamentoId));

    await expect(chamador().production.confirmEntry({
      projectId: obraId,
      entryId: lancamentoId,
    })).rejects.toThrow(/unidade registrada .* deve corresponder à unidade planejada/i);

    const [lancamento] = await db.select({ status: productionEntries.status })
      .from(productionEntries)
      .where(eq(productionEntries.id, lancamentoId));
    expect(lancamento.status).toBe("rascunho");
  });

  it("exige referência nova ao corrigir a unidade de um rascunho", async () => {
    const db = drizzlePglite(pg);
    const [rascunho] = await db.insert(productionEntries).values({
      projectId: obraId,
      activityId: atividadeAtualId,
      productionDate: new Date("2026-10-10T00:00:00.000Z"),
      quantity: "5.000",
      measurementUnit: "kg",
      notes: "Referência antiga",
      status: "rascunho",
    }).returning({ id: productionEntries.id });

    await expect(chamador().production.updateEntry({
      projectId: obraId,
      entryId: rascunho.id,
      measurementUnit: "m2",
      notes: "Referência antiga",
    })).rejects.toThrow(/nova referência da medição/i);

    const corrigido = await chamador().production.updateEntry({
      projectId: obraId,
      entryId: rascunho.id,
      measurementUnit: "m2",
      notes: "Boletim de campo QA 10/10",
    });
    expect(corrigido?.measurementUnit).toBe("m2");
    expect(corrigido?.notes).toBe("Boletim de campo QA 10/10");
  });

  it("medição confirmada não pode ser editada nem excluída direto", async () => {
    const chamar = chamador();
    await expect(
      chamar.production.updateEntry({ projectId: obraId, entryId: lancamentoId, quantity: 60 })
    ).rejects.toThrow(/Desfaça a confirmação/i);
    await expect(
      chamar.production.deleteEntry({ projectId: obraId, entryId: lancamentoId })
    ).rejects.toThrow(/Desfaça a confirmação/i);
  });

  it("desfazer a confirmação tira a medição do avanço sem apagar o histórico", async () => {
    const db = drizzlePglite(pg);
    const chamar = chamador();

    await chamar.production.unconfirmEntry({ projectId: obraId, entryId: lancamentoId });
    await chamar.production.recalcularAvanco({ projectId: obraId });

    const [atual] = await db
      .select({ progress: scheduleActivities.progress })
      .from(scheduleActivities)
      .where(eq(scheduleActivities.id, atividadeAtualId));
    const [lancamento] = await db
      .select({ status: productionEntries.status })
      .from(productionEntries)
      .where(eq(productionEntries.id, lancamentoId));

    expect(atual.progress).toBe(0);
    expect(lancamento.status).toBe("rascunho");
  });

  it("rascunho pode ser corrigido e excluído", async () => {
    const chamar = chamador();
    await chamar.production.unconfirmEntry({ projectId: obraId, entryId: lancamentoId });

    const corrigido = await chamar.production.updateEntry({
      projectId: obraId,
      entryId: lancamentoId,
      quantity: 80,
    });
    expect(Number(corrigido?.quantity)).toBe(80);

    const exclusao = await chamar.production.deleteEntry({ projectId: obraId, entryId: lancamentoId });
    expect(exclusao.deleted).toBe(true);
  });

  it("recusa lançamento com data futura e aceita hoje sem organograma", async () => {
    const db = drizzlePglite(pg);
    const chamar = chamador();
    // Sem frente/equipe/unidade: obra gerada do catálogo não tem organograma e
    // antes ficava com o botão "Registrar" travado para sempre.
    const hoje = new Date();
    const entrada = () =>
      chamar.production.createEntry({
        projectId: obraId,
        activityId: atividadeAtualId,
        productionDate: hoje,
        quantity: 10,
        measurementUnit: "m2",
        status: "confirmada",
      });

    await expect(
      chamar.production.createEntry({
        projectId: obraId,
        activityId: atividadeAtualId,
        productionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        quantity: 10,
        measurementUnit: "m2",
      })
    ).rejects.toThrow(/futuro/i);

    // A mesma chamada com a data de hoje passa — e o avanço soma.
    await entrada();
    await chamar.production.recalcularAvanco({ projectId: obraId });
    const [atual] = await db
      .select({ progress: scheduleActivities.progress })
      .from(scheduleActivities)
      .where(eq(scheduleActivities.id, atividadeAtualId));
    expect(atual.progress).toBeGreaterThan(0);
  });

  it("frente de outra obra continua sendo recusada", async () => {
    const db = drizzlePglite(pg);
    const chamar = chamador();
    const [outraObra] = await db
      .insert(projects)
      .values({ code: "OBRA-OUTRA", name: "Outra obra", location: "Sobral", plannedStart: new Date(), plannedFinish: new Date(), ownerUserId: donoId })
      .returning({ id: projects.id });
    const [frenteDeOutra] = await db
      .insert(productionFronts)
      .values({ projectId: outraObra.id, code: "F1", name: "Frente de outra obra" })
      .returning({ id: productionFronts.id });

    await expect(
      chamar.production.createEntry({
        projectId: obraId,
        frontId: frenteDeOutra.id,
        activityId: atividadeAtualId,
        productionDate: new Date(),
        quantity: 5,
        measurementUnit: "m2",
      })
    ).rejects.toThrow(/não pertence a esta obra/i);
  });
});
