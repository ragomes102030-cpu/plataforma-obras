type ConsultaAtualizacao<T> = { invalidate: (input?: T) => Promise<unknown> };
type LeiturasDePrazo = {
  planning: {
    activityScheduleUpdates: ConsultaAtualizacao<{ projectId: number; activityId: number }>;
    activityScheduleStatusSummary: ConsultaAtualizacao<{ projectId: number }>;
    activityScheduleForecast: ConsultaAtualizacao<{ projectId: number }>;
  };
};

/** Mantém os indicadores de prazo sincronizados após registrar ou corrigir um relato. */
export async function revalidarAtualizacaoPrazo(utils: LeiturasDePrazo, projectId: number, activityId: number) {
  await Promise.all([
    utils.planning.activityScheduleUpdates.invalidate({ projectId, activityId }),
    utils.planning.activityScheduleStatusSummary.invalidate(),
    utils.planning.activityScheduleForecast.invalidate(),
  ]);
}
