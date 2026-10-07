export type EvidenceLevel =
  | "not_informed"
  | "estimate"
  | "engineer_informed"
  | "source_supported"
  | "validated";

export type PlanningEvidenceInput = {
  plannedQuantity?: number | null;
  productivity?: number | null;
  durationDays: number;
  budgetItemId?: number | null;
  source?: string | null;
  engineerValidated?: boolean;
};

export type PlanningEvidence = {
  level: EvidenceLevel;
  gaps: string[];
  basis: string[];
};

export function derivePlanningEvidence(
  input: PlanningEvidenceInput
): PlanningEvidence {
  const gaps: string[] = [];
  const basis: string[] = [];

  if (input.plannedQuantity != null && input.plannedQuantity > 0) {
    basis.push("quantidade planejada");
  } else {
    gaps.push("quantidade");
  }

  if (input.productivity != null && input.productivity > 0) {
    basis.push("produtividade");
  } else {
    gaps.push("produtividade");
  }

  if (input.durationDays < 1) {
    gaps.push("duração válida");
  } else {
    basis.push("duração");
  }

  if (input.budgetItemId != null) basis.push("vínculo orçamentário");
  if (input.source?.trim()) basis.push("fonte informada");

  let level: EvidenceLevel = "estimate";

  if (input.engineerValidated) {
    level = "validated";
  } else if (
    input.source?.trim() &&
    basis.includes("quantidade planejada") &&
    basis.includes("produtividade")
  ) {
    level = "source_supported";
  } else if (
    basis.includes("quantidade planejada") &&
    basis.includes("produtividade")
  ) {
    level = "engineer_informed";
  } else if (basis.length === 1 && basis[0] === "duração") {
    level = "estimate";
  }

  return { level, gaps, basis };
}
