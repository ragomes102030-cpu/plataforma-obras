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

/** Exceção de preço e vínculo oficial são mutuamente exclusivos. */
export function canMarkPriceException(item: Pick<BudgetApprovalItem, "compositionId" | "officialPriceItemId">): boolean {
  return !(Number(item.compositionId) > 0 || Number(item.officialPriceItemId) > 0);
}

/** Exceção de preço só é rastreável quando aponta para uma fonte identificada e sua evidência repete o identificador. */
export function hasDocumentedPriceException(
  item: Pick<BudgetApprovalItem, "isPriceException" | "source" | "quantityEvidence">
): boolean {
  if (item.isPriceException !== true) return false;
  const normalizedSource = (item.source ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedEvidence = (item.quantityEvidence ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const pncpControlNumber = normalizedSource.match(/pncp\s+(\d{14}-\d-\d{6}\/\d{4})/)?.[1];
  const publicProcurementNumber = normalizedSource.match(
    /\b(?:edital|concorrencia|licitacao|pregao)\s+(?:(?:cga|cpl)\s+)?(?:n(?:o|º)?\s*)?([a-z0-9][a-z0-9./-]*\d[a-z0-9./-]{4,})/
  )?.[1];
  return /cotacao|proposta|contrato|composicao propria/.test(normalizedSource) ||
    Boolean(pncpControlNumber && normalizedEvidence.includes(pncpControlNumber)) ||
    Boolean(publicProcurementNumber && normalizedEvidence.includes(publicProcurementNumber));
}

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
    if (!hasOfficialLink && !hasDocumentedPriceException(item)) blockers.push({ code: item.code, reason: "sem_vinculo_rastreavel" });
    if (!item.quantityEvidence?.trim()) blockers.push({ code: item.code, reason: "sem_evidencia_quantidade" });
    if (!item.quantityEvidenceStatus || !["cenario", "validada"].includes(item.quantityEvidenceStatus)) blockers.push({ code: item.code, reason: "quantidade_pendente" });
    return blockers;
  });
}
