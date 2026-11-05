import { findBudgetApprovalBlockers, type BudgetApprovalItem } from "@shared/budget-readiness";

type Item = BudgetApprovalItem & { id: number; quantity: number | string };
type Atividade = { id: number; budgetItemId: number | null };
type Lancamento = {
  activityId: number;
  productionDate: Date | string;
  quantity: number | string;
  status: string;
  exemplo?: number | null;
  vinculo?: string;
};

/** Ausência de medição não comprova execução zero; orçamento de teste não é régua financeira. */
export function avaliarIntegridadeDashboard(input: {
  hoje: string;
  atividades: readonly Atividade[];
  itens: Item[];
  versaoAtivaAprovada: boolean;
  custoPorAtividade: ReadonlyMap<number, number>;
  lancamentos: readonly Lancamento[];
}) {
  const ids = new Set(input.atividades.map(a => a.id));
  const itens = new Set(input.itens.map(i => i.id));
  const orcamentoConfiavel = input.versaoAtivaAprovada && input.itens.length > 0 &&
    findBudgetApprovalBlockers(input.itens).length === 0 &&
    input.itens.every(i => Number.isFinite(Number(i.quantity)) && Number(i.quantity) > 0) &&
    input.atividades.length > 0 && input.atividades.every(a =>
      a.budgetItemId != null && itens.has(a.budgetItemId) &&
      (input.custoPorAtividade.get(a.id) ?? 0) > 0
    );
  const temProducaoConfirmada = input.lancamentos.some(l => {
    if (l.productionDate instanceof Date && !Number.isFinite(l.productionDate.getTime())) return false;
    const data = l.productionDate instanceof Date
      ? l.productionDate.toISOString().slice(0, 10) : String(l.productionDate).slice(0, 10);
    const dataCivil = new Date(`${data}T12:00:00Z`);
    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(data) && Number.isFinite(dataCivil.getTime()) && dataCivil.toISOString().slice(0, 10) === data;
    return l.status === "confirmada" && Number(l.exemplo ?? 0) !== 1 &&
      ids.has(l.activityId) && (!l.vinculo || l.vinculo === "atual") &&
      dataValida && data <= input.hoje &&
      l.quantity != null && String(l.quantity).trim() !== "" && Number.isFinite(Number(l.quantity)) && Number(l.quantity) >= 0;
  });
  return { orcamentoConfiavel, temProducaoConfirmada };
}
