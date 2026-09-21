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
