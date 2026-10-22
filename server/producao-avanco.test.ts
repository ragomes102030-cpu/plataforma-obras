import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  productionEntries,
  productionFronts,
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
