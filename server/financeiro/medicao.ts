/**
 * Medição — do serviço executado ao valor a faturar.
 *
 * Esta conta NÃO é a do Valor Ganho, e a diferença é o ponto:
 *
 *   EV  = quanto do escopo já valeu (progresso físico × preço)
 *   Medição = quanto foi efetivamente medido e aceito para cobrança
 *
 * Entre os dois existe o que ninguém mediu, o que foi medido a menor, a retenção
 * técnica e o cliente que não pagou. Igualar os dois números é o erro clássico
 * de sistema de obra: o faturamento passa a mentir junto com o cronograma.
 *
 * A medição é sempre **acumulada por período**: o que se cobra no período é
 * `acumulado até o fim − acumulado já medido`. Guardar só a diferença faria
 * qualquer erro de uma medição anterior se propagar para sempre.
 */

export type ItemDeOrcamento = {
  budgetItemId: number;
  code: string;
  description: string;
  unit: string;
  /** Quantidade contratada do item. */
  quantity: number;
  unitPrice: number;
};

export type QuantidadePorItem = { budgetItemId: number; quantity: number };

export type MedicaoEntrada = {
  /** Itens do orçamento aprovado que podem ser medidos. */
  itens: ItemDeOrcamento[];
  /** Quantidade produzida (confirmada) acumulada até o fim do período. */
  produzidoAcumulado: QuantidadePorItem[];
  /** Quantidade já medida em medições anteriores não canceladas. */
  medidoAcumuladoAnterior: QuantidadePorItem[];
  retentionPercent: number;
};

export type ItemMedido = {
  budgetItemId: number;
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  quantidadeContratada: number;
  /** Produzido acumulado até o fim do período. */
  quantidadeAcumulada: number;
  quantidadeAnterior: number;
  /** O que esta medição cobra. */
  quantidadeNoPeriodo: number;
  valorNoPeriodo: number;
  /** Contratada − acumulado depois desta medição (pode ficar negativo). */
  saldoApos: number;
  acimaDoContratado: boolean;
};

export type MedicaoCalculada = {
  itens: ItemMedido[];
  bruto: number;
  retencao: number;
  liquido: number;
  totalContratado: number;
  totalAcumulado: number;
  saldoTotal: number;
  avisos: string[];
};

export type MedicaoStatus =
  | "rascunho"
  | "em_aprovacao"
  | "aprovada"
  | "faturada"
  | "paga"
  | "cancelada";

/**
 * Transições permitidas. Fora daqui é erro de processo, não de digitação:
 *
 *   - `faturada` não volta para `aprovada`: nota emitida não se "desemite"
 *     mexendo no sistema. Correção é nota de crédito, fora do escopo.
 *   - `paga` é terminal. Dinheiro que entrou não se cancela para "arrumar".
 *   - cancelar só antes de faturar. Depois disso, o documento fiscal já existe.
 */
const TRANSICOES: Record<MedicaoStatus, MedicaoStatus[]> = {
  rascunho: ["em_aprovacao", "aprovada", "cancelada"],
  em_aprovacao: ["rascunho", "aprovada", "cancelada"],
  aprovada: ["faturada", "cancelada"],
  faturada: ["paga"],
  paga: [],
  cancelada: [],
};

export function podeTransicionar(de: MedicaoStatus, para: MedicaoStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

export function transicoesPermitidas(status: MedicaoStatus): MedicaoStatus[] {
  return TRANSICOES[status] ?? [];
}

const dinheiro = (valor: number): number => Math.round(valor * 100) / 100;
const quantidade = (valor: number): number => Math.round(valor * 1000) / 1000;

function somarPorItem(lista: QuantidadePorItem[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const linha of lista) {
    mapa.set(linha.budgetItemId, (mapa.get(linha.budgetItemId) ?? 0) + linha.quantity);
  }
  return mapa;
}

/**
 * Diferença entre produzido e já medido, item a item.
 *
 * Itens sem diferença saem da lista: uma medição com 200 linhas zeradas esconde
 * as 3 que importam. O que ficou de fora continua aparecendo no saldo.
 */
export function calcularMedicao(entrada: MedicaoEntrada): MedicaoCalculada {
  const produzido = somarPorItem(entrada.produzidoAcumulado);
  const anterior = somarPorItem(entrada.medidoAcumuladoAnterior);
  const avisos: string[] = [];

  const itens: ItemMedido[] = [];
  let totalContratado = 0;
  let totalAcumulado = 0;
  let totalAnterior = 0;
  let totalComDiferenca = 0;

  for (const item of entrada.itens) {
    const contratada = Number(item.quantity) || 0;
    const preco = Number(item.unitPrice) || 0;
    totalContratado += contratada * preco;

    if (contratada <= 0) continue;

    const acumulado = quantidade(produzido.get(item.budgetItemId) ?? 0);
    const medidoAntes = quantidade(anterior.get(item.budgetItemId) ?? 0);
    const noPeriodo = quantidade(acumulado - medidoAntes);

    // Já medido além do produzido: alguém mediu serviço que o campo não
    // confirmou. Não é para corrigir escondendo — é para aparecer.
    if (medidoAntes > acumulado + 0.0005) {
      avisos.push(
        `${item.code}: já medido (${medidoAntes}) acima do produzido (${acumulado}).`
      );
    }

    if (noPeriodo <= 0) continue;

    totalComDiferenca += 1;

    if (preco <= 0) {
      avisos.push(
        `${item.code}: item sem preço unitário — ${noPeriodo} ${item.unit} ficaram fora da medição.`
      );
      continue;
    }

    const valor = dinheiro(noPeriodo * preco);
    const acumuladoDepois = quantidade(medidoAntes + noPeriodo);
    const acimaDoContratado = acumuladoDepois > contratada + 0.0005;
    if (acimaDoContratado) {
      avisos.push(
        `${item.code}: medido acumulado (${acumuladoDepois}) passa do contratado (${contratada}).`
      );
    }

    totalAcumulado += acumulado * preco;
    totalAnterior += medidoAntes * preco;

    itens.push({
      budgetItemId: item.budgetItemId,
      code: item.code,
      description: item.description,
      unit: item.unit,
      unitPrice: preco,
      quantidadeContratada: contratada,
      quantidadeAcumulada: acumulado,
      quantidadeAnterior: medidoAntes,
      quantidadeNoPeriodo: noPeriodo,
      valorNoPeriodo: valor,
      saldoApos: quantidade(contratada - acumuladoDepois),
      acimaDoContratado,
    });
  }

  const bruto = dinheiro(itens.reduce((soma, item) => soma + item.valorNoPeriodo, 0));
  const percentualRetencao = Math.max(0, Math.min(100, Number(entrada.retentionPercent) || 0));
  const retencao = dinheiro((bruto * percentualRetencao) / 100);
  const liquido = dinheiro(bruto - retencao);

  if (itens.length === 0) {
    // "Nada produzido" só é verdade quando nada produziu. Se a lista ficou
    // vazia porque os itens não tinham preço, o aviso certo já saiu lá em cima —
    // repetir "nada novo produzido" mandaria o engenheiro conferir produção que
    // existe.
    avisos.push(
      totalComDiferenca === 0
        ? "Nada novo produzido no período: não há quantidade a medir além do que já foi medido."
        : "Há produção no período, mas nenhum item com preço unitário — não é possível valorizar a medição."
    );
  }

  return {
    itens,
    bruto,
    retencao,
    liquido,
    totalContratado: dinheiro(totalContratado),
    totalAcumulado: dinheiro(totalAcumulado),
    saldoTotal: dinheiro(totalContratado - totalAnterior - bruto),
    avisos,
  };
}

/** Período tem de ter fim depois do início. Datas em ISO `YYYY-MM-DD`. */
export function validarPeriodo(inicioIso: string, fimIso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioIso) || !/^\d{4}-\d{2}-\d{2}$/.test(fimIso)) {
    return "Informe as duas datas do período (AAAA-MM-DD).";
  }
  if (fimIso <= inicioIso) return "O fim do período precisa ser depois do início.";
  return null;
}

/** Dois períodos se sobrepõem? Mediçao sobreposta mede duas vezes o mesmo serviço. */
export function periodosSobrepostos(
  inicioA: string,
  fimA: string,
  inicioB: string,
  fimB: string
): boolean {
  return inicioA <= fimB && inicioB <= fimA;
}
