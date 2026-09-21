import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";
import type { ValidationIssue } from "./eap-validator";

export type DependencyValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export function validateDependencies(
  activities: ScheduleEvidenceActivity[],
  dependencies: ScheduleEvidenceDependency[]
): DependencyValidationResult {
  const issues: ValidationIssue[] = [];
  const byId = new Map(
    activities.map(activity => [String(activity.id), activity])
  );
  const edges = new Map<string, string[]>();
  const incoming = new Map<string, number>();

  for (const activity of activities) incoming.set(String(activity.id), 0);

  for (const dependency of dependencies) {
    const predecessorId = String(dependency.predecessorId);
    const successorId = String(dependency.successorId);
    const entityRef = `${predecessorId}→${successorId}`;
    const predecessor = byId.get(predecessorId);
    const successor = byId.get(successorId);

    if (!predecessor || !successor) {
      issues.push({
        code: "missing_dependency_activity",
        severity: "error",
        message: `Dependência aponta para atividade inexistente: ${entityRef}.`,
        entityRef,
      });
      continue;
    }
    if (predecessor.projectId !== successor.projectId) {
      issues.push({
        code: "cross_project_dependency",
        severity: "error",
        message: `Dependência cruza projetos: ${entityRef}.`,
        entityRef,
      });
    }
    if (
      dependency.projectId !== predecessor.projectId ||
      dependency.projectId !== successor.projectId
    ) {
      issues.push({
        code: "dependency_project_mismatch",
        severity: "error",
        message: `Dependência ${entityRef} não pertence ao mesmo projeto das atividades.`,
        entityRef,
      });
    }
    if (predecessorId === successorId) {
      issues.push({
        code: "self_dependency",
        severity: "error",
        message: `Atividade depende de si mesma: ${predecessorId}.`,
        entityRef: predecessorId,
      });
      continue;
    }
    if (!Number.isInteger(dependency.lag)) {
      issues.push({
        code: "invalid_dependency_lag",
        severity: "error",
        message: `Lag da dependência ${entityRef} deve ser inteiro.`,
        entityRef,
      });
    }
    edges.set(predecessorId, [
      ...(edges.get(predecessorId) ?? []),
      successorId,
    ]);
    incoming.set(successorId, (incoming.get(successorId) ?? 0) + 1);
  }

  const queue = Array.from(incoming.entries())
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort();
  let visited = 0;
  while (queue.length) {
    const current = queue.shift()!;
    visited += 1;
    for (const successor of edges.get(current) ?? []) {
      const count = (incoming.get(successor) ?? 0) - 1;
      incoming.set(successor, count);
      if (count === 0) queue.push(successor);
    }
    queue.sort();
  }
  if (visited < activities.length) {
    issues.push({
      code: "dependency_cycle",
      severity: "error",
      message: "A rede de dependências possui ciclo.",
    });
  }

  return { valid: !issues.some(issue => issue.severity === "error"), issues };
}
