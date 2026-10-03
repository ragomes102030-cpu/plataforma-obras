import type { EapScopeNode, EapValidationResult, EapDictionaryField } from "./eap-validator";
import { validateEap, validateEapScope } from "./eap-validator";

export type EapBaselineValidationResult = EapValidationResult & {
  readyForBaseline: boolean;
};

/**
 * Validação de aprovação/baseline.
 *
 * A validação estrutural aceita rascunhos. Esta camada é deliberadamente mais
 * rígida: uma EAP só pode virar baseline quando a estrutura, o dicionário e
 * as fronteiras de escopo estão suficientemente definidos.
 */
export function validateEapForBaseline(
  nodes: EapScopeNode[],
  options: {
    requiredDictionaryFields?: EapDictionaryField[];
    allowWarnings?: boolean;
  } = {}
): EapBaselineValidationResult {
  const structural = validateEap(
    nodes.map(node => ({
      id: Number(node.id),
      projectId: Number(node.projectId),
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
    }))
  );

  const scope = validateEapScope(nodes, {
    requireDictionaryForLeaves: true,
    requiredDictionaryFields: options.requiredDictionaryFields ?? [
      "description",
      "inclusions",
      "exclusions",
      "responsible",
      "acceptanceCriteria",
      "decompositionBasis",
    ],
  });

  const issues = [...structural.issues, ...scope.issues];

  // Na baseline, alertas que deixam a cobertura/exclusividade indeterminadas
  // também bloqueiam. O chamador pode explicitamente permitir warnings apenas
  // para cenários de revisão controlada.
  const blocking = issues.filter(issue =>
    issue.severity === "error" ||
    (!options.allowWarnings && (
      issue.code === "eap_leaf_not_ready" ||
      issue.code === "eap_scope_coverage_not_evidenced" ||
      issue.code === "eap_child_scope_not_evidenced" ||
      issue.code === "eap_scope_overlap_evidence" ||
      issue.code === "eap_mixed_decomposition_basis" ||
      issue.code === "eap_group_without_decomposition"
    ))
  );

  return {
    valid: blocking.length === 0,
    readyForBaseline: blocking.length === 0,
    issues,
  };
}
