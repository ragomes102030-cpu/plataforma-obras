export type InsumoFisico = {
  activityId: number;
  quantidade: number | null;
  pesoFisico: number | null;
  pesoFisicoAprovado: boolean;
};

/** A curva só representa a obra quando toda a população possui base mensurável. */
export function prepararInsumosDaCurvaFisica(
  atividades: readonly InsumoFisico[]
) {
  if (
    !atividades.length ||
    atividades.some(
      a =>
        !a.pesoFisicoAprovado ||
        !Number.isFinite(a.pesoFisico) ||
        !(Number(a.pesoFisico) > 0)
    ) ||
    Math.abs(atividades.reduce((s, a) => s + Number(a.pesoFisico), 0) - 100) >
      0.01 ||
    new Set(atividades.map(a => a.activityId)).size !== atividades.length
  ) {
    return {
      disponivel: false as const,
      motivo: "peso_fisico_pendente" as const,
    };
  }
  if (
    atividades.some(
      a => !Number.isFinite(a.quantidade) || !(Number(a.quantidade) > 0)
    )
  ) {
    return {
      disponivel: false as const,
      motivo: "quantidade_ausente" as const,
    };
  }
  return {
    disponivel: true as const,
    porAtividade: new Map(
      atividades.map(a => [
        a.activityId,
        { peso: Number(a.pesoFisico), planejado: Number(a.quantidade) },
      ])
    ),
  };
}

export function acumularProducaoFisica(
  entradas: readonly { activityId: number; quantidade: number; dia: number }[],
  pesos: ReadonlyMap<number, { peso: number; planejado: number }>
) {
  const totais = new Map<number, number>();
  const porDia = new Map<number, number>();
  for (const entrada of [...entradas].sort((a, b) => a.dia - b.dia)) {
    const base = pesos.get(entrada.activityId);
    if (
      !base ||
      !Number.isFinite(entrada.quantidade) ||
      entrada.quantidade < 0 ||
      !Number.isFinite(entrada.dia)
    )
      continue;
    const anterior = totais.get(entrada.activityId) ?? 0;
    const atual = Math.min(base.planejado, anterior + entrada.quantidade);
    totais.set(entrada.activityId, atual);
    const dia = Math.max(0, entrada.dia);
    porDia.set(
      dia,
      (porDia.get(dia) ?? 0) + ((atual - anterior) / base.planejado) * base.peso
    );
  }
  let total = 0;
  return [...porDia]
    .sort(([a], [b]) => a - b)
    .map(([dia, incremento]) => ({ dia, percentual: (total += incremento) }));
}

/** Cobertura mede atividades com apontamento, não a parcela executada da obra. */
export function coberturaDeProducao(entradas: readonly { activityId: number; dia: number }[], pesos: ReadonlyMap<number, { peso: number; planejado: number }>, dia: number) {
  const ids = new Set(entradas.filter(e => Number.isFinite(e.dia) && e.dia <= dia && pesos.has(e.activityId)).map(e => e.activityId));
  return { registradas: ids.size, total: pesos.size, completa: pesos.size > 0 && ids.size === pesos.size };
}
