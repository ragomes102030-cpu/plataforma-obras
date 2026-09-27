import type { EapEvidenceNode, EvidenceWarning } from "./domain-types";

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = EvidenceWarning & {
  severity: ValidationSeverity;
};

export type EapValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export function validateEap(nodes: EapEvidenceNode[]): EapValidationResult {
  const issues: ValidationIssue[] = [];
  const byId = new Map<string, EapEvidenceNode>();
  const byCode = new Map<string, EapEvidenceNode>();

  for (const node of nodes) {
    const id = String(node.id);
    const code = node.code.trim();
    if (byId.has(id)) {
      issues.push({
        code: "duplicate_eap_id",
        severity: "error",
        message: `ID EAP duplicado: ${id}.`,
        entityRef: id,
      });
    } else {
      byId.set(id, node);
    }
    if (byCode.has(code)) {
      issues.push({
        code: "duplicate_eap_code",
        severity: "error",
        message: `Código EAP duplicado: ${code}.`,
        entityRef: code,
      });
    } else {
      byCode.set(code, node);
    }
    if (!node.name.trim()) {
      issues.push({
        code: "empty_eap_name",
        severity: "error",
        message: `Nó EAP sem nome: ${id}.`,
        entityRef: id,
      });
    }
  }

  for (const node of nodes) {
    if (node.parentId === null) continue;
    const parentId = String(node.parentId);
    if (!byId.has(parentId)) {
      issues.push({
        code: "orphan_eap_node",
        severity: "error",
        message: `Nó EAP ${node.code} aponta para pai inexistente: ${parentId}.`,
        entityRef: String(node.id),
      });
    }
  }

  for (const node of nodes) {
    const code = node.code.trim();
    const expectedParentCode = code.includes(".")
      ? code.slice(0, code.lastIndexOf("."))
      : null;
    if (!expectedParentCode) continue;
    const parent =
      node.parentId === null ? undefined : byId.get(String(node.parentId));
    if (parent?.code.trim() !== expectedParentCode) {
      issues.push({
        code: "eap_parent_code_mismatch",
        severity: "error",
        message: `Nó EAP ${code} deveria ter como pai ${expectedParentCode}.`,
        entityRef: String(node.id),
      });
    }
  }

  const state = new Map<string, "visiting" | "visited">();
  const visit = (node: EapEvidenceNode) => {
    const id = String(node.id);
    if (state.get(id) === "visiting") {
      issues.push({
        code: "eap_cycle",
        severity: "error",
        message: `Ciclo encontrado na hierarquia EAP a partir de ${node.code}.`,
        entityRef: id,
      });
      return;
    }
    if (state.get(id) === "visited") return;
    state.set(id, "visiting");
    if (node.parentId !== null) {
      const parent = byId.get(String(node.parentId));
      if (parent) visit(parent);
    }
    state.set(id, "visited");
  };
  nodes.forEach(visit);

  return { valid: !issues.some(issue => issue.severity === "error"), issues };
}

/**
 * Regra dos 100% aplicada a custo.
 *
 * A EAP é uma árvore de escopo, não de quantidade: nós irmãos podem ter
 * unidades diferentes (m², kg, m³, vb), então somar quantidade de filho
 * contra o pai não é válido de forma geral. O que precisa amarrar em 100%
 * é o CUSTO: todo pacote-folha de escopo (nó sem filhos) precisa estar
 * coberto por pelo menos um item de orçamento, e nenhum nó pode ter custo
 * lançado tanto nele quanto em algum de seus descendentes (dupla contagem
 * — o que empurraria o total para além de 100% do escopo real).
 *
 * Esta função não substitui validateEap: rode as duas. Ela assume que a
 * árvore já passou por validateEap (não trata ciclo/órfão aqui).
 */
export type BudgetItemCostRef = {
  wbsNodeId: number | string | null;
};

export function validateWbsCostCoverage(
  nodes: EapEvidenceNode[],
  budgetItems: BudgetItemCostRef[]
): EapValidationResult {
  const issues: ValidationIssue[] = [];
  const byId = new Map<string, EapEvidenceNode>();
  for (const node of nodes) byId.set(String(node.id), node);

  const childrenOf = new Map<string, EapEvidenceNode[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const parentKey = String(node.parentId);
    childrenOf.set(parentKey, [...(childrenOf.get(parentKey) ?? []), node]);
  }

  const nodesWithCost = new Set<string>();
  for (const item of budgetItems) {
    if (item.wbsNodeId === null) continue;
    nodesWithCost.add(String(item.wbsNodeId));
  }

  const hasCostedDescendant = (nodeId: string): boolean => {
    for (const child of childrenOf.get(nodeId) ?? []) {
      const childId = String(child.id);
      if (nodesWithCost.has(childId) || hasCostedDescendant(childId))
        return true;
    }
    return false;
  };

  for (const node of nodes) {
    const id = String(node.id);
    const children = childrenOf.get(id) ?? [];
    const isLeaf = children.length === 0;

    if (isLeaf) {
      if (!nodesWithCost.has(id)) {
        issues.push({
          code: "wbs_leaf_without_cost",
          severity: "error",
          message: `Entrega ${node.code} (${node.name}) não tem nenhum item de orçamento vinculado — o escopo existe na EAP mas não tem custo, então o orçamento não cobre 100% da obra.`,
          entityRef: id,
        });
      }
    } else {
      if (nodesWithCost.has(id) && hasCostedDescendant(id)) {
        issues.push({
          code: "wbs_double_counted_cost",
          severity: "error",
          message: `O nó ${node.code} (${node.name}) tem custo lançado nele e também em algum de seus descendentes — isso conta o mesmo escopo duas vezes e estoura os 100% do orçamento.`,
          entityRef: id,
        });
      }
      if (children.every(child => !nodesWithCost.has(String(child.id)) && !hasCostedDescendant(String(child.id))) && !nodesWithCost.has(id)) {
        issues.push({
          code: "wbs_group_without_any_cost",
          severity: "warning",
          message: `Nenhum descendente de ${node.code} (${node.name}) tem custo lançado ainda.`,
          entityRef: id,
        });
      }
    }
  }

  return { valid: !issues.some(issue => issue.severity === "error"), issues };
}
