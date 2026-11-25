/** QA examples remain visible in history but never count as measured actuals. */
export function isClearlyQaExampleNote(notes: string | null | undefined): boolean {
  const normalized = (notes ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  return /\b(?:premissa|simulacao)\s+qa\b/.test(normalized) || /\bdado\s+sintetico\b/.test(normalized);
}

/** Draft production entries are not measured actuals until confirmed. */
export function selectConfirmedProductionEntries<TEntry extends { status: string; unidadeCompativel?: boolean; exemplo?: number | null }>(
  entries: TEntry[],
): TEntry[] {
  return entries.filter(entry => entry.status === "confirmada" && entry.exemplo !== 1 && entry.unidadeCompativel !== false);
}
