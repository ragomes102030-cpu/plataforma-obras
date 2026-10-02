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

export type EapDictionaryField =
  | "description"
  | "inclusions"
  | "exclusions"
  | "acceptanceCriteria"
  | "responsible"
  | "location"
  | "unit"
  | "plannedQuantity"
  | "scopeStatus"
  | "decompositionBasis";

export type EapScopeValidationOptions = {
  requireDictionaryForLeaves?: boolean;
  requiredDictionaryFields?: EapDictionaryField[];
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
        const requiredFields = options.requiredDictionaryFields?.length
          ? options.requiredDictionaryFields
          : [
              "description",
              "inclusions",
              "exclusions",
              "responsible",
              "acceptanceCriteria",
            ] as EapDictionaryField[];
        const labels: Record<EapDictionaryField, string> = {
          description: "descrição/escopo",
          inclusions: "inclusões",
          exclusions: "exclusões",
          acceptanceCriteria: "critério de aceitação",
          responsible: "responsável",
          location: "localização",
          unit: "unidade",
          plannedQuantity: "quantidade planejada",
          scopeStatus: "status do escopo",
          decompositionBasis: "base de decomposição",
        };
        for (const field of requiredFields) {
          const value = (node as unknown as Record<string, unknown>)[field];
          if (value === null || value === undefined || String(value).trim() === "") {
            missing.push(labels[field]);
          }
        }
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
              // Evidência textual pede julgamento de escopo, mas não prova
              // sozinha uma quebra estrutural da EAP. Conflitos determinísticos
              // continuam sendo os responsáveis por bloquear a aprovação.
              severity: "warning",
              message: `Há evidência textual de possível sobreposição entre os irmãos ${childNodes[i]!.code} e ${childNodes[j]!.code} de ${node.code}. Revise inclusões e exclusões para tornar as fronteiras de escopo mutuamente exclusivas.`,
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


import type { ArquimedesEapProposal } from "../agent/core/types";

export type EapProposalValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  entityRef?: string;
};

function normalizeProposalName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Valida a proposta contra a EAP real e calcula os códigos de criação
 * exclusivamente no servidor. O Arquimedes informa o pai e o escopo; o
 * sistema mantém a autoridade sobre a numeração e a hierarquia aplicável.
 */
export function validateAndNormalizeEapProposal(
  currentNodes: EapScopeNode[],
  proposal: ArquimedesEapProposal
): ArquimedesEapProposal {
  const issues: EapProposalValidationIssue[] = [];
  const byId = new Map<string, EapScopeNode>();
  const byCode = new Map<string, EapScopeNode>();
  const currentChildrenByParent = new Map<string, EapScopeNode[]>();

  for (const node of currentNodes) {
    byId.set(String(node.id), node);
    byCode.set(node.code.trim(), node);
  }

  const roots = currentNodes.filter(node => node.parentId === null);
  const workingNodes = new Map(byCode);
  const usedCodes = new Set(byCode.keys());

  const nextSiblingCode = (parentCode: string | null): string => {
    const prefix = parentCode ? parentCode + "." : "";
    let max = 0;
    for (const code of workingNodes.keys()) {
      if (!code.startsWith(prefix)) continue;
      const suffix = code.slice(prefix.length);
      if (!/^\d+$/.test(suffix)) continue;
      max = Math.max(max, Number(suffix));
    }
    return prefix + String(max + 1);
  };

  const normalizedNodes: ArquimedesEapProposal["nodes"] = [];
  const seenNodeIds = new Set<number>();
  const newlyCreatedCodes = new Set<string>();

  for (let index = 0; index < proposal.nodes.length; index += 1) {
    const item = proposal.nodes[index];
    const ref = item.nodeId ? String(item.nodeId) : "proposal:" + String(index + 1);

    if (item.operation === "create") {
      if (roots.length > 0 && item.parentCode === null) {
        issues.push({
          code: "proposal_second_root",
          severity: "error",
          message:
            'A criação "' + item.name +
            '" tenta criar uma nova raiz, mas a EAP atual já possui uma raiz. ' +
            "O Arquimedes deve propor esse trabalho dentro da raiz existente.",
          entityRef: ref,
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      const parent = item.parentCode ? workingNodes.get(item.parentCode) : undefined;
      if (item.parentCode && !parent) {
        issues.push({
          code: "proposal_parent_not_found",
          severity: "error",
          message:
            "O pai " + item.parentCode + ' informado para "' + item.name +
            '" não existe na EAP atual nem entre os nós criados anteriormente na proposta.',
          entityRef: ref,
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      if (parent?.nodeType === "entrega") {
        issues.push({
          code: "proposal_child_of_delivery",
          severity: "error",
          message:
            'A proposta tenta criar "' + item.name + '" abaixo da entrega ' +
            parent.code + ". Entrega é terminal.",
          entityRef: ref,
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      const code = nextSiblingCode(item.parentCode);
      if (item.code && item.code !== code) {
        issues.push({
          code: "proposal_code_reassigned",
          severity: "warning",
          message:
            "O código " + item.code + " sugerido pelo Arquimedes foi desconsiderado. " +
            "O sistema atribuiu " + code + " de forma determinística.",
          entityRef: ref,
        });
      }

      if (usedCodes.has(code) || newlyCreatedCodes.has(code)) {
        issues.push({
          code: "proposal_code_collision",
          severity: "error",
          message:
            "O código calculado " + code +
            " já está ocupado na proposta/EAP. A proposta foi bloqueada para evitar colisão.",
          entityRef: ref,
        });
        normalizedNodes.push({ ...item, code });
        continue;
      }

      const normalized = {
        ...item,
        code,
        parentCode: item.parentCode,
      };
      normalizedNodes.push(normalized);
      newlyCreatedCodes.add(code);
      workingNodes.set(code, {
        id: -(index + 1),
        projectId: currentNodes[0]?.projectId ?? 0,
        parentId: parent?.id ?? null,
        code,
        name: item.name,
        level: code.split(".").length,
        nodeType: item.nodeType,
        unit: item.unit ?? null,
        plannedQuantity: item.plannedQuantity ?? null,
        externalId: null,
        externalUid: null,
        sortOrder: currentNodes.length + index,
      });
      continue;
    }

    if (item.operation === "update") {
      const resolvedNodeId =
        item.nodeId ??
        (item.code ? byCode.get(item.code.trim())?.id : undefined);

      if (!resolvedNodeId) {
        issues.push({
          code: "proposal_update_without_node",
          severity: "error",
          message:
            'A atualização "' +
            item.name +
            '" não informa nodeId nem referencia um código EAP existente para resolução segura.',
          entityRef: ref,
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      if (seenNodeIds.has(resolvedNodeId)) {
        issues.push({
          code: "proposal_duplicate_node_operation",
          severity: "error",
          message: "O nó " + item.nodeId + " aparece mais de uma vez na proposta.",
          entityRef: String(resolvedNodeId),
        });
        normalizedNodes.push({ ...item });
        continue;
      }
      seenNodeIds.add(resolvedNodeId);

      const current = byId.get(String(resolvedNodeId));
      if (!current) {
        issues.push({
          code: "proposal_node_not_found",
          severity: "error",
          message:
            "A proposta tenta atualizar o nó " + item.nodeId +
            ", mas ele não existe na EAP atual.",
          entityRef: String(item.nodeId),
        });
        normalizedNodes.push({ ...item });
        continue;
      }

      const currentParentCode =
        current.parentId === null
          ? null
          : currentNodes.find(candidate => candidate.id === current.parentId)?.code ?? null;

      if (item.parentCode !== currentParentCode) {
        issues.push({
          code: "proposal_update_parent_mismatch",
          severity: "error",
          message:
            "A atualização de " + current.code +
            " informa um pai diferente do pai atual. Mudança de hierarquia deve ser tratada manualmente na EAP.",
          entityRef: String(item.nodeId),
        });
      }

      if (item.code && item.code !== current.code) {
        issues.push({
          code: "proposal_update_code_change",
          severity: "warning",
          message:
            "O código " + item.code + " não foi aceito para " + current.code +
            "; a numeração da EAP é controlada pelo sistema.",
          entityRef: String(item.nodeId),
        });
      }

      normalizedNodes.push({
        ...item,
        nodeId: resolvedNodeId,
        code: current.code,
        parentCode: currentParentCode,
      });
      continue;
    }

    issues.push({
      code: "proposal_manual_hierarchy_change",
      severity: "error",
      message:
        'A operação "' + item.operation +
        '" não é aplicada automaticamente. Movimentações e exclusões devem ser feitas manualmente pelo engenheiro na EAP.',
      entityRef: ref,
    });
    normalizedNodes.push({ ...item });
  }

  const siblingNames = new Map<string, Set<string>>();
  for (const item of normalizedNodes.filter(node =>
    node.operation === "create" || node.operation === "update"
  )) {
    const current =
      item.operation === "update" && item.nodeId
        ? byId.get(String(item.nodeId))
        : null;
    const parentCode =
      item.parentCode ??
      (current?.parentId == null
        ? null
        : currentNodes.find(candidate => candidate.id === current.parentId)?.code ?? null);
    const key = parentCode ?? "__ROOT__";
    const names = siblingNames.get(key) ?? new Set<string>();
    const normalizedName = normalizeProposalName(item.name);
    if (normalizedName && names.has(normalizedName)) {
      issues.push({
        code: "proposal_duplicate_sibling_name",
        severity: "error",
        message:
          'A proposta repete o escopo "' + item.name +
          '" no mesmo pai (' + (key === "__ROOT__" ? "raiz" : key) + ").",
        entityRef: item.nodeId ? String(item.nodeId) : item.code,
      });
    } else if (normalizedName) {
      names.add(normalizedName);
      siblingNames.set(key, names);
    }
  }

  const structuralNodes = currentNodes.map(node => ({
    id: Number(node.id),
    projectId: node.projectId,
    externalId: node.externalId ?? null,
    externalUid: node.externalUid ?? null,
    parentId: node.parentId == null ? null : Number(node.parentId),
    code: node.code,
    name: node.name,
    level: node.level,
    nodeType: node.nodeType,
    unit: node.unit ?? null,
    plannedQuantity: node.plannedQuantity ?? null,
    sortOrder: node.sortOrder,
  }));

  const tempIdByCode = new Map<string, number>();
  for (const item of normalizedNodes.filter(node =>
    node.operation === "create" && node.code
  )) {
    const id = -(tempIdByCode.size + 1);
    tempIdByCode.set(item.code!, id);
    const parentId =
      item.parentCode === null
        ? null
        : structuralNodes.find(node => node.code === item.parentCode)?.id ??
          tempIdByCode.get(item.parentCode!) ??
          null;
    structuralNodes.push({
      id,
      projectId: currentNodes[0]?.projectId ?? 0,
      externalId: null,
      externalUid: null,
      parentId,
      code: item.code!,
      name: item.name,
      level: item.code!.split(".").length,
      nodeType: item.nodeType,
      unit: item.unit ?? null,
      plannedQuantity: item.plannedQuantity ?? null,
      sortOrder: currentNodes.length + structuralNodes.length,
    });
  }

  for (const item of normalizedNodes.filter(node => node.operation === "update")) {
    if (!item.nodeId) continue;
    const target = structuralNodes.find(node => node.id === item.nodeId);
    if (!target) continue;
    target.name = item.name;
    target.nodeType = item.nodeType;
    target.level = target.code.split(".").length;
  }

  const structural = validateEap(structuralNodes);
  for (const issue of structural.issues) {
    issues.push({
      code: "proposal_result_" + issue.code,
      severity: issue.severity,
      message: issue.message,
      entityRef: issue.entityRef,
    });
  }

  const dedupedIssues = Array.from(
    new Map(
      issues.map(issue => [
        issue.code + ":" + issue.entityRef + ":" + issue.message,
        issue,
      ])
    ).values()
  ).slice(0, 80);

  return {
    ...proposal,
    nodes: normalizedNodes,
    validation: {
      valid: !dedupedIssues.some(issue => issue.severity === "error"),
      issues: dedupedIssues,
    },
  };
}

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
