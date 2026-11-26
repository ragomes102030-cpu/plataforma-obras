type ConsultaAtualizacao<T> = { invalidate: (input: T) => Promise<unknown> };
type LeiturasDePrazo = {
  planning: {
    activityScheduleUpdates: ConsultaAtualizacao<{ projectId: number; activityId: number }>;
    activityScheduleStatusSummary: ConsultaAtualizacao<{ projectId: number; asOf: string }>;
    activityScheduleForecast: ConsultaAtualizacao<{ projectId: number; asOf: string }>;
  };
};

/** Mantém os indicadores de prazo sincronizados após registrar ou corrigir um relato. */
export async function revalidarAtualizacaoPrazo(utils: LeiturasDePrazo, projectId: number, activityId: number, asOf: string) {
  await Promise.all([
    utils.planning.activityScheduleUpdates.invalidate({ projectId, activityId }),
    utils.planning.activityScheduleStatusSummary.invalidate({ projectId, asOf }),
    utils.planning.activityScheduleForecast.invalidate({ projectId, asOf }),
  ]);
}
