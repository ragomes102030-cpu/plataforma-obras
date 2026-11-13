export type QuantityReadiness = {
  status: "Sem itens" | "Revisar" | "OK";
  description: string;
};

export function summarizeBudgetQuantities(itemCount: number, itemsWithoutPrice: number): QuantityReadiness {
  if (itemCount <= 0) return { status: "Sem itens", description: "Nenhum item para validar" };
  if (itemsWithoutPrice > 0) {
    return { status: "Revisar", description: `${itemsWithoutPrice} itens sem preço unitário` };
  }
  return { status: "OK", description: "Todos os itens possuem preço unitário" };
}
