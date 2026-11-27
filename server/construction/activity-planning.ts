export type ActivityDurationInput = {
  durationDays?: number;
  plannedQuantity?: number;
  productivity?: number;
};

export function isTerminalEapNode(nodeType: string): boolean {
  return nodeType === "entrega" || nodeType === "pacote";
}

/** Mesma precisão de schedule_activities: numeric(14,3). */
export function normalizePlanningDecimal(value: number, allowZero = false): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error("Informe quantidade + produtividade válidas, finitas e positivas.");
  }
  const normalized = Number(value.toFixed(3));
  if (normalized >= 100_000_000_000 || (value > 0 && normalized === 0)) {
    throw new Error("Quantidade ou produtividade fora da precisão permitida (até três casas decimais).");
  }
  return normalized;
}

export function resolveActivityDuration(input: ActivityDurationInput): number {
  const quantity = input.plannedQuantity === undefined ? undefined : normalizePlanningDecimal(input.plannedQuantity, true);
  const productivity = input.productivity === undefined ? undefined : normalizePlanningDecimal(input.productivity);
  if (input.durationDays !== undefined) {
    if (!Number.isInteger(input.durationDays) || input.durationDays <= 0 || input.durationDays > 2147483647) {
      throw new Error(
        "A atividade precisa de duração positiva ou de quantidade + produtividade."
      );
    }
    return input.durationDays;
  }

  if (
    quantity !== undefined && quantity > 0 &&
    productivity !== undefined && productivity > 0
  ) {
    // Inteiros em milésimos evitam o dia extra por imprecisão binária.
    const q = Math.round(quantity * 1000);
    const p = Math.round(productivity * 1000);
    const duration = Math.floor(q / p) + (q % p === 0 ? 0 : 1);
    if (duration > 2147483647) throw new Error("A duração calculada excede o limite suportado.");
    return Math.max(1, duration);
  }

  throw new Error(
    "A atividade precisa de duração ou de quantidade + produtividade para calcular a duração."
  );
}
