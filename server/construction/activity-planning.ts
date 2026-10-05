export type ActivityDurationInput = {
  durationDays?: number;
  plannedQuantity?: number;
  productivity?: number;
};

export function isTerminalEapNode(nodeType: string): boolean {
  return nodeType === "entrega" || nodeType === "pacote";
}

export function resolveActivityDuration(input: ActivityDurationInput): number {
  if (input.durationDays !== undefined) {
    if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
      throw new Error(
        "A atividade precisa de duração positiva ou de quantidade + produtividade."
      );
    }
    return input.durationDays;
  }

  if (
    input.plannedQuantity !== undefined &&
    input.plannedQuantity > 0 &&
    input.productivity !== undefined &&
    input.productivity > 0
  ) {
    return Math.max(1, Math.ceil(input.plannedQuantity / input.productivity));
  }

  throw new Error(
    "A atividade precisa de duração ou de quantidade + produtividade para calcular a duração."
  );
}
