import { and, desc, eq, isNull } from "drizzle-orm";
import {
  budgetItems,
  budgetVersions,
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
};

/** Quanto do tempo decorrido entra no EVM, em dias úteis — não corridos. */
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
  const activities: EvmActivity[] = (
    await db
      .select({
        id: scheduleActivities.id,
        plannedQuantity: scheduleActivities.plannedQuantity,
        durationDays: scheduleActivities.durationDays,
        earlyStart: scheduleActivities.earlyStart,
        startOffset: scheduleActivities.startOffset,
        budgetItemId: scheduleActivities.budgetItemId,
      })
      .from(scheduleActivities)
      .where(and(eq(scheduleActivities.projectId, projectId), versionScope))
  ).map(activity => ({
    id: activity.id,
    plannedQuantity: Number(activity.plannedQuantity ?? 0),
    durationDays: activity.durationDays,
    earlyStart: activity.earlyStart,
    startOffset: activity.startOffset,
    budgetItemId: activity.budgetItemId,
  }));

  const entries = await db
    .select({
      activityId: productionEntries.activityId,
      quantity: productionEntries.quantity,
    })
    .from(productionEntries)
    .where(
      and(
        eq(productionEntries.projectId, projectId),
        eq(productionEntries.status, "confirmada")
      )
    );
  const actualByActivity = new Map<number, number>();
  for (const entry of entries) {
    if (entry.activityId == null) continue;
    actualByActivity.set(
      entry.activityId,
      (actualByActivity.get(entry.activityId) ?? 0) + Number(entry.quantity)
    );
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
  };
}

export type { CalendarioDaObra };
