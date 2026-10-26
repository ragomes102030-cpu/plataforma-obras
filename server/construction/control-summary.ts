/** Consolidação física somente com pesos monetários do orçamento aprovado.
 * Quantidades em m², m³ e un nunca são somadas entre serviços.
 * Se faltar peso para QUALQUER atividade operacional, não publica percentual
 * consolidado: uma cobertura parcial seria facilmente confundida com 100%.
 */
export type ControlProgressRow = {
  id: number;
  budgetItemId: number | null;
  plannedQuantity: number;
  plannedProgress: number;
  actualProgress: number;
};
export type ApprovedBudgetWeight = { id: number; unitPrice: string | number };
export function consolidateControlProgress(
  rows: readonly ControlProgressRow[],
  approvedItems: readonly ApprovedBudgetWeight[] | null
) {
  const count = rows.length;
  const empty = (reason: string, coveredActivities = 0) => ({
    plannedProgress: null as number | null,
    actualProgress: null as number | null,
    variance: null as number | null,
    basis: "approved_budget_value" as const,
    coveredActivities,
    totalActivities: count,
    reason,
  });
  if (!count) return empty("sem_atividades");
  if (!approvedItems) return empty("sem_orcamento_aprovado");
  const prices = new Map(approvedItems.map(item => [item.id, Number(item.unitPrice)]));
  let weightedPlanned = 0, weightedActual = 0, totalWeight = 0, covered = 0;
  for (const row of rows) {
    const price = row.budgetItemId == null ? undefined : prices.get(row.budgetItemId);
    if (row.plannedQuantity <= 0 || !Number.isFinite(row.plannedQuantity) ||
        price === undefined || !Number.isFinite(price) || price <= 0) continue;
    const weight = row.plannedQuantity * price;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    covered++;
    totalWeight += weight;
    weightedPlanned += weight * row.plannedProgress;
    weightedActual += weight * row.actualProgress;
  }
  if (covered !== count || totalWeight <= 0) return empty("cobertura_incompleta", covered);
  const round = (n: number) => Math.round(n * 10) / 10;
  const planned = round(weightedPlanned / totalWeight);
  const actual = round(weightedActual / totalWeight);
  return {
    plannedProgress: planned,
    actualProgress: actual,
    variance: round(actual - planned),
    basis: "approved_budget_value" as const,
    coveredActivities: covered,
    totalActivities: count,
    reason: null as string | null,
  };
}
