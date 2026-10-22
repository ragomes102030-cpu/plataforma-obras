/**
 * PESO DE CUSTO DE CADA ATIVIDADE NA CURVA S.
 *
 * A regra antiga ligava item de orçamento a atividade apenas por `wbsNodeId`.
 * Quando a EAP é refeita (nova versão, novo import), os nós ganham ids novos e
 * o orçamento fica apontando para os nós da versão anterior: nenhum item casa,
 * e a curva S abre dizendo apenas "o valor do orçamento não chegou às
 * atividades" — sem dizer que o valor existe e está no lugar errado.
 *
 * O código da EAP ("1.2.3") identifica o pacote em qualquer versão, então ele
 * é o plano B: primeiro tenta o nó, depois o código. O que não casar de jeito
 * nenhum é devolvido em `valorSemDestino` para a tela poder dizer quanto dinheiro
 * ficou de fora — em reais, não em porcentagem.
 */

export type AtividadeDaCurva = {
  id: number;
  wbsNodeId: number | null;
  wbsCode: string | null;
};

export type ItemDaCurva = {
  wbsNodeId: number | null;
  code: string | null;
  quantity: number | string;
  unitPrice: number | string;
};

export type PesosDaCurva = {
  /** activityId -> custo (R$) */
  custoPorAtividade: Map<number, number>;
  total: number;
  valorSemDestino: number;
  itensSemDestino: number;
  /** Itens que só casaram pelo código, porque o nó é de outra versão da EAP. */
  itensCasadosPorCodigo: number;
};

const numero = (valor: number | string): number => {
  const convertido = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
};

export function calcularPesosDaCurva(
  atividades: AtividadeDaCurva[],
  itens: ItemDaCurva[]
): PesosDaCurva {
  const atividadeDoNo = new Map<number, number>();
  const atividadeDoCodigo = new Map<string, number>();
  for (const atividade of atividades) {
    if (atividade.wbsNodeId != null && !atividadeDoNo.has(atividade.wbsNodeId)) {
      atividadeDoNo.set(atividade.wbsNodeId, atividade.id);
    }
    const codigo = atividade.wbsCode?.trim();
    if (codigo && !atividadeDoCodigo.has(codigo)) {
      atividadeDoCodigo.set(codigo, atividade.id);
    }
  }

  const custoPorAtividade = new Map<number, number>();
  let total = 0;
  let valorSemDestino = 0;
  let itensSemDestino = 0;
  let itensCasadosPorCodigo = 0;

  for (const item of itens) {
    const valor = numero(item.quantity) * numero(item.unitPrice);
    if (valor <= 0) continue;
    total += valor;

    let atividadeId = item.wbsNodeId != null ? atividadeDoNo.get(item.wbsNodeId) : undefined;
    if (atividadeId == null) {
      const codigo = item.code?.trim();
      const porCodigo = codigo ? atividadeDoCodigo.get(codigo) : undefined;
      if (porCodigo != null) {
        atividadeId = porCodigo;
        itensCasadosPorCodigo += 1;
      }
    }

    if (atividadeId == null) {
      valorSemDestino += valor;
      itensSemDestino += 1;
      continue;
    }
    custoPorAtividade.set(atividadeId, (custoPorAtividade.get(atividadeId) ?? 0) + valor);
  }

  return { custoPorAtividade, total, valorSemDestino, itensSemDestino, itensCasadosPorCodigo };
}
