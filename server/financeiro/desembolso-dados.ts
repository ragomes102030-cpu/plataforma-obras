import { and, desc, eq, isNull, lte } from "drizzle-orm";
import {
  budgetItems,
  budgetVersions,
  costEntries,
  projects,
  scheduleActivities,
} from "../../drizzle/schema";
import type { DbConexao } from "../construction/lookahead-dados";
import {
  carregarCalendarioDoPeriodo,
  isoToLocalDate,
  localIso,
} from "../construction/calendario-obra";
import type { AtividadeComCustoPlanejado, ValorPorMes } from "./desembolso";

/**
 * Dados da curva de desembolso.
 *
 * O custo REAL vem por competência (`cost_entries.competenceDate`), que é a
 * data em que a despesa pertence — não a data do lançamento nem a do
 * pagamento. Competência futura fica de fora: nota lançada para o mês que vem
 * ainda não saiu do caixa hoje.
 *
 * O custo PLANEJADO usa a mesma régua do EVM: quantidade planejada da atividade
 * × preço do item de orçamento aprovado, rateado nos dias úteis da atividade.
 */

export type DadosDesembolso = {
  plannedStartIso: string;
  calendar: Awaited<ReturnType<typeof carregarCalendarioDoPeriodo>>["calendar"];
  atividades: AtividadeComCustoPlanejado[];
  custoRealPorMes: ValorPorMes[];
  /** Atividades sem item de orçamento: ficam fora do custo planejado. */
  atividadesSemItem: number;
};

export async function coletarDadosDesembolso(
  db: DbConexao,
  projectId: number,
  asOfIso: string,
  currentPlanVersionId: number | null
): Promise<DadosDesembolso> {
  const [project] = await db
    .select({ plannedStart: projects.plannedStart })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const plannedStartIso = localIso(project?.plannedStart ?? isoToLocalDate(asOfIso));

  const calendar = await carregarCalendarioDoPeriodo(
    db,
    projectId,
    Number(plannedStartIso.slice(0, 4)),
    Number(asOfIso.slice(0, 4)) + 1
  );

  const [baselineRow] = await db
    .select({ id: budgetVersions.id })
    .from(budgetVersions)
    .where(
      and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.status, "aprovado"))
    )
    .orderBy(desc(budgetVersions.versionNumber))
    .limit(1);

  const precoPorItem = new Map<number, number>();
  if (baselineRow) {
    const itens = await db
      .select({ id: budgetItems.id, unitPrice: budgetItems.unitPrice })
      .from(budgetItems)
      .where(eq(budgetItems.budgetVersionId, baselineRow.id));
    for (const item of itens) precoPorItem.set(item.id, Number(item.unitPrice));
  }

  const versionScope =
    currentPlanVersionId == null
      ? isNull(scheduleActivities.versionId)
      : eq(scheduleActivities.versionId, currentPlanVersionId);

  const atividades = await db
    .select({
      id: scheduleActivities.id,
      plannedQuantity: scheduleActivities.plannedQuantity,
      budgetItemId: scheduleActivities.budgetItemId,
      startOffset: scheduleActivities.startOffset,
      earlyStart: scheduleActivities.earlyStart,
      durationDays: scheduleActivities.durationDays,
    })
    .from(scheduleActivities)
    .where(and(eq(scheduleActivities.projectId, projectId), versionScope));

  let atividadesSemItem = 0;
  const comCusto: AtividadeComCustoPlanejado[] = [];
  for (const atividade of atividades) {
    const preco =
      atividade.budgetItemId == null ? undefined : precoPorItem.get(atividade.budgetItemId);
    if (preco == null) {
      atividadesSemItem += 1;
      continue;
    }
    const peso = Number(atividade.plannedQuantity ?? 0) * preco;
    comCusto.push({
      id: atividade.id,
      peso,
      startOffset: atividade.earlyStart ?? atividade.startOffset ?? 0,
      durationDays: Math.max(1, atividade.durationDays ?? 1),
    });
  }

  const lancamentos = await db
    .select({
      competenceDate: costEntries.competenceDate,
      amount: costEntries.amount,
    })
    .from(costEntries)
    .where(
      and(
        eq(costEntries.projectId, projectId),
        eq(costEntries.status, "confirmado"),
        lte(costEntries.competenceDate, isoToLocalDate(asOfIso))
      )
    );

  const porMes = new Map<string, number>();
  for (const lancamento of lancamentos) {
    // `toISOString` e não `localIso`: a competência é gravada em meia-noite UTC
    // e converter para fuso local jogaria o dia 1º para o mês anterior.
    const mes = lancamento.competenceDate.toISOString().slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + Number(lancamento.amount));
  }

  return {
    plannedStartIso,
    calendar: calendar.calendar,
    atividades: comCusto,
    custoRealPorMes: [...porMes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, valor]) => ({ mes, valor })),
    atividadesSemItem,
  };
}
