import { describe, expect, it } from "vitest";
import { summarizeBudgetQuantities, summarizeQuantityEvidence } from "./budget-quantity-readiness";

describe("summarizeBudgetQuantities", () => {
  it("keeps an empty budget out of the ready state", () => {
    expect(summarizeBudgetQuantities(0, 0)).toEqual({
      status: "Sem itens",
      description: "Nenhum item para validar",
    });
  });

  it("requires every item to have a unit price before reporting ready", () => {
    expect(summarizeBudgetQuantities(2, 1).status).toBe("Revisar");
    expect(summarizeBudgetQuantities(2, 0).status).toBe("OK");
  });
});

describe("summarizeQuantityEvidence", () => {
  it("does not treat scenario quantities as validated", () => {
    expect(summarizeQuantityEvidence(["cenario", "cenario", "cenario"])).toEqual({
      status: "Em revisão",
      description: "3 em cenário · 0 validados; cenário não libera execução",
    });
  });

  it("separates pending, scenario, and validated evidence", () => {
    expect(summarizeQuantityEvidence(["pendente", "cenario", "validada"])).toEqual({
      status: "Não validado",
      description: "1 pendentes · 1 em cenário · 1 validados",
    });
  });

  it("reports validation only when every item has validated evidence", () => {
    expect(summarizeQuantityEvidence(["validada", "validada"]).status).toBe("Validado");
  });
});
