import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  budgetItems,
  budgetVersions,
  costEntries,
  productionEntries,
  projectPlanVersions,
  projects,
  scheduleActivities,
  users,
  wbsNodes,
} from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";
import { coletarDadosEvms, type DbConexao } from "./evm-dados";

/**
 * De onde o EVM tira a baseline, num PostgreSQL de verdade.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * O `projects.evm` montava o BAC com a versão de orçamento de MAIOR número,
 * sem olhar o status. O schema tem `rascunho`, `em_revisao`, `aprovado` e
 * `arquivado` — e o código de edição chega a BLOQUEAR versão `aprovado`
 * (`"Esta versão não aceita novos itens"`), ou seja, o estado existe, é
 * respeitado e nunca foi produzido por nenhuma procedure. Um rascunho virava
 * linha de base e o BAC do EVM era o último número que alguém digitou.
 *
 * Um mock de banco não reproduz a diferença entre "a linha existe" e "a linha
 * tem o status que eu pedi": o filtro é SQL, e é no SQL que o defeito morava.
 * PGlite é o mesmo parser e o mesmo executor do PostgreSQL, em WASM.
 */

let pg: PGlite;
let db: DbConexao;

async function criarObra(sobre: { plannedStart?: Date } = {}) {
  const [user] = await db
    .insert(users)
    .values({ openId: "teste-evm", name: "Teste" })
    .returning({ id: users.id });
  const [projeto] = await db
    .insert(projects)
    .values({
      ownerUserId: user.id,
      code: "OBRA-EVM",
      name: "Obra do teste de EVM",
      location: "Local",
      plannedStart: sobre.plannedStart ?? new Date("2026-01-05T00:00:00"),
      plannedFinish: new Date("2026-12-05T00:00:00"),
    })
    .returning({ id: projects.id });
  return { projectId: projeto.id, userId: user.id };
}

async function criarVersao(
  projectId: number,
  sobre: { versionNumber: number; status: "rascunho" | "em_revisao" | "aprovado" | "arquivado" }
) {
  const [versao] = await db
    .insert(budgetVersions)
    .values({
      projectId,
      name: `Versão ${sobre.versionNumber}`,
      versionNumber: sobre.versionNumber,
      status: sobre.status,
    })
    .returning({ id: budgetVersions.id });
  return versao.id;
}

async function criarItem(
  budgetVersionId: number,
  sobre: { quantity: number; unitPrice: number }
) {
  const [item] = await db
    .insert(budgetItems)
    .values({
      budgetVersionId,
      code: `I-${budgetVersionId}-${sobre.unitPrice}`,
      description: "Item do teste",
      unit: "m3",
      quantity: sobre.quantity.toFixed(3),
      unitPrice: sobre.unitPrice.toFixed(2),
    })
    .returning({ id: budgetItems.id });
  return item.id;
}

/** `schedule_activities.wbsNodeId` é notNull — a atividade precisa de um nó. */
async function criarNo(projectId: number, code: string) {
  const [no] = await db
    .insert(wbsNodes)
    .values({ projectId, code, name: `Pacote ${code}`, level: 2 })
    .returning({ id: wbsNodes.id });
  return no.id;
}

/**
 * `schedule_activities.versionId` tem FK para `project_plan_versions` — um
 * id inventado reprova por violação de FK, que é um crash de montagem do teste,
 * não uma afirmação sobre a regra.
 */
async function criarVersaoDoPlano(projectId: number) {
  const [versao] = await db
    .insert(projectPlanVersions)
    .values({ projectId, versionNumber: 1 })
    .returning({ id: projectPlanVersions.id });
  return versao.id;
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as unknown as DbConexao;
});

afterEach(async () => {
  await pg.close();
});

describe("coletarDadosEvms — a baseline (A3)", () => {
  it("usa a versão APROVADA, mesmo quando existe um rascunho mais novo", async () => {
    // Esta é a ordem real do defeito: a obra aprova a v1, alguém cria a v2 em
    // cima dela, e a v2 (rascunho, nunca aprovada) é a de MAIOR número. O EVM
    // colhia a v2 e o BAC era o rascunho.
    const { projectId } = await criarObra();
    const aprovada = await criarVersao(projectId, {
      versionNumber: 1,
      status: "aprovado",
    });
    const rascunho = await criarVersao(projectId, {
      versionNumber: 2,
      status: "rascunho",
    });
    const itemAprovado = await criarItem(aprovada, {
      quantity: 100,
      unitPrice: 1_000,
    });
    await criarItem(rascunho, { quantity: 999, unitPrice: 9_999 });

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-16T00:00:00"),
      null
    );

    expect(dados.baseline?.versionId).toBe(aprovada);
    expect(dados.items).toHaveLength(1);
    expect(dados.items[0]).toMatchObject({
      id: itemAprovado,
      quantity: 100,
      unitPrice: 1_000,
    });
  });

  it("sem versão aprovada, não colhe item de rascunho", async () => {
    const { projectId } = await criarObra();
    const rascunho = await criarVersao(projectId, {
      versionNumber: 1,
      status: "rascunho",
    });
    await criarItem(rascunho, { quantity: 100, unitPrice: 1_000 });

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-16T00:00:00"),
      null
    );

    expect(dados.baseline).toBeNull();
    expect(dados.items).toEqual([]);
  });

  it("descarta a versão ARQUIVADA quando existe uma aprovada mais nova", async () => {
    const { projectId } = await criarObra();
    await criarVersao(projectId, { versionNumber: 1, status: "arquivado" });
    const aprovada = await criarVersao(projectId, {
      versionNumber: 2,
      status: "aprovado",
    });

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-16T00:00:00"),
      null
    );

    expect(dados.baseline?.versionId).toBe(aprovada);
  });
});

describe("coletarDadosEvms — escopo do cronograma (A4)", () => {
  it("lê só as atividades da versão de trabalho do plano", async () => {
    const { projectId } = await criarObra();
    const noAntigo = await criarNo(projectId, "1.1");
    const noDaVersao = await criarNo(projectId, "1.2");
    const versaoDoPlano = await criarVersaoDoPlano(projectId);
    const [antiga] = await db
      .insert(scheduleActivities)
      .values({
        projectId,
        wbsNodeId: noAntigo,
        wbsCode: "1.1",
        name: "Atividade solta",
        phase: "Execução",
        startOffset: 0,
        durationDays: 5,
        plannedQuantity: "10.000",
      })
      .returning({ id: scheduleActivities.id });
    const [daVersao] = await db
      .insert(scheduleActivities)
      .values({
        projectId,
        wbsNodeId: noDaVersao,
        versionId: versaoDoPlano,
        wbsCode: "1.2",
        name: "Atividade da versão",
        phase: "Execução",
        startOffset: 0,
        durationDays: 5,
        plannedQuantity: "20.000",
      })
      .returning({ id: scheduleActivities.id });

    const comVersao = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-16T00:00:00"),
      versaoDoPlano
    );
    expect(comVersao.activities.map(atividade => atividade.id)).toEqual([
      daVersao.id,
    ]);

    const semVersao = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-16T00:00:00"),
      null
    );
    expect(semVersao.activities.map(atividade => atividade.id)).toEqual([
      antiga.id,
    ]);
  });
});

describe("coletarDadosEvms — calendário do período", () => {
  it("cobre a virada do ano, e não só o ano do início da obra", async () => {
    // Um cronograma de 14 meses sempre cruza a virada. Sem os feriados do
    // segundo ano o 1º de janeiro conta como dia útil — um dia a mais de PV.
    const { projectId } = await criarObra({
      plannedStart: new Date("2026-11-02T00:00:00"),
    });

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2027-02-01T00:00:00"),
      null
    );
    const datas = dados.calendar.exceptions.map(excecao => excecao.date);

    expect(datas).toContain("2026-12-25");
    expect(datas).toContain("2027-01-01");
  });
});

describe("coletarDadosEvms — corte por data e custo real", () => {
  /**
   * Cenário mínimo: uma obra, um item aprovado de 100 m³ a R$ 1.000, uma
   * atividade de 10 dias que consome o item inteiro.
   */
  async function cenario() {
    const { projectId } = await criarObra();
    const versao = await criarVersao(projectId, {
      versionNumber: 1,
      status: "aprovado",
    });
    const itemId = await criarItem(versao, { quantity: 100, unitPrice: 1_000 });
    const versaoDoPlano = await criarVersaoDoPlano(projectId);
    const no = await criarNo(projectId, "1.1");
    const [atividade] = await db
      .insert(scheduleActivities)
      .values({
        projectId,
        versionId: versaoDoPlano,
        wbsNodeId: no,
        wbsCode: "1.1",
        name: "Escavação",
        phase: "Execução",
        startOffset: 0,
        durationDays: 10,
        plannedQuantity: "100.000",
        budgetItemId: itemId,
      })
      .returning({ id: scheduleActivities.id });
    return { projectId, itemId, activityId: atividade.id };
  }

  it("produção com data POSTERIOR ao asOf não entra no avanço", async () => {
    // O defeito antigo: `production_entries` era somada inteira, sem olhar
    // `productionDate`. O EV de setembro mudava quando alguém lançava outubro,
    // e o relatório do passado se reescrevia sozinho.
    const { projectId, activityId } = await cenario();
    await db.insert(productionEntries).values([
      {
        projectId,
        activityId,
        quantity: "40.000",
        measurementUnit: "m3",
        productionDate: new Date("2026-01-10T00:00:00"),
        status: "confirmada",
      },
      {
        projectId,
        activityId,
        quantity: "50.000",
        measurementUnit: "m3",
        productionDate: new Date("2026-03-10T00:00:00"),
        status: "confirmada",
      },
    ]);

    const corte = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-31T00:00:00"),
      null
    );

    expect(corte.actualByActivity.get(activityId)).toBe(40);
  });

  it("custo é classificado: atividade, item e sem vínculo", async () => {
    const { projectId, itemId, activityId } = await cenario();
    await db.insert(costEntries).values([
      {
        projectId,
        activityId,
        competenceDate: new Date("2026-01-10T00:00:00"),
        amount: "1500.00",
        status: "confirmado",
      },
      {
        projectId,
        budgetItemId: itemId,
        competenceDate: new Date("2026-01-11T00:00:00"),
        amount: "250.00",
        status: "confirmado",
      },
      {
        projectId,
        competenceDate: new Date("2026-01-12T00:00:00"),
        amount: "90.00",
        status: "confirmado",
      },
    ]);

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-31T00:00:00"),
      null
    );

    expect(dados.costByActivity.get(activityId)).toBe(1_500);
    expect(dados.costByItem.get(itemId)).toBe(250);
    expect(dados.costUnallocated).toBe(90);
    expect(dados.costEntryCount).toBe(3);
  });

  it("custo cancelado ou com competência futura não entra no AC", async () => {
    const { projectId, activityId } = await cenario();
    await db.insert(costEntries).values([
      {
        projectId,
        activityId,
        competenceDate: new Date("2026-01-10T00:00:00"),
        amount: "1000.00",
        status: "cancelado",
      },
      {
        projectId,
        activityId,
        competenceDate: new Date("2026-04-10T00:00:00"),
        amount: "5000.00",
        status: "confirmado",
      },
      {
        projectId,
        activityId,
        competenceDate: new Date("2026-01-15T00:00:00"),
        amount: "700.00",
        status: "rascunho",
      },
    ]);

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-31T00:00:00"),
      null
    );

    expect(dados.costEntryCount).toBe(0);
    expect(dados.costByActivity.size).toBe(0);
  });

  it("lançamento com as duas pontas conta uma vez só, na atividade", async () => {
    const { projectId, itemId, activityId } = await cenario();
    await db.insert(costEntries).values({
      projectId,
      activityId,
      budgetItemId: itemId,
      competenceDate: new Date("2026-01-10T00:00:00"),
      amount: "2000.00",
      status: "confirmado",
    });

    const dados = await coletarDadosEvms(
      db,
      projectId,
      new Date("2026-01-31T00:00:00"),
      null
    );

    expect(dados.costByActivity.get(activityId)).toBe(2_000);
    expect(dados.costByItem.has(itemId)).toBe(false);
  });
});
