import { describe, expect, it } from "vitest";
import { validateEap, validateWbsCostCoverage } from "./eap-validator";
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

  it("rejeita nó filho sem o pai indicado pelo código WBS", () => {
    const result = validateEap([
      node(),
      node({ id: 2, parentId: null, code: "1.1", name: "Canteiro" }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "eap_parent_code_mismatch"
    );
  });
});

describe("validateWbsCostCoverage", () => {
  const parent = node({ id: 1, code: "1", name: "Fundação", nodeType: "pacote" });
  const leafA = node({ id: 2, parentId: 1, code: "1.1", name: "Escavação", nodeType: "entrega" });
  const leafB = node({ id: 3, parentId: 1, code: "1.2", name: "Concretagem", nodeType: "entrega" });

  it("aceita quando toda folha tem custo e o pai não tem custo direto", () => {
    const result = validateWbsCostCoverage(
      [parent, leafA, leafB],
      [{ wbsNodeId: 2 }, { wbsNodeId: 3 }]
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejeita folha sem nenhum item de orçamento vinculado", () => {
    const result = validateWbsCostCoverage(
      [parent, leafA, leafB],
      [{ wbsNodeId: 2 }]
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "wbs_leaf_without_cost"
    );
  });

  it("rejeita custo lançado no pai e também em um descendente (dupla contagem)", () => {
    const result = validateWbsCostCoverage(
      [parent, leafA, leafB],
      [{ wbsNodeId: 1 }, { wbsNodeId: 2 }, { wbsNodeId: 3 }]
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "wbs_double_counted_cost"
    );
  });

  it("avisa quando um grupo não tem nenhum custo em toda a sua descendência", () => {
    const result = validateWbsCostCoverage([parent, leafA, leafB], []);
    expect(result.issues.map(issue => issue.code)).toContain(
      "wbs_group_without_any_cost"
    );
    // leaves sem custo já são 'error'; o grupo sem custo nenhum é 'warning' e não deve duplicar o motivo
    expect(
      result.issues.filter(issue => issue.code === "wbs_leaf_without_cost")
    ).toHaveLength(2);
  });
});
