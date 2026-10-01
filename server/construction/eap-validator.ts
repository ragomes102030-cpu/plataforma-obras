import type { EapEvidenceNode, EvidenceWarning } from "./domain-types";

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = EvidenceWarning & {
  severity: ValidationSeverity;
};

export type EapValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type EapDecompositionBasis =
  | "project"
  | "deliverable"
  | "system"
  | "discipline"
  | "location"
  | "phase"
  | "component"
  | "other";

export type EapScopeNode = EapEvidenceNode & {
  description?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  location?: string | null;
  responsible?: string | null;
  acceptanceCriteria?: string | null;
  decompositionBasis?: string | null;
  scopeStatus?: string | null;
};

export type EapScopeValidationOptions = {
  requireDictionaryForLeaves?: boolean;
};

export function validateEapScope(
  nodes: EapScopeNode[],
  options: EapScopeValidationOptions = {}
): EapValidationResult {
  const issues: ValidationIssue[] = [];
  const children = new Map<string, EapScopeNode[]>();
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  for (const node of nodes) {
    if (node.parentId !== null) {
      const key = String(node.parentId);
      children.set(key, [...(children.get(key) ?? []), node]);
    }
  }

  const roots = nodes.filter(node => node.parentId === null);
  if (nodes.length > 0 && roots.length !== 1) {
    issues.push({
      code: "eap_root_count_invalid",
      severity: "error",
      message: `A EAP deve possuir uma única raiz; foram encontradas ${roots.length}.`,
      entityRef: "project",
    });
  }

  const allowedBases = new Set<EapDecompositionBasis>([
    "project",
    "deliverable",
    "system",
    "discipline",
    "location",
    "phase",
    "component",
    "other",
  ]);

  const scopeText = (node: EapScopeNode) =>
    [node.description, node.inclusions]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n");

  const clauses = (value: string | null | undefined) =>
    String(value ?? "")
      .split(/[\n;,]+/)
      .map(item => normalized(item))
      .filter(Boolean);

  const overlaps = (left: string[], right: string[]) =>
    left.some(a => right.some(b => a === b || a.includes(b) || b.includes(a)));

  for (const node of nodes) {
    const childNodes = children.get(String(node.id)) ?? [];
    const isLeaf = childNodes.length === 0;
    const codeDepth = node.code.trim().split(".").length;
    if (node.level !== codeDepth) {
      issues.push({
        code: "eap_level_code_mismatch",
        severity: "error",
        message: `O nó ${node.code} declara nível ${node.level}, mas o código representa ${codeDepth} nível(is).`,
        entityRef: String(node.id),
      });
    }

    if (node.parentId !== null) {
      const parent = nodes.find(candidate => candidate.id === node.parentId);
      if (!node.decompositionBasis || !allowedBases.has(node.decompositionBasis as EapDecompositionBasis)) {
        issues.push({
          code: "eap_decomposition_basis_missing",
          severity: "warning",
          message: `O nó ${node.code} não informa uma base de decomposição válida. Registre se a divisão é por sistema, disciplina, localização, fase, componente ou outro critério explícito.`,
          entityRef: String(node.id),
        });
      }
      if (parent?.nodeType === "entrega") {
        issues.push({
          code: "eap_child_of_delivery",
          severity: "error",
          message: `O nó ${node.code} está abaixo da entrega ${parent.code}; uma entrega é terminal na EAP.`,
          entityRef: String(node.id),
        });
      }
    }

    if (!isLeaf && node.nodeType === "entrega") {
      issues.push({
        code: "eap_delivery_has_children",
        severity: "error",
        message: `Entrega ${node.code} (${node.name}) não pode possuir filhos.`,
        entityRef: String(node.id),
      });
    }

    if (!isLeaf && node.nodeType === "pacote") {
      issues.push({
        code: "eap_work_package_has_children",
        severity: "error",
        message: `Pacote de trabalho ${node.code} (${node.name}) possui filhos. Um pacote de trabalho deve ser terminal para manter controle claro do escopo.`,
        entityRef: String(node.id),
      });
    }

    if (isLeaf && node.nodeType === "grupo") {
      issues.push({
        code: "eap_group_without_decomposition",
        severity: "warning",
        message: `Grupo ${node.code} (${node.name}) termina a EAP sem decomposição. Confirme se ele deveria ser um pacote de trabalho ou uma entrega terminal.`,
        entityRef: String(node.id),
      });
    }

    if (isLeaf) {
      const missing: string[] = [];
      // Unidade e quantidade pertencem ao levantamento quantitativo.
      // A validação estrutural da EAP não deve exigir dado de medição
      // antes de o escopo ser aprovado.
      if (options.requireDictionaryForLeaves) {
        if (!node.description?.trim()) missing.push("descrição/escopo");
        if (!node.inclusions?.trim()) missing.push("inclusões");
        if (!node.exclusions?.trim()) missing.push("exclusões");
        if (!node.responsible?.trim()) missing.push("responsável");
        if (!node.acceptanceCriteria?.trim()) missing.push("critério de aceitação");
      }
      if (missing.length) {
        issues.push({
          code: "eap_leaf_not_ready",
          severity: "warning",
          message: `Folha ${node.code} (${node.name}) ainda não está pronta para virar pacote de trabalho: falta(m) ${missing.join(", ")}.`,
          entityRef: String(node.id),
        });
      }
    }

    const siblingNames = childNodes.map(child => normalized(child.name));
    const duplicates = siblingNames.filter((name, index) => name && siblingNames.indexOf(name) !== index);
    if (duplicates.length) {
      issues.push({
        code: "possible_scope_overlap",
        severity: "error",
        message: `Há nomes de escopo duplicados entre irmãos de ${node.code}; isso pode representar sobreposição e quebra da exclusividade do escopo.`,
        entityRef: String(node.id),
      });
    }

    if (childNodes.length > 0) {
      const childBases = childNodes
        .map(child => child.decompositionBasis)
        .filter((basis): basis is string => Boolean(basis));
      const uniqueBases = [...new Set(childBases)];

      if (uniqueBases.length > 1) {
        issues.push({
          code: "eap_mixed_decomposition_basis",
          severity: "warning",
          message: `Os filhos de ${node.code} usam bases de decomposição diferentes (${uniqueBases.join(", ")}). Misturar critérios no mesmo nível dificulta provar a cobertura de 100% e a exclusividade do escopo.`,
          entityRef: String(node.id),
        });
      }

      const childScopeClauses = childNodes.map(child => clauses(scopeText(child)));
      const parentExclusions = clauses(node.exclusions);

      for (let i = 0; i < childNodes.length; i += 1) {
        for (let j = i + 1; j < childNodes.length; j += 1) {
          if (overlaps(childScopeClauses[i]!, childScopeClauses[j]!)) {
            issues.push({
              code: "eap_scope_overlap_evidence",
              severity: "error",
              message: `Há evidência textual de sobreposição entre os irmãos ${childNodes[i]!.code} e ${childNodes[j]!.code} de ${node.code}. Revise inclusões e exclua responsabilidades duplicadas.`,
              entityRef: String(node.id),
            });
          }
        }
      }

      for (let i = 0; i < childNodes.length; i += 1) {
        if (parentExclusions.length && overlaps(parentExclusions, childScopeClauses[i]!)) {
          issues.push({
            code: "eap_child_outside_parent_scope",
            severity: "error",
            message: `O filho ${childNodes[i]!.code} contém escopo textual que coincide com uma exclusão do pai ${node.code}. Isso indica trabalho fora do escopo aprovado do pai.`,
            entityRef: String(childNodes[i]!.id),
          });
        }
      }

      if (!scopeText(node).trim()) {
        issues.push({
          code: "eap_scope_coverage_not_evidenced",
          severity: "warning",
          message: `O pai ${node.code} não possui descrição ou inclusões suficientes para registrar como os filhos cobrem 100% do seu escopo. A regra dos 100% não pode ser comprovada apenas pela hierarquia.`,
          entityRef: String(node.id),
        });
      }

      if (childNodes.some(child => !scopeText(child).trim())) {
        issues.push({
          code: "eap_child_scope_not_evidenced",
          severity: "warning",
          message: `Um ou mais filhos de ${node.code} não possuem descrição/inclusões. A cobertura de 100% e a exclusividade do nível ainda dependem de julgamento de escopo.`,
          entityRef: String(node.id),
        });
      }
    }

    if (
      node.unit &&
      node.plannedQuantity !== null &&
      node.plannedQuantity !== undefined &&
      Number(node.plannedQuantity) < 0
    ) {
      issues.push({
        code: "negative_eap_quantity",
        severity: "error",
        message: `Quantidade negativa no nó ${node.code}.`,
        entityRef: String(node.id),
      });
    }

    if (childNodes.length) {
      const sameUnitChildren = childNodes.filter(
        child => child.unit && node.unit && child.unit === node.unit
      );
      if (
        node.plannedQuantity !== null &&
        node.plannedQuantity !== undefined &&
        sameUnitChildren.length === childNodes.length &&
        sameUnitChildren.length > 0
      ) {
        const childTotal = sameUnitChildren.reduce(
          (sum, child) => sum + Number(child.plannedQuantity ?? 0),
          0
        );
        const parentQuantity = Number(node.plannedQuantity);
        if (Math.abs(parentQuantity - childTotal) > Math.max(0.001, parentQuantity * 0.001)) {
          issues.push({
            code: "eap_quantity_rollup_mismatch",
            severity: "warning",
            message: `O quantitativo de ${node.code} (${parentQuantity}) não fecha com a soma dos filhos (${childTotal}) na unidade ${node.unit}. Confirme o critério de medição antes de aprovar a EAP.`,
            entityRef: String(node.id),
          });
        }
      }
    }
  }

  return {
    valid: !issues.some(issue => issue.severity === "error"),
    issues,
  };
}

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
    const codeDepth = node.code.trim().split(".").length;
    if (node.level !== codeDepth) {
      issues.push({
        code: "eap_level_code_mismatch",
        severity: "error",
        message: `O nó ${node.code} declara nível ${node.level}, mas o código representa ${codeDepth} nível(is).`,
        entityRef: String(node.id),
      });
    }
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
    if (parent?.nodeType === "entrega") {
      issues.push({
        code: "eap_child_of_delivery",
        severity: "error",
        message: `O nó ${code} está abaixo da entrega ${parent.code}; uma entrega é terminal na EAP.`,
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
