export type QuantityReadiness = {
  status: "Sem itens" | "Revisar" | "OK";
  description: string;
};

export type QuantityEvidenceReadiness = {
  status: "Sem itens" | "Não validado" | "Em revisão" | "Validado";
  description: string;
};

export function summarizeBudgetQuantities(itemCount: number, itemsWithoutPrice: number): QuantityReadiness {
  if (itemCount <= 0) return { status: "Sem itens", description: "Nenhum item para validar" };
  if (itemsWithoutPrice > 0) {
    return { status: "Revisar", description: `${itemsWithoutPrice} itens sem preço unitário` };
  }
  return { status: "OK", description: "Todos os itens possuem preço unitário" };
}

export function summarizeQuantityEvidence(statuses: Array<string | null | undefined>): QuantityEvidenceReadiness {
  if (statuses.length === 0) return { status: "Sem itens", description: "Nenhum quantitativo para revisar" };
  const pending = statuses.filter(status => status !== "cenario" && status !== "validada").length;
  const scenarios = statuses.filter(status => status === "cenario").length;
  const validated = statuses.filter(status => status === "validada").length;
  if (pending > 0) return { status: "Não validado", description: `${pending} pendentes · ${scenarios} em cenário · ${validated} validados` };
  if (scenarios > 0) return { status: "Em revisão", description: `${scenarios} em cenário · ${validated} validados; cenário não libera execução` };
  return { status: "Validado", description: `${validated} de ${statuses.length} com evidência validada` };
}
