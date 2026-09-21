export type RelationType = "FS" | "SS" | "FF" | "SF";

export type Dependency = {
  predecessorId: string;
  successorId: string;
  type: RelationType;
  lag?: number;
};

export type CpmActivity = {
  id: string;
  duration: number;
};

export type CpmResult = CpmActivity & {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  critical: boolean;
};

export type ScheduleResult = {
  activities: CpmResult[];
  projectDuration: number;
  criticalPath: string[];
};

/**
 * Calcula CPM em dias relativos. A função não consulta relógio, banco ou rede.
 * A mesma lista canônica de atividades e dependências produz a mesma saída.
 */
export function calculateCpm(
  activities: CpmActivity[],
  dependencies: Dependency[]
): ScheduleResult {
  const byId = new Map(activities.map(activity => [activity.id, activity]));
  if (byId.size !== activities.length)
    throw new Error("IDs de atividade duplicados");
  for (const activity of activities) {
    if (!Number.isInteger(activity.duration) || activity.duration < 0) {
      throw new Error(`Duração inválida para ${activity.id}`);
    }
  }
  for (const dependency of dependencies) {
    if (
      !byId.has(dependency.predecessorId) ||
      !byId.has(dependency.successorId)
    ) {
      throw new Error(
        `Dependência aponta para atividade inexistente: ${dependency.predecessorId} → ${dependency.successorId}`
      );
    }
    if (dependency.predecessorId === dependency.successorId)
      throw new Error(`Ciclo na atividade ${dependency.predecessorId}`);
    if (!Number.isInteger(dependency.lag ?? 0))
      throw new Error("Lag deve ser inteiro em dias");
  }

  const outgoing = new Map<string, Dependency[]>();
  const incomingCount = new Map(activities.map(activity => [activity.id, 0]));
  for (const dependency of dependencies) {
    outgoing.set(dependency.predecessorId, [
      ...(outgoing.get(dependency.predecessorId) ?? []),
      dependency,
    ]);
    incomingCount.set(
      dependency.successorId,
      (incomingCount.get(dependency.successorId) ?? 0) + 1
    );
  }

  const queue = activities
    .filter(activity => incomingCount.get(activity.id) === 0)
    .map(activity => activity.id)
    .sort();
  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    order.push(current);
    for (const dependency of outgoing.get(current) ?? []) {
      const remaining = (incomingCount.get(dependency.successorId) ?? 0) - 1;
      incomingCount.set(dependency.successorId, remaining);
      if (remaining === 0) queue.push(dependency.successorId);
    }
    queue.sort();
  }
  if (order.length !== activities.length)
    throw new Error("A rede possui ciclo");

  const early = new Map<string, { start: number; finish: number }>();
  for (const id of order) {
    const activity = byId.get(id)!;
    let start = 0;
    for (const dependency of dependencies.filter(
      item => item.successorId === id
    )) {
      const predecessor = early.get(dependency.predecessorId)!;
      const lag = dependency.lag ?? 0;
      const candidate =
        dependency.type === "FS"
          ? predecessor.finish + lag
          : dependency.type === "SS"
            ? predecessor.start + lag
            : dependency.type === "FF"
              ? predecessor.finish + lag - activity.duration
              : predecessor.start + lag - activity.duration;
      start = Math.max(start, candidate);
    }
    early.set(id, { start, finish: start + activity.duration });
  }

  const projectDuration = Math.max(
    0,
    ...Array.from(early.values()).map(value => value.finish)
  );
  const late = new Map<string, { start: number; finish: number }>();
  for (const id of [...order].reverse()) {
    const activity = byId.get(id)!;
    const successors = outgoing.get(id) ?? [];
    let finish = projectDuration;
    for (const dependency of successors) {
      const successor = late.get(dependency.successorId)!;
      const lag = dependency.lag ?? 0;
      const candidate =
        dependency.type === "FS"
          ? successor.start - lag
          : dependency.type === "SS"
            ? successor.start - lag + activity.duration
            : dependency.type === "FF"
              ? successor.finish - lag
              : successor.finish - lag + activity.duration;
      finish = Math.min(finish, candidate);
    }
    late.set(id, { start: finish - activity.duration, finish });
  }

  const results = activities.map(activity => {
    const earlyValue = early.get(activity.id)!;
    const lateValue = late.get(activity.id)!;
    const totalFloat = lateValue.start - earlyValue.start;
    return {
      ...activity,
      earlyStart: earlyValue.start,
      earlyFinish: earlyValue.finish,
      lateStart: lateValue.start,
      lateFinish: lateValue.finish,
      totalFloat,
      critical: totalFloat <= 0,
    };
  });
  return {
    activities: results,
    projectDuration,
    criticalPath: results
      .filter(activity => activity.critical)
      .sort((a, b) => a.earlyStart - b.earlyStart || a.id.localeCompare(b.id))
      .map(activity => activity.id),
  };
}
