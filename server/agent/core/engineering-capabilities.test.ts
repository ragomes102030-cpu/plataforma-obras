import { describe, expect, it } from "vitest";
import { analyzeEapLocally, calculateActivityDuration, calculateCpmLocally, validateDependencyNetwork } from "./engineering-capabilities";

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
      {
        id: 1, projectId: 1, parentId: null, code: "1", name: "Obra", level: 1,
        nodeType: "grupo", unit: null, plannedQuantity: null, decompositionBasis: "project",
        description: "Obra-modelo.", inclusions: "Implantação e fundações.",
      },
      {
        id: 2, projectId: 1, parentId: 1, code: "1.1", name: "Fundação", level: 2,
        nodeType: "pacote", unit: null, plannedQuantity: null, decompositionBasis: "deliverable",
        description: "Execução das fundações previstas no projeto aprovado.",
        inclusions: "Elementos de fundação previstos em projeto.", exclusions: "Estrutura acima das fundações.",
        responsible: "Responsável a designar", acceptanceCriteria: "Conforme projeto aprovado.",
      },
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

  it("returns scope overlap warnings alongside structural EAP validation", () => {
    const result = analyzeEapLocally([
      {
        id: 1, projectId: 1, parentId: null, code: "1", name: "Obra", level: 1,
        nodeType: "grupo", unit: null, plannedQuantity: null,
        description: "Escopo da obra", inclusions: "Paredes internas e externas.",
        decompositionBasis: "project",
      },
      {
        id: 2, projectId: 1, parentId: 1, code: "1.1", name: "Parede A", level: 2,
        nodeType: "pacote", unit: null, plannedQuantity: null,
        description: "Execução de revestimento e pintura da parede.",
        inclusions: "Aplicar revestimento e pintura da parede.",
        decompositionBasis: "deliverable",
      },
      {
        id: 3, projectId: 1, parentId: 1, code: "1.2", name: "Parede B", level: 2,
        nodeType: "pacote", unit: null, plannedQuantity: null,
        description: "Execução de revestimento e pintura da parede.",
        inclusions: "Aplicar revestimento e pintura da parede.",
        decompositionBasis: "deliverable",
      },
    ]);

    expect(result.warnings).toBeGreaterThan(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "eap_scope_overlap_evidence", severity: "warning" }),
    ]));
  });
});

  it("calculates CPM locally without MCP", () => {
    const result = calculateCpmLocally(
      [
        { id: 1, durationDays: 3, mustStartOnDay: null, finishNoLaterThanDay: null },
        { id: 2, durationDays: 2, mustStartOnDay: null, finishNoLaterThanDay: null },
        { id: 3, durationDays: 1, mustStartOnDay: null, finishNoLaterThanDay: null },
      ],
      [
        { predecessorId: 1, successorId: 2, type: "FS", lag: 0 },
        { predecessorId: 2, successorId: 3, type: "FS", lag: 0 },
      ]
    );
    expect(result.valid).toBe(true);
    expect(result.schedule?.projectDuration).toBe(6);
    expect(result.schedule?.activities.find(a => a.id === "3")?.critical).toBe(true);
  });
