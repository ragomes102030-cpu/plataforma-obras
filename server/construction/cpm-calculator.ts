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
};

export function calculateDeterministicCpm(
  activities: ScheduleEvidenceActivity[],
  dependencies: ScheduleEvidenceDependency[]
): DeterministicCpmResult {
  const validation = validateDependencies(activities, dependencies);
  if (!validation.valid) {
    return { valid: false, schedule: null, issues: validation.issues };
  }

  try {
    const schedule = calculateCpm(
      activities.map(activity => ({
        id: String(activity.id),
        duration: activity.durationDays,
      })),
      dependencies.map(dependency => ({
        predecessorId: String(dependency.predecessorId),
        successorId: String(dependency.successorId),
        type: dependency.type,
        lag: dependency.lag,
      }))
    );
    return { valid: true, schedule, issues: [] };
  } catch (error) {
    return {
      valid: false,
      schedule: null,
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
