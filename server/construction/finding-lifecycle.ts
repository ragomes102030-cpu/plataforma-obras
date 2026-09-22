export type FindingStatus =
  | "open"
  | "confirmed"
  | "rejected"
  | "resolved"
  | "obsolete";

export type FindingTargetStatus = "open" | "resolved" | "obsolete";

const ALLOWED_SOURCES: Record<FindingTargetStatus, readonly FindingStatus[]> = {
  resolved: ["open", "confirmed"],
  obsolete: ["open", "confirmed", "resolved"],
  open: ["resolved", "obsolete", "rejected"],
};

export function allowedSourcesFor(
  target: FindingTargetStatus
): readonly FindingStatus[] {
  return ALLOWED_SOURCES[target];
}

export function canTransitionFinding(
  from: FindingStatus,
  to: FindingTargetStatus
): boolean {
  return ALLOWED_SOURCES[to].includes(from);
}
