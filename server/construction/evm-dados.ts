import { and, desc, eq, isNull, lte } from "drizzle-orm";
import {
  budgetItems,
  budgetVersions,
  costEntries,
  productionEntries,
  projects,
  scheduleActivities,
} from "../../drizzle/schema";
import type { getDb } from "../db";
import {
  carregarCalendarioDoPeriodo,
  localIso,
  type CalendarioDaObra,
} from "./calendario-obra";
import type { EvmActivity, EvmBaseline, EvmBudgetItem } from "./evm";
import { indexarAtividadesPorCodigo, resolverAtividadeDaProducao } from "../../shared/producao-vinculo";
import type { IsoDate, WorkCalendar } from "../../shared/work-calendar";

/**
 * A leitura dos dados do Valor Ganho.
 *
 * POR QUE ESTA FUNÇÃO ESTÁ FORA DO ROUTER
 *
 * Duas regras do EVM são decisões de LEITURA, não de aritmética, e é aí que o
 * defeito A3 morava: qual versão de orçamento vira baseline.
 *
 *   BAC É A VERSÃO APROVADA. O router colhia a versão de MAIOR número, sem
 *   olhar o status — e o schema tem `rascunho`, `em_revisao`, `aprovado` e
 *   `arquivado`. Um rascunho virava linha de base e o BAC do EVM era o último
 *   número que alguém digitou. Baseline é um ato de aprovação: aqui, sem
 *   `status = "aprovado"` não há baseline, e o EVM devolve `pendente`.
 *
 *   O ESCOPO É A VERSÃO DE TRABALHO DO PLANO. As atividades lidas são as da
 *   versão corrente (ou as soltas, quando a obra ainda não tem versão) — as
 *   mesmas que o CPM calcula. Misturar geração de cronograma com geração de
 *   orçamento é a receita do A4.
 *
 * Recebe o `versionId` corrente em vez de descobri-lo aqui de propósito: assim
 * a função inteira recebe o banco por parâmetro e pode ser exercitada num
 * PostgreSQL de verdade (PGlite) sem mock de módulo.
 */

export type DbConexao = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type DadosEvms = {
  asOf: Date;
  asOfIso: IsoDate;
  plannedStartIso: IsoDate;
  calendar: WorkCalendar;
  baseline: EvmBaseline;
  items: EvmBudgetItem[];
  activities: EvmActivity[];
  actualByActivity: Map<number, number>;
  /**
   * Custo real confirmado com competência até `asOf`, por atividade.
   *
   * Sem este mapa o AC era deduzido do orçamento (`executado x preço`), o que
   * faz `AC = EV` por construção e trava o CPI em 1,000.
   */
  costByActivity: Map<number, number>;
  /** Custo real confirmado com competência até `asOf`, por item de orçamento. */
  costByItem: Map<number, number>;
  /**
   * Custo real sem vínculo com atividade nem item (mobilização, canteiro).
   * Fica FORA do CPI de propósito — ver `computeEvm`.
   */
  costUnallocated: number;
  /** Quantos lançamentos de custo entraram na conta. */
  costEntryCount: number;
};

/**
 * Quanto do tempo decorrido entra no EVM, em dias úteis — não corridos.
 *
 * ATENÇÃO ÀS DATAS DE CORTE. Tudo o que é "até `asOf`" precisa ser cortado
 * AQUI, na consulta. Antes, `production_entries` era somado inteiro, sem olhar
 * `productionDate`: pedir o EVM de 30/09 devolvia o avanço de outubro, e o EV
 * do passado mudava sozinho a cada lançamento novo. Um relatório que se
 * reescreve retroativo não serve para decidir nada.
 */
export async function coletarDadosEvms(
  db: DbConexao,
  projectId: number,
  asOf: Date,
  currentPlanVersionId: number | null
): Promise<DadosEvms> {
  const [project] = await db
    .select({ plannedStart: projects.plannedStart })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const plannedStart = project?.plannedStart ?? asOf;

  // A2: dias úteis, na mesma régua do CPM. Um cronograma de 14 meses cruza a
  // virada do ano, e sem os feriados do segundo ano o 1º de janeiro conta
  // como dia útil — um dia a mais de PV, em silêncio.
  const calendar = await carregarCalendarioDoPeriodo(
    db,
    projectId,
    plannedStart.getFullYear(),
    asOf.getFullYear()
  );

  // A3: a baseline é a versão APROVADA de maior número. Sem ela, `null` — e o
  // motor de EVM devolve `pendente` em vez de um BAC que ninguém aprovou.
  const [baselineRow] = await db
    .select({ id: budgetVersions.id, versionNumber: budgetVersions.versionNumber })
    .from(budgetVersions)
    .where(
      and(
        eq(budgetVersions.projectId, projectId),
        eq(budgetVersions.status, "aprovado")
      )
    )
    .orderBy(desc(budgetVersions.versionNumber))
    .limit(1);
  const baseline: EvmBaseline = baselineRow
    ? { versionId: baselineRow.id, versionNumber: baselineRow.versionNumber }
    : null;

  const items: EvmBudgetItem[] = baseline
    ? (
        await db
          .select({
            id: budgetItems.id,
            quantity: budgetItems.quantity,
            unitPrice: budgetItems.unitPrice,
          })
          .from(budgetItems)
          .where(eq(budgetItems.budgetVersionId, baseline.versionId))
      ).map(item => ({
        id: item.id,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }))
    : [];

  const versionScope =
    currentPlanVersionId == null
      ? isNull(scheduleActivities.versionId)
      : eq(scheduleActivities.versionId, currentPlanVersionId);
  const linhasDeAtividade = await db
    .select({
      id: scheduleActivities.id,
      wbsCode: scheduleActivities.wbsCode,
      plannedQuantity: scheduleActivities.plannedQuantity,
      durationDays: scheduleActivities.durationDays,
      earlyStart: scheduleActivities.earlyStart,
      startOffset: scheduleActivities.startOffset,
      budgetItemId: scheduleActivities.budgetItemId,
    })
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.projectId, projectId), versionScope));

  const activities: EvmActivity[] = linhasDeAtividade.map(activity => ({
    id: activity.id,
    plannedQuantity: Number(activity.plannedQuantity ?? 0),
    durationDays: activity.durationDays,
    earlyStart: activity.earlyStart,
    startOffset: activity.startOffset,
    budgetItemId: activity.budgetItemId,
  }));
  const idsAtuais = new Set(linhasDeAtividade.map(a => a.id));
  const idPorCodigo = indexarAtividadesPorCodigo(linhasDeAtividade);

  const entries = await db
    .select({
      activityId: productionEntries.activityId,
      quantity: productionEntries.quantity,
      codigoEap: scheduleActivities.wbsCode,
    })
    .from(productionEntries)
    .leftJoin(scheduleActivities, eq(productionEntries.activityId, scheduleActivities.id))
    .where(
      and(
        eq(productionEntries.projectId, projectId),
        eq(productionEntries.status, "confirmada"),
        // Corte por data. Sem isto o EVM de uma data passada inclui produção
        // futura, e o EV de setembro muda quando alguém lança outubro.
        lte(productionEntries.productionDate, asOf)
      )
    );
  const actualByActivity = new Map<number, number>();
  for (const entry of entries) {
    // Lançamento de versão anterior da EAP: o id não existe mais, mas o código
    // reencontra a atividade. Sem isto o EVM lia 0% enquanto o painel lia 15,1%.
    const activityId = resolverAtividadeDaProducao(entry.activityId, entry.codigoEap, idsAtuais, idPorCodigo);
    if (activityId == null) continue;
    actualByActivity.set(activityId, (actualByActivity.get(activityId) ?? 0) + Number(entry.quantity));
  }

  // AC: dinheiro que saiu. Só `confirmado` conta; `rascunho` ainda vai ser
  // conferido e `cancelado` é estorno. O corte é por competência.
  const costs = await db
    .select({
      activityId: costEntries.activityId,
      budgetItemId: costEntries.budgetItemId,
      amount: costEntries.amount,
    })
    .from(costEntries)
    .where(
      and(
        eq(costEntries.projectId, projectId),
        eq(costEntries.status, "confirmado"),
        lte(costEntries.competenceDate, asOf)
      )
    );

  const costByActivity = new Map<number, number>();
  const costByItem = new Map<number, number>();
  let costUnallocated = 0;
  for (const cost of costs) {
    const valor = Number(cost.amount);
    if (!Number.isFinite(valor)) continue;
    // Atividade manda: um lançamento com as duas pontas conta UMA vez.
    if (cost.activityId != null) {
      costByActivity.set(
        cost.activityId,
        (costByActivity.get(cost.activityId) ?? 0) + valor
      );
    } else if (cost.budgetItemId != null) {
      costByItem.set(
        cost.budgetItemId,
        (costByItem.get(cost.budgetItemId) ?? 0) + valor
      );
    } else {
      costUnallocated += valor;
    }
  }

  return {
    asOf,
    asOfIso: localIso(asOf),
    plannedStartIso: localIso(plannedStart),
    calendar: calendar.calendar,
    baseline,
    items,
    activities,
    actualByActivity,
    costByActivity,
    costByItem,
    costUnallocated,
    costEntryCount: costs.length,
  };
}

export type { CalendarioDaObra };
