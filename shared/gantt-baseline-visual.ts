import type { LinhaDesvio, ResumoDesvios } from "./desvios-baseline";
import type { BaselineActivityDate } from "./baseline-dates";

/** A barra lê somente as datas civis congeladas pelo servidor na captura. */
export type BarraBaselineGantt = {
  activityId: number | null;
  codigo: string;
  inicio: string;
  fim: string;
  situacao: LinhaDesvio["situacao"];
  deltaInicio: number | null;
  deltaFim: number | null;
  atividades: number;
};

export function prepararBarrasBaselineGantt(
  linhas: readonly LinhaDesvio[],
  datasCapturadas: readonly BaselineActivityDate[] | null | undefined,
): Map<string, BarraBaselineGantt> {
  const barras = new Map<string, BarraBaselineGantt>();
  if (!datasCapturadas) return barras;
  const linhasPorId = new Map(linhas.flatMap(linha => {
    const id = linha.baselineAtividadeId ?? linha.atividadeId;
    return id == null ? [] : [[id, linha] as const];
  }));
  for (const data of datasCapturadas) {
    const codigo = data.wbsCode?.trim();
    if (!codigo) continue;
    const linha = linhasPorId.get(data.activityId);
    const chave = linha?.atividadeId != null
      ? `atividade:${linha.atividadeId}`
      : `baseline:${data.activityId}`;
    barras.set(chave, {
      activityId: linha?.atividadeId ?? null,
      codigo, inicio: data.inicio, fim: data.fim, atividades: 1,
      situacao: linha?.situacao ?? "indefinida",
      deltaInicio: linha?.deltaInicio ?? null,
      deltaFim: linha?.deltaFim ?? null,
    });
  }
  return barras;
}

/** Somente valores reportados pela comparação oficial. */
export function resumirBaselineNoGantt(resumo: ResumoDesvios) {
  return {
    atrasadas: resumo.atrasadas,
    adiantadas: resumo.adiantadas,
    iguais: resumo.iguais,
    novas: resumo.novas,
    removidas: resumo.removidas,
    indefinidas: resumo.indefinidas,
    maiorAtrasoDiasUteis: resumo.atrasoNoFim,
  };
}
