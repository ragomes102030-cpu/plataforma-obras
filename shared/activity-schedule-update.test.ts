import { describe, expect, it } from "vitest";
import { validarAtualizacaoDePrazo } from "./activity-schedule-update";

describe("validação do relato de prazo", () => {
  it("aceita uma atividade em andamento com previsão temporal sem quantidade", () => {
    expect(validarAtualizacaoDePrazo({
      positionDate: "2026-11-26",
      status: "em_andamento",
      actualStartDate: "2026-11-20",
      forecastFinishDate: "2026-12-10",
    })).toBeNull();
  });

  it("rejeita duração restante e data de previsão no mesmo relato", () => {
    expect(validarAtualizacaoDePrazo({
      positionDate: "2026-11-26",
      status: "em_andamento",
      actualStartDate: "2026-11-20",
      remainingDurationDays: 3,
      forecastFinishDate: "2026-12-10",
    })).toBe("Informe duração restante ou previsão, não ambas.");
  });

  it("também exige uma única base de prazo para atividade bloqueada", () => {
    expect(validarAtualizacaoDePrazo({
      positionDate: "2026-11-26",
      status: "bloqueada",
      remainingDurationDays: 3,
      forecastFinishDate: "2026-12-10",
      blockerReason: "Aguardando liberação da frente",
    })).toBe("Informe duração restante ou previsão, não ambas.");
  });

  it("exige início e duração restante ou previsão para atividade em andamento", () => {
    expect(validarAtualizacaoDePrazo({ positionDate: "2026-11-26", status: "em_andamento" }))
      .toMatch(/início real/i);
    expect(validarAtualizacaoDePrazo({
      positionDate: "2026-11-26", status: "em_andamento", actualStartDate: "2026-11-20",
    })).toMatch(/duração restante ou a previsão/i);
  });

  it("exige término real e impede um término posterior à posição", () => {
    expect(validarAtualizacaoDePrazo({ positionDate: "2026-11-26", status: "concluida" }))
      .toMatch(/término real/i);
    expect(validarAtualizacaoDePrazo({
      positionDate: "2026-11-26", status: "concluida", actualFinishDate: "2026-11-27",
    })).toMatch(/posterior à data de posição/i);
  });

  it("exige motivo para bloqueio e não transforma posição em avanço físico", () => {
    expect(validarAtualizacaoDePrazo({ positionDate: "2026-11-26", status: "bloqueada" }))
      .toMatch(/motivo do bloqueio/i);
    expect(validarAtualizacaoDePrazo({
      positionDate: "2026-11-26", status: "bloqueada", blockerReason: "Projeto executivo pendente",
    })).toBeNull();
  });

  it("rejeita datas civis inválidas", () => {
    expect(validarAtualizacaoDePrazo({ positionDate: "2026-02-30", status: "nao_iniciada" }))
      .toMatch(/data de posição válida/i);
  });
});
