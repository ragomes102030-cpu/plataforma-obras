import { describe, expect, it } from "vitest";
import { analyzeEapLocally, calculateActivityDuration, validateDependencyNetwork } from "./engineering-capabilities";

describe("internal engineering capabilities", () => {
  it("calculates duration without MCP", () => {
    expect(calculateActivityDuration({ plannedQuantity: 100, productivity: 20, quantityUnit: "m2", productivityUnit: "m2" }).durationDays).toBe(5);
  });

  it("refuses incompatible units instead of inventing conversion", () => {
    expect(() => calculateActivityDuration({ plannedQuantity: 100, productivity: 20, quantityUnit: "m2", productivityUnit: "m" })).toThrow(/Unidades incompatíveis/);
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

  it("accepts a valid single-root EAP locally", () => {
    const result = analyzeEapLocally([
      { id: 1, projectId: 1, parentId: null, code: "1", name: "Obra", level: 1, nodeType: "grupo", unit: null, plannedQuantity: null },
      { id: 2, projectId: 1, parentId: 1, code: "1.1", name: "Fundação", level: 2, nodeType: "pacote", unit: null, plannedQuantity: null },
    ]);
    expect(result.valid).toBe(true);
    expect(result.blockers).toBe(0);
  });

  it("detects invalid hierarchy locally", () => {
    const result = analyzeEapLocally([
      { id: 1, projectId: 1, parentId: null, code: "1", name: "Obra", level: 1, nodeType: "grupo", unit: null, plannedQuantity: null },
      { id: 2, projectId: 1, parentId: 99, code: "1.1", name: "Fundação", level: 2, nodeType: "pacote", unit: null, plannedQuantity: null },
    ]);
    expect(result.valid).toBe(false);
    expect(result.blockers).toBeGreaterThan(0);
  });
});
