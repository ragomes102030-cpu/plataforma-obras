import { describe, expect, it } from "vitest";
import { validateEapForBaseline } from "./eap-approval-validator";
import type { EapScopeNode } from "./eap-validator";

function node(overrides: Partial<EapScopeNode> = {}): EapScopeNode {
  const value: EapScopeNode = {
    id: 1,
    projectId: 1,
    externalId: null,
    externalUid: null,
    parentId: null,
    code: "1",
    name: "Obra",
    level: 1,
    nodeType: "grupo",
    unit: null,
    plannedQuantity: null,
    sortOrder: 0,
    description: "Escopo completo da obra.",
    inclusions: "Todos os entregáveis contratados.",
    exclusions: "Itens fora do contrato.",
    responsible: "Engenheiro responsável",
    acceptanceCriteria: "Escopo aprovado conforme contrato.",
    decompositionBasis: "project",
    ...overrides,
  };
  return value;
}

describe("validateEapForBaseline", () => {
  it("bloqueia baseline quando a folha não possui dicionário completo", () => {
    const result = validateEapForBaseline([
      node(),
      node({
        id: 2,
        parentId: 1,
        code: "1.1",
        name: "Fundação",
        nodeType: "pacote",
        description: null,
        inclusions: null,
        exclusions: null,
        responsible: null,
        acceptanceCriteria: null,
        decompositionBasis: "deliverable",
      }),
    ]);

    expect(result.readyForBaseline).toBe(false);
    expect(result.issues.some(issue => issue.code === "eap_leaf_not_ready")).toBe(true);
  });

  it("aceita uma EAP com dicionário completo e fronteiras evidenciadas", () => {
    const result = validateEapForBaseline([
      node(),
      node({
        id: 2,
        parentId: 1,
        code: "1.1",
        name: "Fundação",
        nodeType: "pacote",
        description: "Fundação da edificação.",
        inclusions: "Escavação, formas, armaduras e concreto.",
        exclusions: "Superestrutura.",
        responsible: "Engenheiro de estruturas",
        acceptanceCriteria: "Conforme projeto estrutural e inspeção aprovada.",
        decompositionBasis: "deliverable",
      }),
    ]);

    expect(result.readyForBaseline).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("bloqueia sobreposição de escopo na aprovação", () => {
    const leaf = {
      description: "Execução de formas e concretagem.",
      inclusions: "Formas e concretagem.",
      exclusions: "Armaduras.",
      responsible: "Engenheiro",
      acceptanceCriteria: "Inspeção aprovada.",
      decompositionBasis: "deliverable",
    };
    const result = validateEapForBaseline([
      node(),
      node({ id: 2, parentId: 1, code: "1.1", name: "Fundação A", nodeType: "pacote", ...leaf }),
      node({ id: 3, parentId: 1, code: "1.2", name: "Fundação B", nodeType: "pacote", ...leaf }),
    ]);

    expect(result.readyForBaseline).toBe(false);
    expect(result.issues.some(issue => issue.code === "eap_scope_overlap_evidence")).toBe(true);
  });
});
