import { calculateCpm, type CpmActivity, type Dependency } from "./cpm";
import type { ActivityScheduleStatus } from "./activity-schedule-update";

export type ActivityScheduleForecastInput = {
  cutoffOffset: number;
  activities: readonly (CpmActivity & { name?: string })[];
  dependencies: readonly Dependency[];
  updates: readonly {
    activityId: string;
    status: ActivityScheduleStatus;
    actualStartOffset?: number | null;
    actualFinishOffset?: number | null;
    remainingDurationDays?: number | null;
    forecastRemainingDays?: number | null;
    blockerReason?: string | null;
  }[];
};

export type ActivityScheduleForecast = {
  projectFinishOffset: number | null;
  activities: {
    id: string;
    startOffset: number;
    finishOffset: number;
    isMilestone: boolean;
    status: ActivityScheduleStatus | "sem_relato";
  }[];
  activitiesWithoutUpdate: number;
  outOfSequenceActivityIds: string[];
  warnings: { code: string; activityIds: string[]; message: string }[];
  unavailableReason: string | null;
};

/**
 * Recalcula uma projeção de prazo sobre a rede atual sem gravar no plano.
 * `cutoffOffset` representa o primeiro dia útil posterior à data de posição.
 */
export function calcularPrevisaoDePrazo(
  input: ActivityScheduleForecastInput,
): ActivityScheduleForecast {
  const warnings: ActivityScheduleForecast["warnings"] = [];
  const updates = new Map(input.updates.map(update => [update.activityId, update]));
  const base = {
    projectFinishOffset: null,
    activities: [],
    activitiesWithoutUpdate: input.activities.filter(activity => !updates.has(activity.id)).length,
    outOfSequenceActivityIds: [],
    warnings,
    unavailableReason: null,
  } satisfies ActivityScheduleForecast;

  if (!Number.isInteger(input.cutoffOffset) || input.cutoffOffset < 0) {
    return { ...base, unavailableReason: "A data de corte não corresponde a um índice de dia útil válido." };
  }
  if (input.activities.length === 0) {
    return { ...base, unavailableReason: "Inclua serviços executáveis na EAP antes de projetar o prazo." };
  }

  let planned;
  try {
    planned = calculateCpm(input.activities.map(activity => ({ ...activity })), [...input.dependencies]);
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    return { ...base, unavailableReason: `A rede atual não permite calcular a previsão: ${detalhe}` };
  }
  const plannedById = new Map(planned.activities.map(activity => [activity.id, activity]));
  const outOfSequenceActivityIds = new Set<string>();
  const unresolvedBlocked = input.activities
    .filter(activity => {
      const update = updates.get(activity.id);
      return update?.status === "bloqueada" &&
        update.remainingDurationDays == null && update.forecastRemainingDays == null;
    })
    .map(activity => activity.name || activity.id);

  for (const activity of input.activities) {
    const update = updates.get(activity.id);
    if (!update?.actualStartOffset && update?.actualStartOffset !== 0) continue;
    if (update.status !== "em_andamento" && update.status !== "concluida" && update.status !== "bloqueada") continue;
    const plannedStart = plannedById.get(activity.id)?.earlyStart;
    const hasPredecessor = input.dependencies.some(dependency => dependency.successorId === activity.id);
    if (hasPredecessor && plannedStart != null && update.actualStartOffset < plannedStart) {
      outOfSequenceActivityIds.add(activity.id);
    }
  }

  if (base.activitiesWithoutUpdate > 0) {
    warnings.push({
      code: "COBERTURA_INCOMPLETA",
      activityIds: input.activities.filter(activity => !updates.has(activity.id)).map(activity => activity.id),
      message: `${base.activitiesWithoutUpdate} serviço(s) sem relato conservam a duração planejada; isso não confirma execução.`,
    });
  }
  if (outOfSequenceActivityIds.size) {
    const ids = [...outOfSequenceActivityIds];
    warnings.push({
      code: "FORA_DE_SEQUENCIA",
      activityIds: ids,
      message: `${ids.length} serviço(s) começaram antes da janela prevista pela rede. O início observado prevalece na projeção e a ocorrência fica sinalizada.`,
    });
  }
  if (unresolvedBlocked.length) {
    return {
      ...base,
      warnings,
      outOfSequenceActivityIds: [...outOfSequenceActivityIds],
      unavailableReason: `Término indisponível: ${unresolvedBlocked.join(", ")} está(ão) bloqueado(s) sem estimativa de duração restante ou término.`,
    };
  }

  const activitiesForForecast: CpmActivity[] = [];
  for (const activity of input.activities) {
    const update = updates.get(activity.id);
    const plannedActivity = plannedById.get(activity.id)!;
    if (update?.status === "concluida") {
      if (!Number.isInteger(update.actualFinishOffset) || Number(update.actualFinishOffset) < 0) {
        return { ...base, warnings, unavailableReason: `O término real de ${activity.name || activity.id} não está disponível para a projeção.` };
      }
      activitiesForForecast.push({
        id: activity.id,
        duration: 0,
        isMilestone: true,
        startOffsetDay: Number(update.actualFinishOffset),
      });
      continue;
    }

    const emExecucao = update?.status === "em_andamento" ||
      (update?.status === "bloqueada" && update.actualStartOffset != null);
    const bloqueada = update?.status === "bloqueada";
    const duracaoRestante = update?.remainingDurationDays ?? update?.forecastRemainingDays;
    if (emExecucao || bloqueada) {
      if (!Number.isInteger(duracaoRestante) || Number(duracaoRestante) <= 0) {
        return { ...base, warnings, unavailableReason: `Informe a duração restante ou o término estimado de ${activity.name || activity.id}.` };
      }
      activitiesForForecast.push({
        id: activity.id,
        duration: Number(duracaoRestante),
        isMilestone: false,
        startOffsetDay: Math.max(input.cutoffOffset, emExecucao ? input.cutoffOffset : plannedActivity.earlyStart),
      });
      continue;
    }

    activitiesForForecast.push({
      id: activity.id,
      duration: activity.duration,
      isMilestone: activity.isMilestone,
      startOffsetDay: Math.max(input.cutoffOffset, plannedActivity.earlyStart),
      mustStartOn: activity.mustStartOn,
      finishNoLaterThan: activity.finishNoLaterThan,
    });
  }

  const idsStartedOrCompleted = new Set(input.activities
    .filter(activity => {
      const update = updates.get(activity.id);
      return update?.status === "em_andamento" || update?.status === "concluida" ||
        (update?.status === "bloqueada" && update.actualStartOffset != null);
    })
    .map(activity => activity.id));
  const activeDependencies = input.dependencies.filter(dependency =>
    !idsStartedOrCompleted.has(dependency.successorId),
  );

  try {
    const forecast = calculateCpm(activitiesForForecast, activeDependencies);
    const infeasibleIds = forecast.activities.filter(activity => activity.infeasible).map(activity => activity.id);
    if (infeasibleIds.length) {
      warnings.push({
        code: "PRAZO_INVIAVEL",
        activityIds: infeasibleIds,
        message: `${infeasibleIds.length} serviço(s) não conseguem cumprir uma data limite declarada na previsão atual.`,
      });
    }
    return {
      projectFinishOffset: forecast.projectDuration,
      activities: forecast.activities.map(activity => ({
        id: activity.id,
        startOffset: activity.earlyStart,
        finishOffset: activity.earlyFinish,
        isMilestone: Boolean(activity.isMilestone),
        status: updates.get(activity.id)?.status ?? "sem_relato",
      })),
      activitiesWithoutUpdate: base.activitiesWithoutUpdate,
      outOfSequenceActivityIds: [...outOfSequenceActivityIds],
      warnings,
      unavailableReason: null,
    };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      warnings,
      outOfSequenceActivityIds: [...outOfSequenceActivityIds],
      unavailableReason: `Não foi possível recalcular a rede de serviços: ${detalhe}`,
    };
  }
}
