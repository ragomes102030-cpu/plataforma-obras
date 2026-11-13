type ActivityProduction = {
  plannedQuantity: number | string | null | undefined;
  confirmedQuantity: number | string | null | undefined;
};

/** Média entre atividades que têm base quantitativa e produção confirmada. */
export function calcularAvancoMedioDasAtividadesMedidas(
  activities: ActivityProduction[],
): number | null {
  const measured = activities.filter(activity =>
    Number(activity.plannedQuantity) > 0 &&
    activity.confirmedQuantity !== null &&
    activity.confirmedQuantity !== undefined &&
    Number.isFinite(Number(activity.confirmedQuantity))
  );
  if (measured.length === 0) return null;

  return measured.reduce((sum, activity) =>
    sum + Number(activity.confirmedQuantity) / Number(activity.plannedQuantity) * 100,
  0) / measured.length;
}
