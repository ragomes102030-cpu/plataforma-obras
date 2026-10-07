import { describe, expect, it } from "vitest";
import { derivePlanningEvidence } from "./planning-evidence";

describe("derivePlanningEvidence", () => {
  it("classifies duration-only planning as estimate", () => {
    const result = derivePlanningEvidence({ durationDays: 10 });
    expect(result.level).toBe("estimate");
    expect(result.gaps).toEqual(["quantidade", "produtividade"]);
  });

  it("recognizes quantity and productivity as an engineering basis", () => {
    const result = derivePlanningEvidence({
      durationDays: 10,
      plannedQuantity: 100,
      productivity: 10,
    });
    expect(result.level).toBe("engineer_informed");
    expect(result.gaps).toEqual([]);
  });

  it("requires explicit source before source-supported classification", () => {
    const result = derivePlanningEvidence({
      durationDays: 10,
      plannedQuantity: 100,
      productivity: 10,
      source: "SINAPI 09/2026",
    });
    expect(result.level).toBe("source_supported");
  });

  it("does not invent missing engineering premises", () => {
    const result = derivePlanningEvidence({
      durationDays: 10,
      budgetItemId: 12,
    });
    expect(result.gaps).toContain("quantidade");
    expect(result.gaps).toContain("produtividade");
    expect(result.level).toBe("estimate");
  });

  it("lets explicit engineer validation close the evidence", () => {
    const result = derivePlanningEvidence({
      durationDays: 10,
      plannedQuantity: 100,
      productivity: 10,
      engineerValidated: true,
    });
    expect(result.level).toBe("validated");
  });
});
