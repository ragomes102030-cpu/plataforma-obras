import { describe, expect, it } from "vitest";
import {
  validateEap,
  validateEapScope,
  validateWbsCostCoverage,
  validateAndNormalizeEapProposal,
} from "./eap-validator";
import type { EapEvidenceNode } from "./domain-types";

function node(overrides: Partial<EapEvidenceNode> = {}): EapEvidenceNode {
  const value = {
    id: 1,
    projectId: 1,
    externalId: null,
    externalUid: null,
    parentId: null,
    code: "1",
    name: "Raiz",
    level: 1,
    nodeType: "grupo" as const,
    unit: null,
    plannedQuantity: null,
    sortOrder: 1,
    ...overrides,
  };
  return {
    ...value,
    level: overrides.level ?? value.code.split(".").length,
  };
}

describe("validateAndNormalizeEapProposal", () => {
  it("resolve nodeId pelo código existente em uma atualização", () => {
    const current = [
      node(),
      node({ id: 2, parentId: 1, code: "1.1", name: "Canteiro", nodeType: "entrega" }),
    ];

    const result = validateAndNormalizeEapProposal(current, {
      action: "propose_eap",
      basis: [],
      assumptions: [],
      missingInformation: [],
      nodes: [{
        operation: "update",
        parentCode: "1",
        code: "1.1",
        name: "Canteiro revisado",
        nodeType: "entrega",
        rationale: "Corrige o escopo.",
      }],
    });

    expect(result.validation?.valid).toBe(true);
    expect(result.nodes[0]?.nodeId).toBe(2);
    expect(result.nodes[0]?.code).toBe("1.1");
  });

  it("reconcilia nodeId obsoleto de versão anterior pelo código EAP", () => {
    const current = [
      node(),
      node({ id: 202, parentId: 1, code: "1.1", name: "Canteiro", nodeType: "entrega" }),
    ];

    const result = validateAndNormalizeEapProposal(current, {
      action: "propose_eap",
      basis: [],
      assumptions: [],
      missingInformation: [],
      nodes: [{
        operation: "update",
        nodeId: 2561,
        parentCode: "1",
        code: "1.1",
        name: "Canteiro revisado",
        nodeType: "entrega",
        rationale: "Revisão gerada em versão anterior da EAP.",
      }],
    });

    expect(result.validation?.valid).toBe(true);
    expect(result.nodes[0]?.nodeId).toBe(202);
    expect(result.nodes[0]?.code).toBe("1.1");
    expect(result.validation?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "proposal_stale_node_id_rebound",
        severity: "warning",
      }),
    ]));
  });
  });
});

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

  it("rejeita nível incompatível com a profundidade do código", () => {
    const result = validateEap([
      node(),
      node({ id: 2, parentId: 1, code: "1.1", level: 3, name: "Canteiro", nodeType: "pacote" }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "eap_level_code_mismatch"
    );
  });

  it("rejeita filho abaixo de uma entrega", () => {
    const result = validateEap([
      node({ id: 1, code: "1", nodeType: "entrega", name: "Entrega" }),
      node({ id: 2, parentId: 1, code: "1.1", name: "Subitem" }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain(
      "eap_child_of_delivery"
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


describe("validateEapScope", () => {
  it("rejeita entrega com filhos e nomes de escopo duplicados entre irmãos", () => {
    const result = validateEapScope([
      node({ id: 1, code: "1", name: "Obra", nodeType: "grupo" }),
      node({ id: 2, parentId: 1, code: "1.1", name: "Fundação", nodeType: "entrega", unit: "m3", plannedQuantity: 100 }),
      node({ id: 3, parentId: 2, code: "1.1.1", name: "Concreto", nodeType: "entrega", unit: "m3", plannedQuantity: 10 }),
      node({ id: 4, parentId: 1, code: "1.2", name: "Fundação", nodeType: "pacote", unit: "m3", plannedQuantity: 20 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(
      expect.arrayContaining(["eap_delivery_has_children", "possible_scope_overlap"])
    );
  });

  it("avisa quando a folha ainda não está pronta para virar pacote controlável", () => {
    const result = validateEapScope(
      [node({ id: 1, code: "1", name: "Fundação", nodeType: "entrega" })],
      { requireDictionaryForLeaves: true }
    );
    expect(result.valid).toBe(true);
    expect(result.issues.map(issue => issue.code)).toContain("eap_leaf_not_ready");
  });

  it("classifica sobreposição textual entre irmãos como alerta de escopo, não bloqueio", () => {
    const result = validateEapScope([
      node({ id: 1, code: "1", name: "Obra", nodeType: "grupo", description: "Fundação." }),
      node({
        id: 2,
        parentId: 1,
        code: "1.1",
        name: "Fundação A",
        nodeType: "entrega",
        description: "Formas, armaduras, concretagem e cura.",
        inclusions: "Formas, armaduras, concretagem e cura.",
        exclusions: null,
      }),
      node({
        id: 3,
        parentId: 1,
        code: "1.2",
        name: "Fundação B",
        nodeType: "entrega",
        description: "Formas, armaduras, concretagem e cura.",
        inclusions: "Formas, armaduras, concretagem e cura.",
        exclusions: null,
      }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "eap_scope_overlap_evidence", severity: "warning" }),
    ]));
  });
  it("confere o fechamento quantitativo quando pai e filhos usam a mesma unidade", () => {
    const result = validateEapScope([
      node({ id: 1, code: "1", name: "Fundação", nodeType: "grupo", unit: "m3", plannedQuantity: 100 }),
      node({ id: 2, parentId: 1, code: "1.1", name: "Bloco A", nodeType: "entrega", unit: "m3", plannedQuantity: 40 }),
      node({ id: 3, parentId: 1, code: "1.2", name: "Bloco B", nodeType: "entrega", unit: "m3", plannedQuantity: 30 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.issues.map(issue => issue.code)).toContain("eap_quantity_rollup_mismatch");
  });
});
