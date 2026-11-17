export type BudgetApprovalItem = {
  code: string;
  unitPrice: number | string | null;
  source: string | null;
  officialPriceItemId?: number | null;
  compositionId?: number | null;
  isPriceException?: boolean | null;
  quantityEvidence?: string | null;
  quantityEvidenceStatus?: string | null;
};

export type BudgetApprovalBlocker = {
  code: string;
  reason: "sem_preco" | "sem_fonte" | "fonte_didatica" | "fonte_pendente" | "sem_vinculo_rastreavel" | "sem_evidencia_quantidade" | "quantidade_pendente";
};

/** Orçamento didático serve para rascunho, nunca para controle ou baseline de custos. */
export function findBudgetApprovalBlockers(items: BudgetApprovalItem[]): BudgetApprovalBlocker[] {
  return items.flatMap(item => {
    const source = item.source?.trim() ?? "";
    const normalizedSource = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const blockers: BudgetApprovalBlocker[] = [];
    if (Number(item.unitPrice) <= 0 || !Number.isFinite(Number(item.unitPrice))) blockers.push({ code: item.code, reason: "sem_preco" });
    if (!source || normalizedSource === "a preencher") blockers.push({ code: item.code, reason: "sem_fonte" });
    else if (/didatic|pendencia.*(didatic|validad)|rateio uniforme/.test(normalizedSource)) blockers.push({ code: item.code, reason: "fonte_didatica" });
    else if (/simbolic|placeholder|preco oficial pendente|preco pendente|sem cotacao|sem composicao/.test(normalizedSource)) blockers.push({ code: item.code, reason: "fonte_pendente" });
    const hasOfficialLink = Number(item.officialPriceItemId) > 0 || Number(item.compositionId) > 0;
    const hasDocumentedPriceException = item.isPriceException === true && /cotacao|proposta|contrato|composicao propria/.test(normalizedSource);
    if (!hasOfficialLink && !hasDocumentedPriceException) blockers.push({ code: item.code, reason: "sem_vinculo_rastreavel" });
    if (!item.quantityEvidence?.trim()) blockers.push({ code: item.code, reason: "sem_evidencia_quantidade" });
    if (!item.quantityEvidenceStatus || !["cenario", "validada"].includes(item.quantityEvidenceStatus)) blockers.push({ code: item.code, reason: "quantidade_pendente" });
    return blockers;
  });
}
