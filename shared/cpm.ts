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
  /** Primeiro índice de dia permitido para iniciar, herdado do início planejado. */
  startOffsetDay?: number;
  /** Índice do dia útil (CPM) em que a atividade DEVE começar no mais cedo. */
  mustStartOn?: number;
  /** Índice do dia útil (CPM) mais tarde em que a atividade PODE terminar. */
  finishNoLaterThan?: number;
};

export type CpmResult = CpmActivity & {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  /** Folga livre: atraso máximo sem violar a relação de precedência com qualquer sucessora. */
  freeFloat: number;
  /** Verdadeiro quando as restrições tornam a rede inviável (folga total negativa). */
  infeasible: boolean;
  critical: boolean;
};

export type ScheduleResult = {
  activities: CpmResult[];
  projectDuration: number;
  criticalPath: string[];
  /** Atividades cuja folga total ficou negativa por conflito de restrições. */
  infeasibleActivities: string[];
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
    if (!Number.isInteger(activity.duration) || activity.duration < 1) {
      throw new Error(`Duração inválida para ${activity.id}: deve ser um inteiro maior ou igual a 1 dia`);
    }
    if (activity.startOffsetDay !== undefined &&
        (!Number.isInteger(activity.startOffsetDay) || activity.startOffsetDay < 0)) {
      throw new Error(`Índice de início planejado inválido para ${activity.id}`);
    }
    for (const [field, value] of [
      ["mustStartOn", activity.mustStartOn],
      ["finishNoLaterThan", activity.finishNoLaterThan],
    ] as const) {
      if (value !== undefined && !Number.isInteger(value)) {
        throw new Error(`Restrição ${field} inválida para ${activity.id}`);
      }
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
    let start = Math.max(0, activity.startOffsetDay ?? 0);
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
    // Constraint: mustStartOn é um piso no início mais cedo
    if (activity.mustStartOn !== undefined) {
      start = Math.max(start, activity.mustStartOn);
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
    // Constraint: finishNoLaterThan é um teto no término mais tarde
    if (activity.finishNoLaterThan !== undefined) {
      finish = Math.min(finish, activity.finishNoLaterThan);
    }
    late.set(id, { start: finish - activity.duration, finish });
  }

  // ------------------------------------------------- folga livre --------
  // A folga livre mede quanto a predecessora pode atrasar sem violar a
  // relação com cada sucessora. A expressão depende do tipo de elo e do lag.
  // Usar sempre ES(sucessora) - EF(predecessora) só é correto para FS sem lag.
  const freeFloat = new Map<string, number>();
  for (const id of order) {
    const activityEarly = early.get(id)!;
    const successors = outgoing.get(id) ?? [];
    let ff: number;
    if (successors.length === 0) {
      ff = projectDuration - activityEarly.finish;
    } else {
      ff = Math.min(...successors.map(dependency => {
        const successorEarly = early.get(dependency.successorId)!;
        const lag = dependency.lag ?? 0;
        switch (dependency.type) {
          case "FS":
            return successorEarly.start - activityEarly.finish - lag;
          case "SS":
            return successorEarly.start - activityEarly.start - lag;
          case "FF":
            return successorEarly.finish - activityEarly.finish - lag;
          case "SF":
            return successorEarly.finish - activityEarly.start - lag;
        }
      }));
    }
    freeFloat.set(id, Math.max(0, ff));
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
      freeFloat: freeFloat.get(activity.id) ?? 0,
      critical: totalFloat <= 0,
      infeasible: totalFloat < 0,
    };
  });
  // Retorna uma sequência contínua de atividades críticas, não apenas uma
  // lista de todas as atividades críticas ordenadas por data. Em redes com
  // caminhos críticos paralelos, escolhe a cadeia crítica de maior duração.
  const resultById = new Map(results.map(activity => [activity.id, activity]));
  const criticalIds = new Set(results.filter(activity => activity.critical).map(activity => activity.id));
  // Com relações SS/FF/SF, atividades sobrepostas não podem ser ranqueadas
  // somando durações. Escolhemos a cadeia crítica com maior intervalo real
  // entre o início da primeira atividade e o término da última.
  const chainStart = new Map<string, number>();
  const bestPrevious = new Map<string, string | null>();
  for (const id of order) {
    if (!criticalIds.has(id)) continue;
    const current = resultById.get(id)!;
    let start = current.earlyStart;
    let previous: string | null = null;
    for (const dependency of dependencies.filter(item => item.successorId === id)) {
      if (!criticalIds.has(dependency.predecessorId)) continue;
      const predecessor = resultById.get(dependency.predecessorId)!;
      const lag = dependency.lag ?? 0;
      const isTight =
        dependency.type === "FS" ? current.earlyStart === predecessor.earlyFinish + lag :
        dependency.type === "SS" ? current.earlyStart === predecessor.earlyStart + lag :
        dependency.type === "FF" ? current.earlyFinish === predecessor.earlyFinish + lag :
        current.earlyFinish === predecessor.earlyStart + lag;
      if (!isTight) continue;
      const candidateStart = chainStart.get(dependency.predecessorId) ?? predecessor.earlyStart;
      if (current.earlyFinish - candidateStart > current.earlyFinish - start) {
        start = candidateStart;
        previous = dependency.predecessorId;
      }
    }
    chainStart.set(id, start);
    bestPrevious.set(id, previous);
  }
  let criticalEnd: string | null = null;
  for (const id of order) {
    if (!criticalIds.has(id)) continue;
    const current = resultById.get(id)!;
    const span = current.earlyFinish - (chainStart.get(id) ?? current.earlyStart);
    const bestSpan = criticalEnd === null ? -Infinity :
      resultById.get(criticalEnd)!.earlyFinish - (chainStart.get(criticalEnd) ?? resultById.get(criticalEnd)!.earlyStart);
    if (criticalEnd === null || span > bestSpan) criticalEnd = id;
  }
  const criticalPath: string[] = [];
  while (criticalEnd !== null) {
    criticalPath.unshift(criticalEnd);
    criticalEnd = bestPrevious.get(criticalEnd) ?? null;
  }

  return {
    activities: results,
    projectDuration,
    criticalPath,
    infeasibleActivities: results
      .filter(activity => activity.infeasible)
      .sort((a, b) => a.earlyStart - b.earlyStart || a.id.localeCompare(b.id))
      .map(activity => activity.id),
  };
}
