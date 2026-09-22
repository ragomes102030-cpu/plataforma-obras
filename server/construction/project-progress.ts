export type ProgressActivity = {
  progress: number;
  durationDays: number;
};

/**
 * Deriva o progresso consolidado de uma obra a partir das atividades.
 * Média ponderada pela duração (atividade longa pesa mais no avanço físico);
 * fallback para média simples quando a duração total é zero.
 * Retorna inteiro 0–100, arredondado.
 */
export function deriveProjectProgress(
  activities: readonly ProgressActivity[]
): number {
  if (activities.length === 0) return 0;
  const totalDuration = activities.reduce(
    (sum, activity) => sum + Math.max(0, activity.durationDays),
    0
  );
  if (totalDuration <= 0) {
    const simple = activities.reduce((sum, activity) => sum + activity.progress, 0);
    const rounded = Math.round(simple / activities.length);
    if (rounded <= 0 && activities.some((a) => a.progress > 0)) return 1;
    return clampPercent(rounded);
  }
  const weighted = activities.reduce(
    (sum, activity) =>
      sum + activity.progress * Math.max(0, activity.durationDays),
    0
  );
  const rounded = Math.round(weighted / totalDuration);
  if (rounded <= 0 && activities.some((a) => a.progress > 0)) return 1;
  return clampPercent(rounded);
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
