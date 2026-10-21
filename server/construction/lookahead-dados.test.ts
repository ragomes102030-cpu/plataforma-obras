import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  planningConstraints,
  productionEntries,
  projectPlanVersions,
  projects,
  scheduleActivities,
  users,
  wbsNodes,
  weeklyCommitments,
} from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";
import { coletarDadosLookahead, type DbConexao } from "./lookahead-dados";

/**
 * De onde o lookahead tira a semana, num PostgreSQL de verdade.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * Três defeitos moram na fronteira entre o banco e a conta, e nenhum deles
 * aparece num teste de função pura:
 *
 *   1. `weekStart` é gravado como meia-noite UTC de segunda. Se a leitura
 *      comparar com data local, a segunda vira domingo em qualquer servidor a
 *      oeste de Greenwich — e o compromisso da semana desaparece do relatório
 *      sem erro nenhum.
 *   2. `em_andamento` é restrição sendo resolvida, não resolvida. Se o filtro
 *      aceitar só `aberta`, a frente aparece "pronta" com o material ainda a
 *      caminho.
 *   3. Produção lançada com data futura não aconteceu. Sem o corte em hoje, o
 *      executado da semana que vem já infla o percentual desta.
 *
 * PGlite é o mesmo parser e executor do PostgreSQL, em WASM: os CHECKs e o
 * índice único são testados de verdade, não presumidos.
 */

let pg: PGlite;
let db: DbConexao;

const PLANEJADO = new Date("2026-01-05T00:00:00"); // segunda-feira

async function criarObra() {
  const [user] = await db
    .insert(users)
    .values({ openId: "teste-lookahead", name: "Teste" })
    .returning({ id: users.id });
  const [projeto] = await db
    .insert(projects)
    .values({
      ownerUserId: user.id,
      code: "OBRA-LOOK",
      name: "Obra do teste de lookahead",
      location: "Local",
      plannedStart: PLANEJADO,
      plannedFinish: new Date("2026-12-05T00:00:00"),
    })
    .returning({ id: projects.id });
  return { projectId: projeto.id, userId: user.id };
}

/** `project_plan_versions` tem índice único (projectId, versionNumber). */
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

async function criarAtividade(
  projectId: number,
  sobre: { wbsCode: string; startOffset: number; durationDays?: number; quantity?: number }
) {
  const [no] = await db
    .insert(wbsNodes)
    .values({ projectId, code: sobre.wbsCode, name: `Pacote ${sobre.wbsCode}`, level: 2 })
    .returning({ id: wbsNodes.id });
  const versionId = await versaoDoPlano(projectId);
  const [atividade] = await db
    .insert(scheduleActivities)
    .values({
      projectId,
      wbsNodeId: no.id,
      versionId,
      wbsCode: sobre.wbsCode,
      name: `Atividade ${sobre.wbsCode}`,
      phase: "Execução",
      startOffset: sobre.startOffset,
      durationDays: sobre.durationDays ?? 5,
      plannedQuantity: (sobre.quantity ?? 100).toFixed(3),
    })
    .returning({ id: scheduleActivities.id });
  return atividade.id;
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as unknown as DbConexao;
  versaoDoPlanoPorObra.clear();
});

afterEach(async () => {
  await pg.close();
});

describe("coletarDadosLookahead — datas e janela", () => {
  it("converte o offset em dias ÚTEIS, não em dias corridos", async () => {
    const { projectId } = await criarObra();
    // Offset 5 = segunda seguinte (o calendário padrão trabalha seg-sex).
    await criarAtividade(projectId, { wbsCode: "1.1", startOffset: 5, durationDays: 2 });

    const dados = await coletarDadosLookahead(
      db,
      projectId,
      "2026-01-12",
      "2026-01-12",
      await versaoDoPlano(projectId)
    );

    expect(dados.input.semanaBaseIso).toBe("2026-01-12");
    expect(dados.input.atividades[0]).toMatchObject({
      startIso: "2026-01-12",
      finishIso: "2026-01-13",
    });
  });

  it("traz o compromisso da semana certa e ignora o das outras", async () => {
    const { projectId } = await criarObra();
    const atividadeId = await criarAtividade(projectId, {
      wbsCode: "1.1",
      startOffset: 5,
    });

    await db.insert(weeklyCommitments).values([
      {
        projectId,
        activityId: atividadeId,
        weekStart: new Date("2026-01-12T00:00:00Z"),
        status: "concluido",
      },
      {
        projectId,
        activityId: atividadeId,
        weekStart: new Date("2026-01-19T00:00:00Z"),
        status: "planejado",
      },
      // Fora da janela de 4 semanas: não pode entrar.
      {
        projectId,
        activityId: atividadeId,
        weekStart: new Date("2026-06-01T00:00:00Z"),
        status: "planejado",
      },
    ]);

    const dados = await coletarDadosLookahead(
      db,
      projectId,
      "2026-01-12",
      "2026-01-14",
      await versaoDoPlano(projectId)
    );

    expect(dados.input.compromissos).toHaveLength(2);
    expect(dados.input.compromissos.map(c => c.weekStartIso)).toEqual([
      "2026-01-12",
      "2026-01-19",
    ]);
  });

  it("conta produção confirmada só até hoje", async () => {
    const { projectId } = await criarObra();
    const atividadeId = await criarAtividade(projectId, {
      wbsCode: "1.1",
      startOffset: 0,
      quantity: 100,
    });

    await db.insert(productionEntries).values([
      {
        projectId,
        activityId: atividadeId,
        quantity: "40.000",
        measurementUnit: "m3",
        productionDate: new Date("2026-01-06T00:00:00"),
        status: "confirmada",
      },
      {
        projectId,
        activityId: atividadeId,
        quantity: "50.000",
        measurementUnit: "m3",
        // Data futura: ainda não aconteceu, não pode inflar o executado.
        productionDate: new Date("2026-02-10T00:00:00"),
        status: "confirmada",
      },
      {
        projectId,
        activityId: atividadeId,
        quantity: "30.000",
        measurementUnit: "m3",
        productionDate: new Date("2026-01-07T00:00:00"),
        status: "rascunho",
      },
    ]);

    const dados = await coletarDadosLookahead(
      db,
      projectId,
      "2026-01-05",
      "2026-01-15",
      await versaoDoPlano(projectId)
    );

    expect(dados.input.atividades[0]!.executedQuantity).toBe(40);
  });
});

describe("coletarDadosLookahead — restrições", () => {
  it("conta aberta e em_andamento como bloqueio; removida e cancelada não", async () => {
    const { projectId } = await criarObra();
    const livre = await criarAtividade(projectId, { wbsCode: "1.1", startOffset: 0 });
    const travada = await criarAtividade(projectId, { wbsCode: "1.2", startOffset: 0 });

    await db.insert(planningConstraints).values([
      {
        projectId,
        activityId: travada,
        type: "material",
        description: "Aço do 3º lote não chegou",
        status: "aberta",
      },
      {
        projectId,
        activityId: travada,
        type: "projeto",
        description: "Detalhe de armação em revisão",
        status: "em_andamento",
      },
      {
        projectId,
        activityId: travada,
        type: "frente_trabalho",
        description: "Chuva prevista",
        status: "removida",
        removedAt: new Date(),
      },
      {
        projectId,
        activityId: livre,
        type: "outro",
        description: "Restrição cancelada não trava",
        status: "cancelada",
      },
    ]);

    const dados = await coletarDadosLookahead(
      db,
      projectId,
      "2026-01-05",
      "2026-01-06",
      await versaoDoPlano(projectId)
    );

    const porId = new Map(dados.input.atividades.map(a => [a.id, a]));
    expect(porId.get(travada)!.openConstraints).toBe(2);
    expect(porId.get(livre)!.openConstraints).toBe(0);
  });
});

describe("garantias do banco para o PPC", () => {
  it("recusa compromisso que não começa na segunda-feira", async () => {
    const { projectId } = await criarObra();
    const atividadeId = await criarAtividade(projectId, { wbsCode: "1.1", startOffset: 0 });

    await expect(
      db.insert(weeklyCommitments).values({
        projectId,
        activityId: atividadeId,
        // terça-feira
        weekStart: new Date("2026-01-13T00:00:00Z"),
      })
    ).rejects.toThrow();
  });

  it("recusa não cumprimento sem motivo", async () => {
    const { projectId } = await criarObra();
    const atividadeId = await criarAtividade(projectId, { wbsCode: "1.1", startOffset: 0 });

    await expect(
      db.insert(weeklyCommitments).values({
        projectId,
        activityId: atividadeId,
        weekStart: new Date("2026-01-12T00:00:00Z"),
        status: "nao_concluido",
      })
    ).rejects.toThrow();
  });

  it("não deixa a mesma atividade ser comprometida duas vezes na semana", async () => {
    const { projectId } = await criarObra();
    const atividadeId = await criarAtividade(projectId, { wbsCode: "1.1", startOffset: 0 });
    const semana = new Date("2026-01-12T00:00:00Z");

    await db.insert(weeklyCommitments).values({ projectId, activityId: atividadeId, weekStart: semana });

    await expect(
      db.insert(weeklyCommitments).values({ projectId, activityId: atividadeId, weekStart: semana })
    ).rejects.toThrow();
  });
});
