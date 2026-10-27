import type { LinhaDesvio, ResumoDesvios } from "./desvios-baseline";
import type { WorkCalendar } from "./work-calendar";
import { dateAt } from "./work-calendar";

/** A fotografia da baseline armazena índices de dias úteis CPM.
 * earlyFinish é EXCLUSIVO (earlyStart + duração). Convertemos o último
 * dia ocupado em earlyFinish - 1 para sobrepor à barra civil da grade.
 * A comparação e os deltas continuam sendo os calculados pelo servidor.
 */
export type BarraBaselineGantt = {
  codigo: string;
  inicio: string;
  fim: string;
  situacao: LinhaDesvio["situacao"];
  deltaInicio: number | null;
  deltaFim: number | null;
};

function indiceValido(valor: number | null): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= 10000;
}

export function prepararBarrasBaselineGantt(
  linhas: readonly LinhaDesvio[],
  inicioObra: string,
  calendario: WorkCalendar,
): Map<string, BarraBaselineGantt> {
  const barras = new Map<string, BarraBaselineGantt>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioObra)) return barras;
  for (const linha of linhas) {
    const codigo = linha.wbsCode?.trim();
    if (!codigo || barras.has(codigo) ||
      !indiceValido(linha.baselineInicio) || !indiceValido(linha.baselineFim) ||
      linha.baselineFim < linha.baselineInicio) continue;
    const inicio = dateAt(calendario, inicioObra, linha.baselineInicio);
    const fim = dateAt(calendario, inicioObra,
      Math.max(linha.baselineInicio, linha.baselineFim - 1));
    if (fim < inicio) continue;
    barras.set(codigo, {
      codigo, inicio, fim,
      situacao: linha.situacao,
      deltaInicio: linha.deltaInicio,
      deltaFim: linha.deltaFim,
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
