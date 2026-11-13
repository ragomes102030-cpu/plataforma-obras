import type { EapScopeNode, EapValidationResult, EapDictionaryField } from "./eap-validator";
import { validateEap, validateEapScope } from "./eap-validator";

export type EapBaselineValidationResult = EapValidationResult & {
  readyForBaseline: boolean;
};

/** Mantém a explicação da baseline alinhada aos bloqueios reais do validador. */
export function getEapBaselineBlockers(issues: EapValidationResult["issues"]) {
  return issues.filter(issue =>
    issue.severity === "error" || [
      "eap_leaf_not_ready",
      "eap_scope_coverage_not_evidenced",
      "eap_child_scope_not_evidenced",
      "eap_group_without_decomposition",
    ].includes(issue.code)
  );
}

const allowedDictionaryFields = new Set<EapDictionaryField>([
  "description",
  "inclusions",
  "exclusions",
  "acceptanceCriteria",
  "responsible",
  "location",
  "unit",
  "plannedQuantity",
  "scopeStatus",
  "decompositionBasis",
]);

export function normalizeEapDictionaryFields(fields: unknown): EapDictionaryField[] {
  return Array.isArray(fields)
    ? fields.filter(
        (field): field is EapDictionaryField =>
          typeof field === "string" && allowedDictionaryFields.has(field as EapDictionaryField)
      )
    : [];
}

/**
 * Aprovação da EAP valida a estrutura e os campos que o padrão aprovado da
 * própria obra tornou obrigatórios. Critérios de baseline, como cobertura de
 * custo e CPM, pertencem a etapas posteriores.
 */
export function validateEapForApproval(
  nodes: EapScopeNode[],
  configuredRequiredFields: unknown = []
): EapValidationResult {
  const requiredDictionaryFields = normalizeEapDictionaryFields(configuredRequiredFields);
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
    requiredDictionaryFields,
  });
  const issues = [...structural.issues, ...scope.issues];
  const blocking = issues.filter(
    issue => issue.severity === "error" || issue.code === "eap_leaf_not_ready"
  );

  return { valid: blocking.length === 0, issues };
}

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

  // Na baseline, bloqueiam erros estruturais e alertas que deixam a
  // cobertura/exclusividade indeterminadas. `eap_scope_overlap_evidence` é
  // `eap_scope_overlap_evidence` e `eap_child_outside_parent_scope` são apenas
  // coincidências lexicais possíveis (o próprio validador não as trata como
  // prova de conflito); mantê-las como bloqueio tornava impossível
  // congelar EAPs válidas como a Escola, mesmo depois da revisão do engenheiro.
  // O apontamento continua retornado para revisão e auditoria.
  const blocking = options.allowWarnings
    ? issues.filter(issue => issue.severity === "error")
    : getEapBaselineBlockers(issues);

  return {
    valid: blocking.length === 0,
    readyForBaseline: blocking.length === 0,
    issues,
  };
}
