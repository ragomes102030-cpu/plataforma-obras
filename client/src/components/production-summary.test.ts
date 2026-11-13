import { describe, expect, it } from "vitest";
import { calcularAvancoMedioDasAtividadesMedidas } from "./production-summary";

describe("calcularAvancoMedioDasAtividadesMedidas", () => {
  it("não informa 0% quando ainda não há atividade com produção confirmada", () => {
    expect(calcularAvancoMedioDasAtividadesMedidas([
      { plannedQuantity: 101, confirmedQuantity: null },
      { plannedQuantity: 35, confirmedQuantity: null },
    ])).toBeNull();
  });

  it("preserves 0% when a confirmed production entry exists with zero quantity", () => {
    expect(calcularAvancoMedioDasAtividadesMedidas([
      { plannedQuantity: 100, confirmedQuantity: 0 },
    ])).toBe(0);
  });

  it("calcula a média somente nas atividades medidas com quantidade planejada", () => {
    expect(calcularAvancoMedioDasAtividadesMedidas([
      { plannedQuantity: 100, confirmedQuantity: 25 },
      { plannedQuantity: 50, confirmedQuantity: null },
      { plannedQuantity: 20, confirmedQuantity: 10 },
      { plannedQuantity: null, confirmedQuantity: 8 },
    ])).toBe(37.5);
  });
});
