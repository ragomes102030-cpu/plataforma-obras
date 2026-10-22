/**
 * CONSISTÊNCIA COM A BASELINE — o que mudou desde a aprovação.
 *
 * Capturar uma baseline só vale a pena se depois der para perguntar "o que
 * mudou desde que eu aprovei isso?" e ter resposta em dias, por atividade.
 * É a pergunta que abre toda reunião de obra, e a única que transforma a
 * baseline em controle em vez de arquivo morto.
 *
 * Este módulo é puro: recebe as atividades de hoje e as da fotografia e devolve
 * a comparação. Não consulta banco nem relógio, então o mesmo par de listas
 * gera sempre o mesmo relatório — dá para auditar e testar.
 *
 * A ligação é pelo **código da EAP**, com o id como reserva. Quando a EAP é
 * refeita (nova versão, novo import), as atividades ganham ids novos mas
 * mantêm o código: comparar por id diria que toda a obra é nova e toda a
 * baseline foi removida — e o engenheiro perderia a tarde procurando um
 * problema de dados que não existe.
 */

export type AtividadeComparavel = {
  id: number;
  wbsCode: string | null;
  name: string;
  earlyStart: number | null;
  earlyFinish: number | null;
  durationDays: number;
};

export type ItemDaBaseline = {
  activityId: number;
  wbsCode: string | null;
  name: string;
  earlyStart: number | null;
  earlyFinish: number | null;
  durationDays: number;
};

export type SituacaoDesvio =
  | "atrasada"
  | "adiantada"
  | "igual"
  | "nova"
  | "removida"
  | "indefinida";

export type LinhaDesvio = {
  chave: string;
  /** Id da atividade de hoje; a curva S usa para achar o peso de custo. */
  atividadeId: number | null;
  wbsCode: string | null;
  nome: string;
  situacao: SituacaoDesvio;
  baselineInicio: number | null;
  baselineFim: number | null;
  atualInicio: number | null;
  atualFim: number | null;
  /** Dias de desvio (positivo = mais tarde que a baseline). */
  deltaInicio: number | null;
  deltaFim: number | null;
};

export type ResumoDesvios = {
  total: number;
  atrasadas: number;
  adiantadas: number;
  iguais: number;
  novas: number;
  removidas: number;
  indefinidas: number;
  /** Maior atraso no término, em dias (0 se nada atrasou). */
  atrasoNoFim: number;
  /** Média dos atrasos positivos, em dias. */
  atrasoMedioFim: number;
  /** Maior avanço no término, em dias (negativo ou 0). */
  maiorAvanco: number;
  duracaoBaseline: number;
  duracaoAtual: number;
  mudancaDeDuracao: number;
};

const delta = (atual: number | null, base: number | null): number | null =>
  atual == null || base == null ? null : Math.round(atual - base);

export function compararComBaseline(
  baseline: ItemDaBaseline[],
  atuais: AtividadeComparavel[]
): { linhas: LinhaDesvio[]; resumo: ResumoDesvios } {
  // Reserva por id: só casa quando a atividade é literalmente a mesma linha do
  // banco (baseline tirada na versão que ainda está aberta).
  const basePorId = new Map<number, ItemDaBaseline>();
  const basePorCodigo = new Map<string, ItemDaBaseline>();
  for (const item of baseline) {
    basePorId.set(item.activityId, item);
    const codigo = item.wbsCode?.trim();
    if (codigo && !basePorCodigo.has(codigo)) basePorCodigo.set(codigo, item);
  }

  const usados = new Set<ItemDaBaseline>();
  const linhas: LinhaDesvio[] = [];

  for (const atividade of atuais) {
    const codigo = atividade.wbsCode?.trim() ?? null;
    const item = (codigo ? basePorCodigo.get(codigo) : undefined) ?? basePorId.get(atividade.id);
    if (item) usados.add(item);

    const deltaInicio = delta(atividade.earlyStart, item?.earlyStart ?? null);
    const deltaFim = delta(atividade.earlyFinish, item?.earlyFinish ?? null);

    let situacao: SituacaoDesvio;
    if (!item) situacao = "nova";
    else if (deltaFim == null) situacao = "indefinida";
    else if (deltaFim > 0) situacao = "atrasada";
    else if (deltaFim < 0) situacao = "adiantada";
    else situacao = "igual";

    linhas.push({
      chave: codigo ?? String(atividade.id),
      atividadeId: atividade.id,
      wbsCode: codigo,
      nome: atividade.name,
      situacao,
      baselineInicio: item?.earlyStart ?? null,
      baselineFim: item?.earlyFinish ?? null,
      atualInicio: atividade.earlyStart,
      atualFim: atividade.earlyFinish,
      deltaInicio,
      deltaFim,
    });
  }

  // O que estava na fotografia e sumiu do planejamento é tão importante quanto
  // o que atrasou: escopo que desaparece sem decisão registrada é dinheiro que
  // ninguém sabe onde foi parar.
  for (const item of baseline) {
    if (usados.has(item)) continue;
    linhas.push({
      chave: item.wbsCode?.trim() ?? String(item.activityId),
      atividadeId: null,
      wbsCode: item.wbsCode?.trim() ?? null,
      nome: item.name,
      situacao: "removida",
      baselineInicio: item.earlyStart,
      baselineFim: item.earlyFinish,
      atualInicio: null,
      atualFim: null,
      deltaInicio: null,
      deltaFim: null,
    });
  }

  const fins = linhas.filter(linha => linha.deltaFim != null).map(linha => linha.deltaFim!);
  const atrasos = fins.filter(valor => valor > 0);
  const duracaoBaseline = baseline.reduce(
    (maior, item) => Math.max(maior, item.earlyFinish ?? 0),
    0
  );
  const duracaoAtual = atuais.reduce(
    (maior, atividade) => Math.max(maior, atividade.earlyFinish ?? 0),
    0
  );

  const resumo: ResumoDesvios = {
    total: linhas.length,
    atrasadas: linhas.filter(linha => linha.situacao === "atrasada").length,
    adiantadas: linhas.filter(linha => linha.situacao === "adiantada").length,
    iguais: linhas.filter(linha => linha.situacao === "igual").length,
    novas: linhas.filter(linha => linha.situacao === "nova").length,
    removidas: linhas.filter(linha => linha.situacao === "removida").length,
    indefinidas: linhas.filter(linha => linha.situacao === "indefinida").length,
    atrasoNoFim: atrasos.length > 0 ? Math.max(...atrasos) : 0,
    atrasoMedioFim:
      atrasos.length > 0
        ? Math.round((atrasos.reduce((soma, valor) => soma + valor, 0) / atrasos.length) * 10) / 10
        : 0,
    maiorAvanco: fins.length > 0 ? Math.min(0, ...fins) : 0,
    duracaoBaseline,
    duracaoAtual,
    mudancaDeDuracao: linhas.filter(
      linha =>
        linha.baselineFim != null &&
        linha.atualFim != null &&
        linha.baselineInicio != null &&
        linha.atualInicio != null &&
        linha.atualFim - linha.atualInicio !== linha.baselineFim - linha.baselineInicio
    ).length,
  };

  return { linhas, resumo };
}
