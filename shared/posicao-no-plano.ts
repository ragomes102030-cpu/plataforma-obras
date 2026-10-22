/**
 * Onde cada atividade está no plano — em DIAS ÚTEIS.
 *
 * A UMA SÓ RÉGUA
 *
 * O sistema calcula o CPM em dias úteis (`earlyStart` = 0, 1, 2 … 579) e mostra
 * datas de calendário. Enquanto cada tela escolhia uma régua, a mesma obra tinha
 * dois prazos: o painel dizia 120 dias (usava `startOffset`, que na AURORA está
 * zerado em todas as 53 atividades) e a Curva S dizia 580 dias (usava
 * `earlyStart`). Nenhum dos dois era mentira; os dois eram meias-verdades.
 *
 * A regra passa a ser uma só: **quando o CPM já rodou, ele manda**. `earlyStart`
 * é a data de início que o sequenciamento das dependências realmente produziu.
 * `startOffset` só entra quando a atividade nunca passou pelo CPM (obra recém
 * importada, sem dependências). A conversão de dia útil para data é feita por
 * `dateAt` do calendário da obra — um único caminho de data no sistema inteiro.
 */

export type AtividadePosicionada = {
  /** Deslocamento em dias corridos, do jeito que o plano foi importado/digitado. */
  startOffset: number | null;
  durationDays: number | null;
  plannedQuantity: number | string | null;
  /** Índice em dias úteis calculado pelo CPM. */
  earlyStart?: number | null;
  /** Nulo = o CPM nunca rodou para esta atividade. */
  cpmCalculatedAt?: Date | string | null;
};

function inteiroNaoNegativo(valor: unknown): number | null {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return Math.trunc(numero);
}

/** Início em dias úteis desde o início da obra. CPM manda; `startOffset` é o plano B. */
export function deslocamentoEmDiasUteis(atividade: AtividadePosicionada): number {
  if (atividade.cpmCalculatedAt != null) {
    const doCpm = inteiroNaoNegativo(atividade.earlyStart);
    if (doCpm !== null) return doCpm;
  }
  return inteiroNaoNegativo(atividade.startOffset) ?? 0;
}

/** Duração em dias úteis. Sem duração, a atividade ocupa um dia. */
export function duracaoEmDiasUteis(atividade: AtividadePosicionada): number {
  const duracao = Number(atividade.durationDays ?? 0);
  return Number.isFinite(duracao) && duracao > 0 ? Math.trunc(duracao) : 1;
}

/** Quantidade planejada. Ausente ou inválida pesa zero. */
function quantidade(atividade: AtividadePosicionada): number {
  const qtd = Number(atividade.plannedQuantity ?? 0);
  return Number.isFinite(qtd) && qtd > 0 ? qtd : 0;
}

/**
 * Índice do último dia útil ocupado pelo plano. Mínimo 0.
 * É o `fimDoPlanoEmDias` da Curva S — o eixo deixa de ser esticado pelo
 * `earlyStart` somado a uma duração em dias corridos.
 */
export function fimDoPlanoEmDias(atividades: AtividadePosicionada[]): number {
  let fim = 0;
  for (const atividade of atividades) {
    const termino = deslocamentoEmDiasUteis(atividade) + duracaoEmDiasUteis(atividade) - 1;
    if (termino > fim) fim = termino;
  }
  return fim;
}

/**
 * Percentual planejado acumulado no dia útil `offset`, ponderado pela quantidade.
 * Atividade sem quantidade não pesa — por isso a tela avisa quando elas existem.
 */
export function planejadoNoDia(
  atividades: AtividadePosicionada[],
  offset: number
): number {
  let pesoTotal = 0;
  let pesoFeito = 0;

  for (const atividade of atividades) {
    const qtd = quantidade(atividade);
    if (qtd <= 0) continue;
    pesoTotal += qtd;

    const inicio = deslocamentoEmDiasUteis(atividade);
    const duracao = duracaoEmDiasUteis(atividade);
    // Dia `inicio` é o primeiro dia trabalhado: ao fim dele já existe 1/duração.
    const avanco = (offset - inicio + 1) / duracao;
    const fracao = Math.max(0, Math.min(1, avanco));
    pesoFeito += qtd * fracao;
  }

  if (pesoTotal <= 0) return 0;
  return Math.round((pesoFeito / pesoTotal) * 1000) / 10;
}
