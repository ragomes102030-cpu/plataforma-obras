import { describe, expect, it } from "vitest";
import { consolidateControlProgress } from "./control-summary";
const rows = [
  { id: 1, budgetItemId: 11, plannedQuantity: 500, plannedProgress: 50, actualProgress: 20 },
  { id: 2, budgetItemId: 22, plannedQuantity: 20, plannedProgress: 100, actualProgress: 80 },
];
describe("controle: consolidação por valor aprovado", () => {
  it("pondera valores, não quantidades físicas de unidades distintas", () => {
    const value = consolidateControlProgress(rows, [
      { id: 11, unitPrice: 2 }, { id: 22, unitPrice: 100 },
    ]);
    expect(value).toMatchObject({
      plannedProgress: 83.3, actualProgress: 60, variance: -23.3,
      coveredActivities: 2, reason: null,
    });
  });
  it("não inventa percentual com orçamento não aprovado", () => {
    expect(consolidateControlProgress(rows, null)).toMatchObject({
      plannedProgress: null, actualProgress: null, reason: "sem_orcamento_aprovado",
    });
  });
  it("não apresenta 100% sobre somente parte do escopo", () => {
    expect(consolidateControlProgress(rows, [{ id: 22, unitPrice: 100 }])).toMatchObject({
      plannedProgress: null, coveredActivities: 1, totalActivities: 2,
      reason: "cobertura_incompleta",
    });
  });
  it("rejeita preço zero e quantidade ausente como peso", () => {
    expect(consolidateControlProgress(rows, [{ id: 11, unitPrice: 0 }, { id: 22, unitPrice: 10 }]).reason).toBe("cobertura_incompleta");
  });
});
