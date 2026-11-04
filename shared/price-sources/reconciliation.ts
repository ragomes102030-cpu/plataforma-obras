import { findCandidates, type ComparableRecord, type MatchCandidate, type MatchOptions } from "./matching";

export type ReconciliationStatus = "candidato" | "unidade_incompativel" | "sem_candidato";

export interface ReconciliationCandidate extends MatchCandidate {
  variation: number | null;
  unitCompatible: boolean;
  reason: string;
}

export interface ReconciliationInput {
  code?: string | null;
  description: string;
  unit?: string | null;
  manualPrice?: number | null;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  candidates: ReconciliationCandidate[];
}

function normalizeUnit(unit: string | null | undefined): string {
  return String(unit ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("²", "2")
    .replaceAll("³", "3")
    .replace(/\s+/g, "");
}

export function unitsCompatible(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeUnit(left);
  const b = normalizeUnit(right);
  return Boolean(a && b && a === b);
}

function relativeVariation(manualPrice: number | null | undefined, suggestedPrice: number): number | null {
  if (manualPrice == null || !Number.isFinite(manualPrice) || manualPrice <= 0) return null;
  return Math.abs(suggestedPrice - manualPrice) / manualPrice;
}

export function reconcilePriceItem(
  input: ReconciliationInput,
  records: ComparableRecord[],
  options: MatchOptions = {},
): ReconciliationResult {
  const query = input.code?.trim() || input.description;
  const raw = findCandidates(query, records, options);
  const candidates = raw.map(candidate => {
    const unitCompatible = unitsCompatible(input.unit, candidate.unit);
    const variation = relativeVariation(input.manualPrice, candidate.unitPrice);
    return {
      ...candidate,
      variation,
      unitCompatible,
      reason: unitCompatible
        ? "Candidato compatível; aceitação exige revisão do engenheiro."
        : "Unidade incompatível; o sistema não fará conversão automática.",
    };
  });
  const valid = candidates.filter(candidate => candidate.unitCompatible);
  if (valid.length > 0) return { status: "candidato", candidates };
  if (candidates.length > 0) return { status: "unidade_incompativel", candidates };
  return { status: "sem_candidato", candidates: [] };
}
