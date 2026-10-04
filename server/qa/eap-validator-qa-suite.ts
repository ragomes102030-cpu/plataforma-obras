import { validateEap, validateEapScope, validateWbsCostCoverage } from "../construction/eap-validator";
import { validateEapForBaseline } from "../construction/eap-approval-validator";
import type { EapEvidenceNode } from "../construction/domain-types";

function node(overrides: Partial<EapEvidenceNode> = {}): EapEvidenceNode {
  const value = {
    id: 1, projectId: 8, externalId: null, externalUid: null, parentId: null,
    code: "1", name: "Obra QA", level: 1, nodeType: "grupo" as const,
    unit: null, plannedQuantity: null, sortOrder: 0,
    description: "Escopo completo da obra.", inclusions: "Entregáveis contratados.",
    exclusions: "Itens fora do contrato.", responsible: "Engenheiro",
    acceptanceCriteria: "Inspeção aprovada.", decompositionBasis: "project",
    ...overrides,
  };
  return { ...value, level: overrides.level ?? value.code.split(".").length };
}

function scopeNode(overrides: Partial<EapEvidenceNode> = {}): EapEvidenceNode {
  return node(overrides) as EapEvidenceNode;
}

export function runEapValidatorQaSuite() {
  const checks: Array<{ id: string; passed: boolean; detail: string }> = [];
  const check = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });

  const valid = [node(), node({ id: 2, parentId: 1, code: "1.1", name: "Fundação", nodeType: "pacote" })];
  check("valid-tree", validateEap(valid).valid, "árvore pai/filho válida");

  const orphan = validateEap([node(), node({ id: 2, parentId: 999, code: "1.1", name: "Órfão" })]);
  check("orphan-blocked", orphan.issues.some(i => i.code === "orphan_eap_node"), "órfão detectado");

  const duplicate = validateEap([node(), node({ id: 2, parentId: 1, code: "1", name: "Duplicado" })]);
  check("duplicate-code-blocked", duplicate.issues.some(i => i.code === "duplicate_eap_code"), "código duplicado detectado");

  const cycle = validateEap([node({ id: 1, parentId: 2 }), node({ id: 2, code: "2", parentId: 1, name: "Ciclo" })]);
  check("cycle-blocked", cycle.issues.some(i => i.code === "eap_cycle"), "ciclo detectado");

  const level = validateEap([node(), node({ id: 2, parentId: 1, code: "1.1", level: 3, name: "Nível inválido" })]);
  check("level-mismatch-blocked", level.issues.some(i => i.code === "eap_level_code_mismatch"), "nível incompatível detectado");

  const delivery = validateEap([node({ id: 1, nodeType: "entrega" }), node({ id: 2, parentId: 1, code: "1.1", name: "Filho de entrega" })]);
  check("delivery-child-blocked", delivery.issues.some(i => i.code === "eap_child_of_delivery"), "filho abaixo de entrega detectado");

  const scope = validateEapScope([
    scopeNode(),
    scopeNode({ id: 2, parentId: 1, code: "1.1", name: "Fundação A", nodeType: "entrega", description: "Formas e concreto.", inclusions: "Formas e concreto.", exclusions: "Armaduras." }),
    scopeNode({ id: 3, parentId: 1, code: "1.2", name: "Fundação B", nodeType: "pacote", description: "Formas e concreto.", inclusions: "Formas e concreto.", exclusions: "Armaduras." }),
  ]);
  check("scope-overlap-detected", scope.issues.some(i => i.code === "possible_scope_overlap"), "sobreposição de escopo detectada");

  const deliveryHasChild = validateEapScope([
    scopeNode(),
    scopeNode({ id: 2, parentId: 1, code: "1.1", name: "Entrega", nodeType: "entrega" }),
    scopeNode({ id: 3, parentId: 2, code: "1.1.1", name: "Subentrega", nodeType: "pacote" }),
  ]);
  check("scope-delivery-child-blocked", deliveryHasChild.issues.some(i => i.code === "eap_delivery_has_children"), "entrega com filhos bloqueada");

  const dictionary = validateEapForBaseline([
    scopeNode(),
    scopeNode({ id: 2, parentId: 1, code: "1.1", name: "Folha incompleta", nodeType: "pacote", description: null, inclusions: null, exclusions: null, responsible: null, acceptanceCriteria: null }),
  ]);
  check("dictionary-incomplete-blocked", !dictionary.readyForBaseline && dictionary.issues.some(i => i.code === "eap_leaf_not_ready"), "dicionário incompleto bloqueado");

  const ready = validateEapForBaseline([
    scopeNode(),
    scopeNode({ id: 2, parentId: 1, code: "1.1", name: "Fundação", nodeType: "pacote", decompositionBasis: "deliverable" }),
  ]);
  check("baseline-ready", ready.readyForBaseline && ready.valid, "folha completa pronta para baseline");

  const costs = validateWbsCostCoverage([
    node({ id: 1, code: "1", nodeType: "pacote" }),
    node({ id: 2, parentId: 1, code: "1.1", nodeType: "entrega", name: "Escavação" }),
    node({ id: 3, parentId: 1, code: "1.2", nodeType: "entrega", name: "Concreto" }),
  ], [{ wbsNodeId: 1 }, { wbsNodeId: 2 }, { wbsNodeId: 3 }]);
  check("double-cost-blocked", costs.issues.some(i => i.code === "wbs_double_counted_cost"), "dupla contagem bloqueada");

  const noCost = validateWbsCostCoverage([
    node({ id: 1, code: "1", nodeType: "pacote" }),
    node({ id: 2, parentId: 1, code: "1.1", nodeType: "entrega", name: "Escavação" }),
  ], []);
  check("leaf-without-cost-blocked", noCost.issues.some(i => i.code === "wbs_leaf_without_cost"), "folha sem custo detectada");

  const passed = checks.every(c => c.passed);
  return { suite: "EAP_VALIDATOR_REGRESSION", status: passed ? "passed" : "failed", checks, total: checks.length, passedCount: checks.filter(c => c.passed).length };
}