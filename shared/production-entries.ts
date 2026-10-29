/** Draft production entries are not measured actuals until confirmed. */
export function selectConfirmedProductionEntries<TEntry extends { status: string }>(
  entries: TEntry[],
): TEntry[] {
  return entries.filter(entry => entry.status === "confirmada");
}
