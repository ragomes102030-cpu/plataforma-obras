import { describe, expect, it } from "vitest";
import { validateDependencies } from "./dependency-validator";
import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";

function activity(id: string, projectId = 1): ScheduleEvidenceActivity {
  return {
    id,
    projectId,
    externalId: id,
    eapRef: "1.1",
    wbsCode: "1.1",
    name: id,
    phase: "Execução",
    startOffset: 0,
    durationDays: 1,
    progress: 0,
    status: "Não iniciado",
    critical: 0,
    sortOrder: 1,
  };
}

function dependency(
  predecessorId: string,
  successorId: string
): ScheduleEvidenceDependency {
  return {
    id: `${predecessorId}-${successorId}`,
    projectId: 1,
    externalId: null,
    predecessorId,
    successorId,
    type: "FS",
    lag: 0,
  };
}

describe("validateDependencies", () => {
  it("aceita uma rede linear", () => {
    const result = validateDependencies(
      [activity("A"), activity("B"), activity("C")],
      [dependency("A", "B"), dependency("B", "C")]
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejeita atividade inexistente e auto dependência", () => {
    const result = validateDependencies(
      [activity("A")],
      [dependency("A", "A"), dependency("A", "B")]
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code).sort()).toEqual(
      ["missing_dependency_activity", "self_dependency"].sort()
    );
  });

  it("rejeita ciclo e dependência cruzando projetos", () => {
    const result = validateDependencies(
      [activity("A", 1), activity("B", 1), activity("C", 2)],
      [dependency("A", "B"), dependency("B", "A"), dependency("A", "C")]
    );
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code).sort()).toEqual(
      [
        "cross_project_dependency",
        "dependency_project_mismatch",
        "dependency_cycle",
      ].sort()
    );
  });
});
