export type AtividadeComCpm = {
  cpmCalculatedAt: Date | string | null;
  updatedAt: Date | string | null;
};

/** Impede que uma data da grade seja apresentada como prazo calculado e aprovado. */
export function avaliarPrazoDashboard(input: {
  fim: string | null;
  eapApproved: boolean;
  atividades: AtividadeComCpm[];
}) {
  if (!input.fim) return { confiavel: false, motivo: "Sem data no cronograma" };

  const cpmPendente = input.atividades.length === 0 || input.atividades.some(atividade => {
    if (!atividade.cpmCalculatedAt || !atividade.updatedAt) return true;
    const calculado = new Date(atividade.cpmCalculatedAt).getTime();
    const alterado = new Date(atividade.updatedAt).getTime();
    return !Number.isFinite(calculado) || !Number.isFinite(alterado) || calculado < alterado;
  });

  const motivos = [
    ...(!input.eapApproved ? ["EAP em elaboração"] : []),
    ...(cpmPendente ? ["CPM pendente ou desatualizado"] : []),
  ];
  return {
    confiavel: motivos.length === 0,
    motivo: motivos.length ? motivos.join(" · ") : "CPM atual e EAP aprovada; confira a baseline",
  };
}
