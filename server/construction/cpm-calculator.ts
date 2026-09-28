import { calculateCpm, type ScheduleResult } from "../../shared/cpm";
import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";
import { validateDependencies } from "./dependency-validator";
import type { ValidationIssue } from "./eap-validator";

export type DeterministicCpmResult = {
  valid: boolean;
  schedule: ScheduleResult | null;
  issues: ValidationIssue[];
  /** Verdadeiro quando alguma atividade ficou com folga total negativa. */
  infeasible: boolean;
};

export function calculateDeterministicCpm(
  activities: ScheduleEvidenceActivity[],
  dependencies: ScheduleEvidenceDependency[]
): DeterministicCpmResult {
  const validation = validateDependencies(activities, dependencies);
  if (!validation.valid) {
    return { valid: false, schedule: null, issues: validation.issues, infeasible: false };
  }

  try {
    const schedule = calculateCpm(
      activities.map(activity => ({
        id: String(activity.id),
        duration: activity.durationDays,
        mustStartOn: activity.mustStartOnDay ?? undefined,
        finishNoLaterThan: activity.finishNoLaterThanDay ?? undefined,
      })),
      dependencies.map(dependency => ({
        predecessorId: String(dependency.predecessorId),
        successorId: String(dependency.successorId),
        type: dependency.type,
        lag: dependency.lag,
      }))
    );
    const infeasible = schedule.activities.filter(activity => activity.infeasible);
    const issues: ValidationIssue[] = infeasible.map(activity => ({
      code: "cpm_constraint_conflict",
      severity: "warning" as const,
      entityRef: activity.id,
      message: `Folga total negativa (${activity.totalFloat} dias): as restrições desta atividade são incompatíveis com a rede.`,
    }));
    return { valid: true, schedule, issues, infeasible: infeasible.length > 0 };
  } catch (error) {
    return {
      valid: false,
      schedule: null,
      infeasible: false,
      issues: [
        {
          code: "cpm_calculation_failed",
          severity: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
