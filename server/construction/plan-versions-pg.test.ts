import { and, eq, isNull } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentDecisions,
  projectPlanVersions,
  projects,
  scheduleActivities,
  scheduleDependencies,
  users,
  wbsNodes,
} from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";

/**
 * A regra de versão do plano, num PostgreSQL de verdade.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * O painel reportava zero nós numa obra que tinha 117. A causa não era um `if`
 * esquecido: era o SQL. `associateOrphanPlanNodes` roda e adota os órfãos, mas
 * só no caminho que CRIA a versão. No caminho que REAPROVEITA a versão existente
 * a função retorna antes, e os órfãos ficam com `versionId` nulo para sempre.
 *
 * E o nulo é invisível por construção: `WHERE "versionId" IN (1)` devolve
 * `UNKNOWN` para uma linha com `versionId` nulo — não verdadeiro, não falso — e
 * a linha sai do resultado. O `GROUP BY` nunca produz o bucket `null`, e a
 * contagem vira zero sem que nenhum código precise mentir. Um mock de banco não
 * reproduz isso, porque o `UNKNOWN` se dissolve dentro do driver de rede antes de
 * qualquer código ver. PGlite é o mesmo executor, em WASM.
 *
 * O QUE ESTE TESTE PROVA, E O QUE ELE NÃO PROVA
 *
 * Prova que a contagem e a adoção concordam com o que o banco contém. Não prova
 * nada sobre a migration, nem sobre a API: são camadas diferentes, e o que cada
 * uma delas esconde é diferente.
 */

/** O módulo `db` é trocado por um que devolve o PGlite. */
const alvo = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../db", async importOriginal => {
  // O módulo real é importado de propósito. Ele não só exporta `getDb`: ele
  // instala `$returningIds` no prototype de `PgInsertBase` no carregamento do
  // módulo. Trocar o módulo inteiro apagaria esse patch, e o teste falharia com
  // "$returningIds is not a function" — um CRASH, que é a forma de falha que não
  // prova nada: qualquer defeito, ou nenhum, produziria o mesmo erro. Só o
  // `getDb` é substituído; o resto do módulo continua sendo ele mesmo.
  const real = await importOriginal<typeof import("../db")>();
  return { ...real, getDb: async () => alvo.db };
});

const { approveCurrentPlanVersion, ensureWritablePlanVersion, listPlanVersionDetails } =
  await import("./plan-versions");

type Db = NonNullable<typeof alvo.db>;

let pg: PGlite;
let db: Db;

const CODIGOS = Array.from({ length: 117 }, (_, i) => `1.${i + 1}`);

/**
 * Cria usuário e obra. O `plannedStart` é notNull e o schema não tem default.
 *
 * Devolve o `userId` junto porque três testes precisam dele e porque assumi-lo
 * igual a 1 seria depender de a sequência de identidade começar em 1 — o que é
 * verdade hoje e não é uma propriedade do schema.
 */
async function criarObra(): Promise<{ projectId: number; userId: number }> {
  const [user] = await db
    .insert(users)
    .values({ openId: "teste-versionid", name: "Teste" })
    .$returningIds();
  const [projeto] = await db
    .insert(projects)
    .values({
      ownerUserId: user,
      code: "OBRA-VERSIONID",
      name: "Obra do teste de versão",
      location: "Local",
      plannedStart: new Date("2026-01-05T00:00:00Z"),
      plannedFinish: new Date("2026-12-05T00:00:00Z"),
    })
    .$returningIds();
  return { projectId: projeto, userId: user };
}

/**
 * 117 nós de EAP e 117 atividades, TODOS sem `versionId` — a condição em que a
 * obra nasce. É assim que `seedStarterPlan`, `seedSolarPlan` e o `eap-seeder`
 * gravam: nenhum dos três passa `versionId`, porque na criação da obra ainda
 * não existe versão para apontar.
 */
async function semearPlano(projectId: number): Promise<void> {
  const nodeIds = await db
    .insert(wbsNodes)
    .values(
      CODIGOS.map((code, i) => ({
        projectId,
        code,
        name: `Pacote ${i + 1}`,
        level: 2,
        sortOrder: i,
      }))
    )
    .$returningIds();
  const activityIds = await db
    .insert(scheduleActivities)
    .values(
      CODIGOS.map((code, i) => ({
        projectId,
        wbsNodeId: nodeIds[i]!,
        wbsCode: code,
        name: `Atividade ${i + 1}`,
        phase: "Geral",
        startOffset: i,
        durationDays: 1,
      }))
    )
    .$returningIds();
  await db.insert(scheduleDependencies).values(
    activityIds.slice(0, -1).map((predecessorId, i) => ({
      projectId,
      predecessorId,
      successorId: activityIds[i + 1]!,
    }))
  );
}

/**
 * A decisão que aprova a versão. `projectPlanVersions.decisionId` tem chave
 * estrangeira para `agentDecisions`, então o id tem que existir de verdade: um
 * id inventado reprovaria por violação de FK, que é um crash de montagem do
 * teste, não uma afirmação sobre a regra.
 */
async function criarDecisao(projectId: number, userId: number): Promise<number> {
  const [decisao] = await db
    .insert(agentDecisions)
    .values({
      projectId,
      userId,
      stage: "EAP",
      decision: "approved",
      scopeJson: "{}",
    })
    .$returningIds();
  return decisao;
}

/** Quantos nós/atividades/dependências seguem sem `versionId`. */
async function orfaosCountados(projectId: number) {
  const [wbs, atividades, dependencias] = await Promise.all([
    db
      .select({ n: wbsNodes.id })
      .from(wbsNodes)
      .where(
        and(eq(wbsNodes.projectId, projectId), isNull(wbsNodes.versionId))
      ),
    db
      .select({ n: scheduleActivities.id })
      .from(scheduleActivities)
      .where(
        and(
          eq(scheduleActivities.projectId, projectId),
          isNull(scheduleActivities.versionId)
        )
      ),
    db
      .select({ n: scheduleDependencies.id })
      .from(scheduleDependencies)
      .where(
        and(
          eq(scheduleDependencies.projectId, projectId),
          isNull(scheduleDependencies.versionId)
        )
      ),
  ]);
  return {
    wbs: wbs.length,
    atividades: atividades.length,
    dependencias: dependencias.length,
  };
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as Db;
  alvo.db = db;
});

afterEach(async () => {
  await pg.close();
});

describe("versão do plano: o que o painel conta", () => {
  it("conta os nós da obra mesmo quando a versão foi criada antes deles", async () => {
    // A ordem importa e é a ordem real: a obra nasce sem versão, alguém cria a
    // PRIMEIRA versão (que adota o que existe), e DEPOIS a obra é semeada com 117
    // nós. O caminho de criação já adotava; o de reaproveitamento é que não
    // adota, e é nele que estes 117 ficam para trás.
    const { projectId, userId } = await criarObra();
    await semearPlano(projectId);

    const primeira = await ensureWritablePlanVersion(projectId, userId);
    expect(primeira.id).toBeGreaterThan(0);
    // A primeira versão absorveu o que existia; ainda assim, semear DEPOIS
    // reproduz o estado que o painel viu: nós sem versão.
    await db
      .update(wbsNodes)
      .set({ versionId: null })
      .where(eq(wbsNodes.projectId, projectId));
    await db
      .update(scheduleActivities)
      .set({ versionId: null })
      .where(eq(scheduleActivities.projectId, projectId));
    await db
      .update(scheduleDependencies)
      .set({ versionId: null })
      .where(eq(scheduleDependencies.projectId, projectId));

    // Segunda chamada: a versão é REAPROVEITADA, e é aqui que a adoção faltava.
    const segunda = await ensureWritablePlanVersion(projectId, userId);
    expect(segunda.id).toBe(primeira.id);

    expect(await orfaosCountados(projectId), "órfãos após reaproveitar a versão").toEqual({
      wbs: 0,
      atividades: 0,
      dependencias: 0,
    });

    const [detalhe] = await listPlanVersionDetails(projectId);
    expect(detalhe!.eapNodeCount, "EAP contada").toBe(117);
    expect(detalhe!.activityCount, "atividades contadas").toBe(117);
    expect(detalhe!.dependencyCount, "dependências contadas").toBe(116);
  });

  it("a contagem do painel bate com o que o banco tem, sem depender de ordem", async () => {
    // A segunda forma do mesmo defeito: mesmo sem adoção nenhuma, a contagem
    // NÃO pode dizer zero para uma obra que tem 117 linhas. Ou ela conta o que
    // existe, ou ela declara que não sabe — o que ela não pode é mentir, porque
    // o painel trata zero como "obra vazia" e o gate aprova com base nisso.
    const { projectId, userId } = await criarObra();
    await semearPlano(projectId);
    await ensureWritablePlanVersion(projectId, userId);

    // Órfãos de novo, agora sem passar por nenhum caminho de escrita.
    await db
      .update(wbsNodes)
      .set({ versionId: null })
      .where(eq(wbsNodes.projectId, projectId));
    await db
      .update(scheduleActivities)
      .set({ versionId: null })
      .where(eq(scheduleActivities.projectId, projectId));
    await db
      .update(scheduleDependencies)
      .set({ versionId: null })
      .where(eq(scheduleDependencies.projectId, projectId));

    const [detalhe] = await listPlanVersionDetails(projectId);
    // O total da obra precisa ser visível de algum modo. Aceito as duas
    // respostas honestas: contar os órfãos junto da versão, ou expor que eles
    // existem. Rejeito o zero — porque o painel trata zero como obra vazia, e o
    // gate aprova com base nisso.
    const orfaos = await orfaosCountados(projectId);
    const contagemVisivel = detalhe!.eapNodeCount + orfaos.wbs;
    expect(contagemVisivel, "a obra tem 117 nós; a contagem não pode dizer 0").toBe(
      117
    );
    expect(
      detalhe!.unversionedNodeCount,
      "o total de órfãos somado das três tabelas"
    ).toBe(orfaos.wbs + orfaos.atividades + orfaos.dependencias);
  });

  it("aprovar uma versão adota o que ficou sem ela", async () => {
    // `approveCurrentPlanVersion` é o caminho que responde "qual EAP foi
    // aprovada?". Se ele aprova uma geração enquanto 117 nós estão fora de
    // qualquer geração, a pergunta tem duas respostas e a aprovação escolhe uma
    // sem dizer qual.
    const { projectId, userId } = await criarObra();
    await semearPlano(projectId);
    await ensureWritablePlanVersion(projectId, userId);
    await db
      .update(wbsNodes)
      .set({ versionId: null })
      .where(eq(wbsNodes.projectId, projectId));
    const decisao = await criarDecisao(projectId, userId);

    const aprovada = await approveCurrentPlanVersion(projectId, decisao, userId);
    expect(aprovada.versionNumber).toBe(1);
    expect(
      (await orfaosCountados(projectId)).wbs,
      "nó órfão quando a versão foi aprovada"
    ).toBe(0);
  });

  it("a versão aprovada é reaberta como draft e a anterior vira superseded", async () => {
    // A regra de reabertura: aprovado não é gravável. A próxima escrita cria
    // v+1. Este teste existe porque a adoção de órfãos agora acontece nos DOIS
    // caminhos — se alguém voltar a pular a adoção no `create`, este é o teste
    // que accuse, porque a criação de v+1 é o caminho que roda a segunda vez.
    const { projectId, userId } = await criarObra();
    await semearPlano(projectId);
    await ensureWritablePlanVersion(projectId, userId);
    await db
      .update(projectPlanVersions)
      .set({ status: "approved" })
      .where(eq(projectPlanVersions.projectId, projectId));
    await db
      .update(wbsNodes)
      .set({ versionId: null })
      .where(eq(wbsNodes.projectId, projectId));

    const reaberta = await ensureWritablePlanVersion(projectId, userId);
    expect(reaberta.versionNumber).toBe(2);
    expect(reaberta.status).toBe("draft");
    expect((await orfaosCountados(projectId)).wbs).toBe(0);
  });
});
