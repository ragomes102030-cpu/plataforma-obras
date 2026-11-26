export const ACTIVITY_SCHEDULE_STATUSES = [
  "nao_iniciada",
  "em_andamento",
  "concluida",
  "bloqueada",
] as const;

export type ActivityScheduleStatus = (typeof ACTIVITY_SCHEDULE_STATUSES)[number];

export type ActivityScheduleUpdateInput = {
  positionDate: string;
  status: ActivityScheduleStatus;
  actualStartDate?: string | null;
  actualFinishDate?: string | null;
  remainingDurationDays?: number | null;
  forecastFinishDate?: string | null;
  blockerReason?: string | null;
};

function dataIsoValida(valor: string | null | undefined): boolean {
  if (valor == null || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

/** Valida o relato de prazo sem o converter em produção ou avanço físico. */
export function validarAtualizacaoDePrazo(
  input: ActivityScheduleUpdateInput
): string | null {
  if (!dataIsoValida(input.positionDate)) return "Informe uma data de posição válida.";
  for (const [label, value] of [
    ["início real", input.actualStartDate],
    ["término real", input.actualFinishDate],
    ["previsão de término", input.forecastFinishDate],
  ] as const) {
    if (value != null && !dataIsoValida(value)) return `Informe uma data de ${label} válida.`;
  }
  if (input.actualStartDate && input.actualStartDate > input.positionDate) {
    return "O início real não pode ser posterior à data de posição.";
  }
  if (input.actualFinishDate && input.actualFinishDate > input.positionDate) {
    return "O término real não pode ser posterior à data de posição.";
  }
  if (input.remainingDurationDays != null && input.forecastFinishDate) {
    return "Informe duração restante ou previsão, não ambas.";
  }
  if (
    input.actualStartDate &&
    input.actualFinishDate &&
    input.actualFinishDate < input.actualStartDate
  ) {
    return "O término real não pode anteceder o início real.";
  }

  if (input.status === "nao_iniciada" && (input.actualStartDate || input.actualFinishDate)) {
    return "Uma atividade não iniciada não pode ter datas reais de execução.";
  }
  if (input.status === "em_andamento" && input.actualFinishDate) {
    return "Uma atividade em andamento não pode ter término real informado.";
  }

  if (input.status === "em_andamento") {
    if (!input.actualStartDate) return "Informe o início real para uma atividade em andamento.";
    const duracaoRestanteValida =
      Number.isInteger(input.remainingDurationDays) &&
      Number(input.remainingDurationDays) > 0;
    if (!duracaoRestanteValida && !input.forecastFinishDate) {
      return "Informe a duração restante ou a previsão de término.";
    }
  }
  if (input.status === "concluida" && !input.actualFinishDate) {
    return "Informe o término real para uma atividade concluída.";
  }
  if (input.status === "concluida" && (input.forecastFinishDate || input.remainingDurationDays != null)) {
    return "Uma atividade concluída não pode manter previsão ou duração restante.";
  }
  if (input.status === "bloqueada" && !input.blockerReason?.trim()) {
    return "Informe o motivo do bloqueio.";
  }
  if (input.status !== "bloqueada" && input.blockerReason?.trim()) {
    return "Informe motivo de bloqueio somente quando o estado for bloqueada.";
  }
  return null;
}
