import { eq } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  budgetItems,
  budgetVersions,
  measurementItems,
  measurements,
  productionEntries,
  projectPlanVersions,
  projects,
  scheduleActivities,
  users,
  wbsNodes,
} from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";
import { coletarDadosMedicao } from "./medicao-dados";
import type { DbConexao } from "../construction/lookahead-dados";

/**
 * De onde a medição tira quantidade, num PostgreSQL de verdade.
 *
 * Os três cortes que este teste protege não são de função pura:
 *
 *   1. Produção vale até o FIM DO PERÍODO, não até hoje. Medir fevereiro em
 *      março tem que incluir o que foi produzido em 28/02 e excluir 01/03.
 *   2. O acumulado anterior vem só de medições com `periodEnd` ANTES do início
 *      do período. Se a comparação for `<=`, a nota do mês passado entra duas
 *      vezes e a medição cobra o que já foi faturado.
 *   3. Medição cancelada não consome saldo — senão cancelar uma nota trava a
 *      obra e ninguém entende por quê.
 */

let pg: PGlite;
let db: DbConexao;

const PLANEJADO = new Date("2026-01-05T00:00:00Z");

/** `users.openId` é único: cada obra do teste precisa do seu. */
let proximaObra = 0;

async function criarObra() {
  proximaObra += 1;
  const [user] = await db
    .insert(users)
    .values({ openId: `teste-medicao-${proximaObra}`, name: "Teste" })
    .returning({ id: users.id });
  const [projeto] = await db
    .insert(projects)
    .values({
      ownerUserId: user.id,
      code: `OBRA-MED-${proximaObra}`,
      name: "Obra do teste de medição",
      location: "Local",
      plannedStart: PLANEJADO,
      plannedFinish: new Date("2026-12-31T00:00:00Z"),
    })
    .returning({ id: projects.id });
  return { projectId: projeto.id, userId: user.id };
}

async function criarVersao(projectId: number, versionNumber: number, status: "aprovado" | "rascunho") {
  const [versao] = await db
    .insert(budgetVersions)
    .values({ projectId, name: `Orçamento v${versionNumber}`, versionNumber, status })
    .returning({ id: budgetVersions.id });
  return versao.id;
}

async function criarItem(
  budgetVersionId: number,
  code: string,
  quantity: string,
  unitPrice: string
) {
  const [item] = await db
    .insert(budgetItems)
    .values({
      budgetVersionId,
      code,
      description: `Item ${code}`,
      unit: "m3",
      quantity,
      unitPrice,
    })
    .returning({ id: budgetItems.id });
  return item.id;
}

const versaoDoPlanoPorObra = new Map<number, number>();

async function versaoDoPlano(projectId: number) {
  const existente = versaoDoPlanoPorObra.get(projectId);
  if (existente) return existente;
  const [versao] = await db
    .insert(projectPlanVersions)
    .values({ projectId, versionNumber: 1 })
    .returning({ id: projectPlanVersions.id });
  versaoDoPlanoPorObra.set(projectId, versao.id);
  return versao.id;
}

let proximoNo = 0;

async function criarAtividade(
  projectId: number,
  opcoes: { budgetItemId?: number; quantity?: string } = {}
) {
  proximoNo += 1;
  const wbsCode = `1.${proximoNo}`;
  const [no] = await db
    .insert(wbsNodes)
    .values({ projectId, code: wbsCode, name: `Pacote ${wbsCode}`, level: 2 })
    .returning({ id: wbsNodes.id });
  const [atividade] = await db
    .insert(scheduleActivities)
    .values({
      projectId,
      wbsNodeId: no.id,
      versionId: await versaoDoPlano(projectId),
      wbsCode,
      name: `Atividade ${wbsCode}`,
      phase: "Execução",
      startOffset: 0,
      durationDays: 5,
      plannedQuantity: opcoes.quantity ?? "100.000",
      unit: "m3",
      budgetItemId: opcoes.budgetItemId ?? null,
    })
    .returning({ id: scheduleActivities.id });
  return atividade.id;
}

async function lancarProducao(
  projectId: number,
  activityId: number,
  dataIso: string,
  quantity: string,
  status: "confirmada" | "rascunho" = "confirmada"
) {
  await db.insert(productionEntries).values({
    projectId,
    activityId,
    productionDate: new Date(`${dataIso}T12:00:00Z`),
    quantity,
    measurementUnit: "m3",
    status,
  });
}

async function criarMedicao(
  projectId: number,
  number: number,
  periodo: { start: string; end: string },
  status: "rascunho" | "aprovada" | "cancelada" = "aprovada"
) {
  const [medicao] = await db
    .insert(measurements)
    .values({
      projectId,
      number,
      periodStart: new Date(`${periodo.start}T00:00:00Z`),
      periodEnd: new Date(`${periodo.end}T00:00:00Z`),
      status,
    })
    .returning({ id: measurements.id });
  return medicao.id;
}

async function medirItem(measurementId: number, budgetItemId: number, quantity: string) {
  await db.insert(measurementItems).values({
    measurementId,
    budgetItemId,
    description: "Item medido",
    unit: "m3",
    quantity,
    unitPrice: "10.00",
    amount: (Number(quantity) * 10).toFixed(2),
  });
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as unknown as DbConexao;
  versaoDoPlanoPorObra.clear();
  proximoNo = 0;
  proximaObra = 0;
});

afterEach(async () => {
  await pg.close();
});

describe("coletarDadosMedicao — produção no período", () => {
  it("não desconta medição em rascunho ou revisão de períodos anteriores", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");
    const atividadeId = await criarAtividade(projectId, { budgetItemId: itemId });
    await lancarProducao(projectId, atividadeId, "2026-02-04", "60.000");

    const anteriorRascunho = await criarMedicao(
      projectId, 1, { start: "2026-01-01", end: "2026-01-31" }, "rascunho"
    );
    await medirItem(anteriorRascunho, itemId, "20.000");

    const resultado = await coletarDadosMedicao(
      db, projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );
    expect(resultado.produzidoAcumulado).toEqual([{ budgetItemId: itemId, quantity: 60 }]);
    expect(resultado.medidoAcumuladoAnterior).toEqual([]);

    await db.update(measurements)
      .set({ status: "aprovada" })
      .where(eq(measurements.id, anteriorRascunho));
    const aprovado = await coletarDadosMedicao(
      db, projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );
    expect(aprovado.medidoAcumuladoAnterior).toEqual([{ budgetItemId: itemId, quantity: 20 }]);
  });


  it("inclui o último dia do período e exclui o primeiro dia do seguinte", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");
    const atividadeId = await criarAtividade(projectId, { budgetItemId: itemId });

    await lancarProducao(projectId, atividadeId, "2026-02-10", "30.000");
    await lancarProducao(projectId, atividadeId, "2026-02-28", "20.000");
    await lancarProducao(projectId, atividadeId, "2026-03-01", "99.000");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.produzidoAcumulado).toEqual([{ budgetItemId: itemId, quantity: 50 }]);
  });

  it("ignora produção em rascunho", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");
    const atividadeId = await criarAtividade(projectId, { budgetItemId: itemId });

    await lancarProducao(projectId, atividadeId, "2026-02-10", "30.000", "confirmada");
    await lancarProducao(projectId, atividadeId, "2026-02-11", "50.000", "rascunho");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.produzidoAcumulado).toEqual([{ budgetItemId: itemId, quantity: 30 }]);
  });

  it("soma produção de atividades diferentes que apontam para o mesmo item", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");
    const a1 = await criarAtividade(projectId, { budgetItemId: itemId });
    const a2 = await criarAtividade(projectId, { budgetItemId: itemId });

    await lancarProducao(projectId, a1, "2026-02-10", "10.000");
    await lancarProducao(projectId, a2, "2026-02-12", "15.000");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.produzidoAcumulado).toEqual([{ budgetItemId: itemId, quantity: 25 }]);
  });

  it("separa a produção de atividade sem item de orçamento", async () => {
    const { projectId } = await criarObra();
    await criarVersao(projectId, 1, "aprovado");
    const semItem = await criarAtividade(projectId);
    await lancarProducao(projectId, semItem, "2026-02-10", "40.000");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.produzidoSemItem).toBe(40);
    expect(dados.produzidoAcumulado).toEqual([]);
  });
});

describe("coletarDadosMedicao — baseline", () => {
  it("usa os itens da versão aprovada de maior número", async () => {
    const { projectId } = await criarObra();
    const v1 = await criarVersao(projectId, 1, "aprovado");
    await criarItem(v1, "01.01", "100.000", "10.00");
    const v2 = await criarVersao(projectId, 2, "aprovado");
    const itemV2 = await criarItem(v2, "01.01", "120.000", "12.00");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.baseline).toMatchObject({ versionNumber: 2 });
    expect(dados.itens).toHaveLength(1);
    expect(dados.itens[0]).toMatchObject({
      budgetItemId: itemV2,
      quantity: 120,
      unitPrice: 12,
    });
  });

  it("não mistura item de versão em rascunho", async () => {
    const { projectId } = await criarObra();
    const aprovada = await criarVersao(projectId, 1, "aprovado");
    await criarItem(aprovada, "01.01", "100.000", "10.00");
    const rascunho = await criarVersao(projectId, 2, "rascunho");
    await criarItem(rascunho, "01.02", "500.000", "99.00");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.baseline?.versionNumber).toBe(1);
    expect(dados.itens.map(i => i.code)).toEqual(["01.01"]);
  });

  it("sem versão aprovada devolve baseline nula e lista vazia, sem erro", async () => {
    const { projectId } = await criarObra();

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.baseline).toBeNull();
    expect(dados.itens).toEqual([]);
  });
});

describe("coletarDadosMedicao — acumulado anterior", () => {
  it("conta só medição encerrada ANTES do início do período", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");

    const janeiro = await criarMedicao(projectId, 1, { start: "2026-01-01", end: "2026-01-31" });
    await medirItem(janeiro, itemId, "30.000");

    const fevereiro = await criarMedicao(projectId, 2, { start: "2026-02-01", end: "2026-02-28" });
    await medirItem(fevereiro, itemId, "20.000");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    // A de fevereiro é a MEDIÇÃO ATUAL: não entra no acumulado anterior.
    expect(dados.medidoAcumuladoAnterior).toEqual([{ budgetItemId: itemId, quantity: 30 }]);
  });

  it("não deixa medição cancelada consumir saldo", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");

    const cancelada = await criarMedicao(
      projectId,
      1,
      { start: "2026-01-01", end: "2026-01-31" },
      "cancelada"
    );
    await medirItem(cancelada, itemId, "40.000");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.medidoAcumuladoAnterior).toEqual([]);
  });

  it("não vaza medição de outra obra", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");

    const { projectId: outraObra } = await criarObra();
    const medicaoDeOutra = await criarMedicao(outraObra, 1, {
      start: "2026-01-01",
      end: "2026-01-31",
    });
    await medirItem(medicaoDeOutra, itemId, "70.000");

    const dados = await coletarDadosMedicao(
      db,
      projectId,
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-02-28T23:59:59Z")
    );

    expect(dados.medidoAcumuladoAnterior).toEqual([]);
  });
});

describe("tabelas de medição — garantias do banco", () => {
  it("recusa duas medições com o mesmo número na mesma obra", async () => {
    const { projectId } = await criarObra();
    await criarMedicao(projectId, 1, { start: "2026-01-01", end: "2026-01-31" });

    await expect(
      criarMedicao(projectId, 1, { start: "2026-02-01", end: "2026-02-28" })
    ).rejects.toThrow();
  });

  it("aceita o mesmo número em obras diferentes", async () => {
    const { projectId } = await criarObra();
    const { projectId: outraObra } = await criarObra();

    await criarMedicao(projectId, 1, { start: "2026-01-01", end: "2026-01-31" });
    await expect(
      criarMedicao(outraObra, 1, { start: "2026-01-01", end: "2026-01-31" })
    ).resolves.toBeGreaterThan(0);
  });

  it("recusa período com fim antes do início", async () => {
    const { projectId } = await criarObra();

    await expect(
      criarMedicao(projectId, 1, { start: "2026-02-28", end: "2026-02-01" })
    ).rejects.toThrow();
  });

  it("recusa retenção fora de 0–100%", async () => {
    const { projectId } = await criarObra();

    await expect(
      db.insert(measurements).values({
        projectId,
        number: 5,
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-01-31T00:00:00Z"),
        retentionPercent: "101.00",
      })
    ).rejects.toThrow();
  });

  it("recusa quantidade zero ou negativa em item medido", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");
    const medicao = await criarMedicao(projectId, 1, {
      start: "2026-01-01",
      end: "2026-01-31",
    });

    await expect(medirItem(medicao, itemId, "0.000")).rejects.toThrow();
  });

  it("recusa o mesmo item duas vezes na mesma medição", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "100.000", "10.00");
    const medicao = await criarMedicao(projectId, 1, {
      start: "2026-01-01",
      end: "2026-01-31",
    });

    await medirItem(medicao, itemId, "10.000");
    await expect(medirItem(medicao, itemId, "5.000")).rejects.toThrow();
  });
});
