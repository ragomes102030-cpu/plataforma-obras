import { describe, expect, it } from "vitest";
import { calculateActivityDuration, validateDependencyNetwork } from "./engineering-capabilities";

describe("internal engineering capabilities", () => {
  it("calculates duration without MCP", () => {
    expect(calculateActivityDuration({
      plannedQuantity: 100,
      productivity: 20,
      quantityUnit: "m2",
      productivityUnit: "m2",
    }).durationDays).toBe(5);
  });

  it("refuses incompatible units instead of inventing conversion", () => {
    expect(() => calculateActivityDuration({
      plannedQuantity: 100,
      productivity: 20,
      quantityUnit: "m2",
      productivityUnit: "m",
    })).toThrow(/Unidades incompatíveis/);
  });

  it("detects dependency cycles", () => {
    const result = validateDependencyNetwork([
      { id: "1", predecessor: "A", successor: "B" },
      { id: "2", predecessor: "B", successor: "C" },
      { id: "3", predecessor: "C", successor: "A" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.cycle.length).toBeGreaterThan(0);
  });

  it("accepts an acyclic network", () => {
    expect(validateDependencyNetwork([
      { id: "1", predecessor: "A", successor: "B" },
      { id: "2", predecessor: "B", successor: "C" },
    ]).valid).toBe(true);
  });
});
