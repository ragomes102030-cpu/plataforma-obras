/**
 * Matching fuzzy por nome (insumos e composições) contra a base de referência.
 * Política: NUNCA autolink — retornar candidatos com score; confirmação é humana.
 */

export interface MatchCandidate {
  kind: "priceItem" | "composition";
  id: number;
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
  /** 0..1 — similaridade normalizada. */
  score: number;
}

export interface ComparableRecord {
  kind: "priceItem" | "composition";
  id: number;
  code: string;
  description: string;
  unit: string;
  unitPrice: number;
}

/** Lowercase sem acentos, só letras/números/descrição normalizada. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de Levenshtein clássica. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        prev[j] + 1,
        current[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    prev = current;
  }
  return prev[b.length];
}

/** Similaridade 0..1 = 1 - distância/max(len). */
export function similarityScore(a: string, b: string): number {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  return 1 - levenshtein(left, right) / maxLen;
}

/** Trigramas (jaccard) — complementa Levenshtein em termos trocados. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (text: string): Set<string> => {
    const padded = ` ${normalizeForMatch(text)} `;
    const set = new Set<string>();
    for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3));
    return set;
  };
  const setA = grams(a);
  const setB = grams(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const gram of setA) if (setB.has(gram)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Score final = melhor de Levenshtein-normalizado e trigram ( ponderado ).
 * Itens com código exato ganham boost.
 */
export function combinedScore(
  query: string,
  candidate: { code: string; description: string }
): number {
  const codeExact =
    normalizeForMatch(query) === normalizeForMatch(candidate.code) ? 0.15 : 0;
  const lev = similarityScore(query, candidate.description);
  const tri = trigramSimilarity(query, candidate.description);
  const codeLev = similarityScore(query, candidate.code);
  const base = Math.max(lev, tri * 0.95, codeLev * 0.9);
  return Math.min(1, base + codeExact);
}

export interface MatchOptions {
  minScore?: number;
  limit?: number;
}

/** Retorna candidatos ordenados por score (desc). Nunca filtra "demais" — UI decide. */
export function findCandidates(
  query: string,
  records: ComparableRecord[],
  options: MatchOptions = {}
): MatchCandidate[] {
  const minScore = options.minScore ?? 0.35;
  const limit = options.limit ?? 5;
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) return [];
  const scored: MatchCandidate[] = records
    .map(record => ({
      ...record,
      score: Math.round(combinedScore(query, record) * 1000) / 1000,
    }))
    .filter(candidate => candidate.score >= minScore);
  scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return scored.slice(0, limit);
}

/**
 * Variação relativa de preço entre manual e sugerido (fração, ex.: 0.42 = 42%).
 * alertaQuando acima do limiar (default vem de ENV.PRICE_VARIATION_THRESHOLD_PCT).
 */
export function priceVariation(
  manualPrice: number,
  suggestedPrice: number
): number {
  if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
    return suggestedPrice > 0 ? 1 : 0;
  }
  return Math.abs(suggestedPrice - manualPrice) / manualPrice;
}

export function exceedsPriceThreshold(
  manualPrice: number,
  suggestedPrice: number,
  thresholdPct: number
): boolean {
  const threshold = Number.isFinite(thresholdPct) && thresholdPct > 0 ? thresholdPct / 100 : 0.3;
  return priceVariation(manualPrice, suggestedPrice) > threshold;
}
