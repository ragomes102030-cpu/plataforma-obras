import { describe, expect, it } from "vitest";
import { summarizeBudgetQuantities } from "./budget-quantity-readiness";

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
