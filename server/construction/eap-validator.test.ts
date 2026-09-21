import { describe, expect, it } from "vitest";
import { validateEap } from "./eap-validator";
import type { EapEvidenceNode } from "./domain-types";

function node(overrides: Partial<EapEvidenceNode> = {}): EapEvidenceNode {
  return {
    id: 1,
    projectId: 1,
    externalId: null,
    externalUid: null,
    parentId: null,
    code: "1",
    name: "Raiz",
    level: 1,
    nodeType: "grupo",
    unit: null,
    plannedQuantity: null,
    sortOrder: 1,
    ...overrides,
  };
}

describe("validateEap", () => {
  it("aceita uma árvore com pai e filho válidos", () => {
    const result = validateEap([
      node(),
      node({
        id: 2,
        parentId: 1,
        code: "1.1",
        name: "Fundação",
        nodeType: "pacote",
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejeita órfão e código duplicado", () => {
    const result = validateEap([
      node(),
      node({ id: 2, parentId: 999, code: "1", name: "Outro" }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual([
      "duplicate_eap_code",
      "orphan_eap_node",
    ]);
  });

  it("detecta ciclo hierárquico", () => {
    const result = validateEap([
      node({ id: 1, parentId: 2 }),
      node({ id: 2, parentId: 1, code: "2", name: "Filho" }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.some(issue => issue.code === "eap_cycle")).toBe(true);
  });
});
