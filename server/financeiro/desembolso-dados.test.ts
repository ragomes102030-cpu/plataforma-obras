import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  budgetItems,
  budgetVersions,
  costEntries,
  projectPlanVersions,
  projects,
  scheduleActivities,
  users,
  wbsNodes,
} from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";
import { coletarDadosDesembolso } from "./desembolso-dados";
import type { DbConexao } from "../construction/lookahead-dados";

/**
 * De onde a curva de desembolso tira dinheiro, num PostgreSQL de verdade.
 *
 * O que este teste protege:
 *
 *   1. Peso da atividade = quantidade planejada × preço do item da BASELINE
 *      aprovada. Atividade sem item não vira custo zero — vira contagem em
 *      `atividadesSemItem`, para o painel poder avisar que a curva está
 *      subestimada em vez de mostrar uma obra mais barata do que é.
 *   2. Competência é meia-noite UTC. Bucket por fuso local jogaria todo
 *      lançamento do dia 1º para o mês anterior.
 *   3. Só custo `confirmado` e até `asOf`: nota cancelada e nota do mês que
 *      vem não são caixa que saiu.
 */

let pg: PGlite;
let db: DbConexao;

let proximaObra = 0;
let proximoNo = 0;
const versaoDoPlanoPorObra = new Map<number, number>();

/** Sem `Z`: `plannedStart` é data local (a obra começa no dia, não no UTC). */
const PLANEJADO = new Date("2026-01-05T00:00:00");

async function criarObra() {
  proximaObra += 1;
  const [user] = await db
    .insert(users)
    .values({ openId: `teste-desembolso-${proximaObra}`, name: "Teste" })
    .returning({ id: users.id });
  const [projeto] = await db
    .insert(projects)
    .values({
      ownerUserId: user.id,
      code: `OBRA-DES-${proximaObra}`,
      name: "Obra do teste de desembolso",
      location: "Local",
      plannedStart: PLANEJADO,
      plannedFinish: new Date("2026-12-31T00:00:00"),
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

async function criarItem(budgetVersionId: number, code: string, unitPrice: string) {
  const [item] = await db
    .insert(budgetItems)
    .values({
      budgetVersionId,
      code,
      description: `Item ${code}`,
      unit: "m3",
      quantity: "100.000",
      unitPrice,
    })
    .returning({ id: budgetItems.id });
  return item.id;
}

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

async function criarAtividade(
  projectId: number,
  opcoes: {
    budgetItemId?: number;
    plannedQuantity?: string;
    startOffset?: number;
    durationDays?: number;
    versionId?: number | null;
  } = {}
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
      versionId: opcoes.versionId === undefined ? await versaoDoPlano(projectId) : opcoes.versionId,
      wbsCode,
      name: `Atividade ${wbsCode}`,
      phase: "Execução",
      startOffset: opcoes.startOffset ?? 0,
      durationDays: opcoes.durationDays ?? 5,
      plannedQuantity: opcoes.plannedQuantity ?? "10.000",
      unit: "m3",
      budgetItemId: opcoes.budgetItemId ?? null,
    })
    .returning({ id: scheduleActivities.id });
  return atividade.id;
}

async function lancarCusto(
  projectId: number,
  competenceIso: string,
  amount: string,
  status: "confirmado" | "cancelado" = "confirmado"
) {
  await db.insert(costEntries).values({
    projectId,
    competenceDate: new Date(`${competenceIso}T00:00:00Z`),
    amount,
    status,
  });
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as unknown as DbConexao;
  versaoDoPlanoPorObra.clear();
  proximaObra = 0;
  proximoNo = 0;
});

afterEach(async () => {
  await pg.close();
});

describe("coletarDadosDesembolso — peso planejado", () => {
  it("pesa a atividade por quantidade × preço do item aprovado", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "25.00");
    await criarAtividade(projectId, { budgetItemId: itemId, plannedQuantity: "40.000" });

    const dados = await coletarDadosDesembolso(
      db,
      projectId,
      "2026-02-28",
      await versaoDoPlano(projectId)
    );

    expect(dados.atividades).toHaveLength(1);
    expect(dados.atividades[0].peso).toBe(1000);
    expect(dados.atividadesSemItem).toBe(0);
  });

  it("conta atividade sem item em vez de tratá-la como custo zero", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "25.00");
    await criarAtividade(projectId, { budgetItemId: itemId });
    await criarAtividade(projectId);

    const dados = await coletarDadosDesembolso(
      db,
      projectId,
      "2026-02-28",
      await versaoDoPlano(projectId)
    );

    expect(dados.atividades).toHaveLength(1);
    expect(dados.atividadesSemItem).toBe(1);
  });

  it("não usa preço de item de versão em rascunho", async () => {
    const { projectId } = await criarObra();
    const aprovada = await criarVersao(projectId, 1, "aprovado");
    await criarItem(aprovada, "01.01", "10.00");
    const rascunho = await criarVersao(projectId, 2, "rascunho");
    const itemRascunho = await criarItem(rascunho, "01.02", "99.00");

    await criarAtividade(projectId, { budgetItemId: itemRascunho });

    const dados = await coletarDadosDesembolso(
      db,
      projectId,
      "2026-02-28",
      await versaoDoPlano(projectId)
    );

    expect(dados.atividades).toHaveLength(0);
    expect(dados.atividadesSemItem).toBe(1);
  });

  it("considera só as atividades da versão de plano corrente", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "10.00");

    const [outraVersao] = await db
      .insert(projectPlanVersions)
      .values({ projectId, versionNumber: 2 })
      .returning({ id: projectPlanVersions.id });

    await criarAtividade(projectId, { budgetItemId: itemId, plannedQuantity: "10.000" });
    await criarAtividade(projectId, {
      budgetItemId: itemId,
      plannedQuantity: "90.000",
      versionId: outraVersao.id,
    });

    const dados = await coletarDadosDesembolso(
      db,
      projectId,
      "2026-02-28",
      await versaoDoPlano(projectId)
    );

    expect(dados.atividades).toHaveLength(1);
    expect(dados.atividades[0].peso).toBe(100);
  });

  it("sem versão corrente cai nas atividades sem versão", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "10.00");
    await criarAtividade(projectId, { budgetItemId: itemId, versionId: null });

    const dados = await coletarDadosDesembolso(db, projectId, "2026-02-28", null);

    expect(dados.atividades).toHaveLength(1);
  });

  it("usa earlyStart (data cedo do CPM) quando existe", async () => {
    const { projectId } = await criarObra();
    const versaoId = await criarVersao(projectId, 1, "aprovado");
    const itemId = await criarItem(versaoId, "01.01", "10.00");
    proximoNo += 1;
    const [no] = await db
      .insert(wbsNodes)
      .values({ projectId, code: "2.1", name: "Pacote 2.1", level: 2 })
      .returning({ id: wbsNodes.id });
    await db.insert(scheduleActivities).values({
      projectId,
      wbsNodeId: no.id,
      versionId: await versaoDoPlano(projectId),
      wbsCode: "2.1",
      name: "Atividade 2.1",
      phase: "Execução",
      startOffset: 3,
      earlyStart: 11,
      durationDays: 2,
      plannedQuantity: "10.000",
      unit: "m3",
      budgetItemId: itemId,
    });

    const dados = await coletarDadosDesembolso(
      db,
      projectId,
      "2026-02-28",
      await versaoDoPlano(projectId)
    );

    expect(dados.atividades[0].startOffset).toBe(11);
    expect(dados.atividades[0].durationDays).toBe(2);
  });
});

describe("coletarDadosDesembolso — custo realizado", () => {
  it("agrupa por mês de competência em UTC", async () => {
    const { projectId } = await criarObra();
    await lancarCusto(projectId, "2026-02-01", "100.00");
    await lancarCusto(projectId, "2026-02-28", "250.50");
    await lancarCusto(projectId, "2026-03-01", "90.00");

    const dados = await coletarDadosDesembolso(db, projectId, "2026-03-31", await versaoDoPlano(projectId));

    expect(dados.custoRealPorMes).toEqual([
      { mes: "2026-02", valor: 350.5 },
      { mes: "2026-03", valor: 90 },
    ]);
  });

  it("corta pelo asOf: nota de abril não aparece em março", async () => {
    const { projectId } = await criarObra();
    await lancarCusto(projectId, "2026-03-31", "10.00");
    await lancarCusto(projectId, "2026-04-01", "999.00");

    const dados = await coletarDadosDesembolso(db, projectId, "2026-03-31", await versaoDoPlano(projectId));

    expect(dados.custoRealPorMes).toEqual([{ mes: "2026-03", valor: 10 }]);
  });

  it("ignora lançamento cancelado", async () => {
    const { projectId } = await criarObra();
    await lancarCusto(projectId, "2026-02-10", "100.00", "confirmado");
    await lancarCusto(projectId, "2026-02-11", "500.00", "cancelado");

    const dados = await coletarDadosDesembolso(db, projectId, "2026-02-28", await versaoDoPlano(projectId));

    expect(dados.custoRealPorMes).toEqual([{ mes: "2026-02", valor: 100 }]);
  });

  it("não vaza custo de outra obra", async () => {
    const { projectId } = await criarObra();
    const { projectId: outraObra } = await criarObra();
    await lancarCusto(outraObra, "2026-02-10", "777.00");

    const dados = await coletarDadosDesembolso(db, projectId, "2026-02-28", await versaoDoPlano(projectId));

    expect(dados.custoRealPorMes).toEqual([]);
  });

  it("sem orçamento aprovado ainda devolve o custo real, e avisa das atividades órfãs", async () => {
    const { projectId } = await criarObra();
    await criarAtividade(projectId);
    await lancarCusto(projectId, "2026-02-10", "50.00");

    const dados = await coletarDadosDesembolso(db, projectId, "2026-02-28", await versaoDoPlano(projectId));

    expect(dados.atividades).toEqual([]);
    expect(dados.atividadesSemItem).toBe(1);
    expect(dados.custoRealPorMes).toEqual([{ mes: "2026-02", valor: 50 }]);
  });
});

describe("coletarDadosDesembolso — ponto de partida", () => {
  it("usa a data de início planejada da obra", async () => {
    const { projectId } = await criarObra();

    const dados = await coletarDadosDesembolso(db, projectId, "2026-02-28", await versaoDoPlano(projectId));

    expect(dados.plannedStartIso).toBe("2026-01-05");
  });

  it("devolve calendário utilizável para o cálculo em dias úteis", async () => {
    const { projectId } = await criarObra();

    const dados = await coletarDadosDesembolso(db, projectId, "2026-02-28", await versaoDoPlano(projectId));

    expect(dados.calendar).toBeTruthy();
    expect(dados.calendar.exceptions).toBeDefined();
  });
});
