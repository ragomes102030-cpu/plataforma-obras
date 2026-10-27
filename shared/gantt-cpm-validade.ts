/**
 * Estado do CPM que o Gantt tem permissão de sinalizar como válido.
 * O conjunto completo precisa estar calculado e não pode ter edição posterior.
 * Critério alinhado ao gate de captura da baseline.
 */
export type RegistroCpm = {
  durationDays: number | string | null;
  cpmCalculatedAt: string | Date | null;
  updatedAt: string | Date;
};
export function avaliarCpmGantt(registros: readonly RegistroCpm[]) {
  const invalidas=registros.filter(a=>!Number.isFinite(Number(a.durationDays))||Number(a.durationDays)<1).length;
  const semCalculo=registros.filter(a=>a.cpmCalculatedAt===null ||
    !Number.isFinite(new Date(a.cpmCalculatedAt).getTime())).length;
  const desatualizadas=registros.filter(a=>
    a.cpmCalculatedAt!==null &&
    Number.isFinite(new Date(a.cpmCalculatedAt).getTime()) &&
    (!Number.isFinite(new Date(a.updatedAt).getTime()) ||
      new Date(a.cpmCalculatedAt).getTime()<new Date(a.updatedAt).getTime())
  ).length;
  return {
    valido:registros.length>0&&invalidas===0&&semCalculo===0&&desatualizadas===0,
    total:registros.length,
    duracoesInvalidas:invalidas,
    semCalculo,
    desatualizadas,
  };
}
