import { normalizeForMatch, trigramSimilarity } from "../../shared/price-sources/matching";

/**
 * Conciliação entre cronograma e orçamento.
 *
 * O EVM só existe quando cada atividade aponta para um item de orçamento com
 * quantidade prevista: sem isso não há valor planejado por atividade, e sem
 * valor planejado não há curva S física nem CPI/SPI. Na AURORA TESTE as 53
 * atividades estavam soltas — nenhuma apontava para os 53 itens do orçamento,
 * que tinham exatamente os mesmos códigos.
 *
 * Aqui ficam só as decisões puras (o que sugerir e como medir cobertura). Quem
 * grava é o router.
 */

export type ItemOrcamento = {
  id: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  compositionId: number | null;
};

export type AtividadeConciliacao = {
  id: number;
  wbsCode: string;
  name: string;
  unit: string | null;
  plannedQuantity: number | null;
  budgetItemId: number | null;
};

export type SugestaoVinculo = {
  budgetItemId: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  confidence: number;
  /** Por que a sugestão existe — a tela mostra isso ao usuário. */
  reason: "codigo" | "descricao";
  unitMismatch: boolean;
};

/** Códigos de WBS e de orçamento são comparados sem separador: 1.1.1 = 1-1-1. */
function chaveDeCodigo(code: string): string {
  return normalizeForMatch(code).replace(/[^a-z0-9]/g, "");
}

/**
 * Quanto do nome da atividade aparece na descrição do item.
 *
 * Trigrama puro não serve aqui: a descrição do item é composta e longa
 * ("Pilares - Alvenaria estrutural bloco concreto 19x19x39"), então a
 * similaridade de string inteira afunda mesmo quando o item é o certo.
 * Cobertura de tokens pergunta a coisa certa — "quantas palavras da atividade
 * estão lá" — e deixa o trigrama só como desempate.
 */
function coberturaPorTokens(nome: string, descricao: string): number {
  const tokens = normalizeForMatch(nome)
    .split(" ")
    .filter(token => token.length > 2);
  if (!tokens.length) return 0;
  const alvo = normalizeForMatch(descricao);
  const acertos = tokens.filter(token => alvo.includes(token)).length;
  return acertos / tokens.length;
}

function unidadesCompativeis(atividade: string | null, item: string): boolean {
  if (!atividade) return true; // atividade sem unidade não impede o vínculo
  return normalizeForMatch(atividade) === normalizeForMatch(item);
}

/**
 * Ranking de itens para uma atividade. Nunca vincula sozinho: devolve
 * candidatos ordenados e o motivo, para o planejador decidir em um clique.
 */
export function sugerirVinculos(
  atividade: AtividadeConciliacao,
  itens: ItemOrcamento[],
  limite = 3
): SugestaoVinculo[] {
  const chaveAtividade = chaveDeCodigo(atividade.wbsCode ?? "");

  const sugestoes = itens.map(item => {
    const unitMismatch = !unidadesCompativeis(atividade.unit, item.unit);

    if (chaveAtividade && chaveDeCodigo(item.code) === chaveAtividade) {
      return {
        budgetItemId: item.id,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        // Mesmo código é vínculo inequívoco; unidade divergente ainda merece
        // aparecer na frente, só que sinalizada.
        confidence: unitMismatch ? 0.9 : 1,
        reason: "codigo" as const,
        unitMismatch,
      };
    }

    const cobertura = coberturaPorTokens(atividade.name, item.description);
    const trigrama = trigramSimilarity(atividade.name, item.description);
    let confidence = 0.7 * cobertura + 0.3 * trigrama;
    if (!atividade.unit) confidence *= 0.9;
    if (unitMismatch) confidence *= 0.6;

    return {
      budgetItemId: item.id,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      confidence,
      reason: "descricao" as const,
      unitMismatch,
    };
  });

  return sugestoes
    .filter(sugestao => sugestao.reason === "codigo" || sugestao.confidence >= 0.45)
    .sort((a, b) => b.confidence - a.confidence || a.code.localeCompare(b.code, "pt-BR"))
    .slice(0, limite);
}

export type CoberturaOrcamentaria = {
  valorTotal: number;
  valorVinculado: number;
  percentual: number;
  atividadesTotal: number;
  atividadesVinculadas: number;
  atividadesSemQuantidade: number;
  itensSemComposicao: number;
  itensTotal: number;
};

/**
 * Quanto do valor do orçamento já está preso a uma atividade do cronograma.
 *
 * A conta é por valor, não por contagem: 50 atividades de acabamento ligadas a
 * 3% do orçamento não é "cobertura de 90%". A fração de cada item consumida
 * pela atividade é `quantidade prevista / quantidade do item`, limitada a 1 —
 * duas atividades que apontam para o mesmo item não podem somar mais que o item
 * inteiro, senão a cobertura passaria de 100%.
 */
export function resumirCobertura(
  atividades: AtividadeConciliacao[],
  itens: ItemOrcamento[]
): CoberturaOrcamentaria {
  const porId = new Map(itens.map(item => [item.id, item]));
  const consumo = new Map<number, number>();

  for (const atividade of atividades) {
    if (atividade.budgetItemId == null) continue;
    const item = porId.get(atividade.budgetItemId);
    if (!item) continue;
    const quantidade = atividade.plannedQuantity ?? 0;
    if (quantidade <= 0) continue;
    const fracao = item.quantity > 0 ? Math.min(1, quantidade / item.quantity) : 1;
    consumo.set(item.id, Math.min(1, (consumo.get(item.id) ?? 0) + fracao));
  }

  let valorTotal = 0;
  let valorVinculado = 0;
  for (const item of itens) {
    const valorItem = item.quantity * item.unitPrice;
    valorTotal += valorItem;
    valorVinculado += valorItem * (consumo.get(item.id) ?? 0);
  }

  return {
    valorTotal,
    valorVinculado,
    percentual: valorTotal > 0 ? valorVinculado / valorTotal : 0,
    atividadesTotal: atividades.length,
    atividadesVinculadas: atividades.filter(atividade => atividade.budgetItemId != null).length,
    atividadesSemQuantidade: atividades.filter(
      atividade => atividade.budgetItemId != null && (atividade.plannedQuantity ?? 0) <= 0
    ).length,
    itensSemComposicao: itens.filter(item => item.compositionId == null).length,
    itensTotal: itens.length,
  };
}
