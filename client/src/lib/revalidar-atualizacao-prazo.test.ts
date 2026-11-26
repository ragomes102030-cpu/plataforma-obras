import { describe, expect, it, vi } from "vitest";
import { revalidarAtualizacaoPrazo } from "./revalidar-atualizacao-prazo";

describe("revalidação após apontamento de prazo", () => {
  it("atualiza histórico, resumo e previsão do campo para a obra", async () => {
    const consulta = () => ({ invalidate: vi.fn().mockResolvedValue(undefined) });
    const utils = {
      planning: {
        activityScheduleUpdates: consulta(),
        activityScheduleStatusSummary: consulta(),
        activityScheduleForecast: consulta(),
      },
    };

    await revalidarAtualizacaoPrazo(utils, 26, 1727);

    expect(utils.planning.activityScheduleUpdates.invalidate).toHaveBeenCalledWith({ projectId: 26, activityId: 1727 });
    expect(utils.planning.activityScheduleStatusSummary.invalidate).toHaveBeenCalledWith();
    expect(utils.planning.activityScheduleForecast.invalidate).toHaveBeenCalledWith();
  });
});
