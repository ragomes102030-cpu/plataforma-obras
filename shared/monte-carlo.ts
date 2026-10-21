/**
 * Monte Carlo sobre o CPM.
 *
 * O CPM determinístico responde "quando termino se tudo sair como planejado".
 * A pergunta que o dono da obra faz é outra: "qual a chance de eu terminar até a
 * data que prometi". Sem distribuição de duração não há como responder — e é
 * exatamente o número que P6 e nPlan vendem.
 *
 * Regras deste módulo:
 *  - não consulta banco, rede nem relógio;
 *  - a mesma semente produz o mesmo resultado, para o teste poder comparar número exato;
 *  - duração amostrada é inteira e >= 1, porque `calculateCpm` rejeita o resto;
 *  - rede desconectada é reportada, nunca escondida: com N cadeias isoladas o
 *    prazo é o máximo entre elas, não o caminho crítico de uma delas. É o defeito
 *    medido na AURORA TESTE (53 atividades, 64 dependências, 8 cadeias).
 */
import { calculateCpm, type CpmActivity, type Dependency } from "./cpm";

export type DurationEstimate = {
  id: string;
  /** Menor duração plausível, em dias. */
  optimistic: number;
  /** Duração mais provável, em dias. */
  mostLikely: number;
  /** Maior duração plausível, em dias. */
  pessimistic: number;
};

export type MonteCarloOptions = {
  iterations?: number;
  seed?: number;
  /**
   * Incerteza simétrica aplicada quando a atividade não tem três pontos
   * explícitos: optimistic = duração * (1 - uncertainty),
   * pessimistic = duração * (1 + uncertainty).
   */
  uncertainty?: number;
  estimates?: DurationEstimate[];
};

export type MonteCarloResult = {
  iterations: number;
  deterministicDuration: number;
  mean: number;
  stdDev: number;
  p10: number;
  p50: number;
  p80: number;
  p90: number;
  /** Probabilidade de terminar até `days`, pela amostra simulada. */
  probabilityOfFinishingBy: (days: number) => number;
  /** Fração das simulações em que a atividade ficou no caminho crítico. */
  criticalityIndex: Record<string, number>;
  /** Correlação entre a duração da atividade e o prazo final; ordena o tornado. */
  sensitivity: { id: string; correlation: number }[];
  histogram: { days: number; count: number }[];
  network: {
    components: number;
    disconnected: boolean;
    isolatedActivities: string[];
  };
};

const DEFAULT_ITERATIONS = 5000;
const DEFAULT_SEED = 20261021;
const DEFAULT_UNCERTAINTY = 0.25;

/** PRNG determinístico (mulberry32): mesma semente, mesma simulação. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amostra da triangular via CDF inversa. */
function sampleTriangular(low: number, mode: number, high: number, u: number): number {
  if (high <= low) return mode;
  const split = (mode - low) / (high - low);
  const value =
    u < split
      ? low + Math.sqrt(u * (high - low) * (mode - low))
      : high - Math.sqrt((1 - u) * (high - low) * (high - mode));
  return Math.max(1, Math.round(value));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/** Componentes conexos do grafo não direcionado das dependências. */
function analyzeNetwork(
  activities: CpmActivity[],
  dependencies: Dependency[]
): MonteCarloResult["network"] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    return current;
  };
  for (const activity of activities) parent.set(activity.id, activity.id);
  for (const dependency of dependencies) {
    if (!parent.has(dependency.predecessorId) || !parent.has(dependency.successorId)) continue;
    const a = find(dependency.predecessorId);
    const b = find(dependency.successorId);
    if (a !== b) parent.set(a, b);
  }
  const roots = new Set<string>();
  for (const activity of activities) roots.add(find(activity.id));
  const isolated = activities
    .filter(activity => !dependencies.some(d => d.predecessorId === activity.id || d.successorId === activity.id))
    .map(activity => activity.id);
  return {
    components: roots.size,
    disconnected: roots.size > 1,
    isolatedActivities: isolated,
  };
}

export function simulateMonteCarlo(
  activities: CpmActivity[],
  dependencies: Dependency[],
  options: MonteCarloOptions = {}
): MonteCarloResult {
  if (activities.length === 0) throw new Error("Monte Carlo sem atividades");
  const iterations = Math.max(1, Math.floor(options.iterations ?? DEFAULT_ITERATIONS));
  const uncertainty = options.uncertainty ?? DEFAULT_UNCERTAINTY;
  if (uncertainty < 0) throw new Error("Incerteza negativa não faz sentido");

  const estimates = new Map((options.estimates ?? []).map(estimate => [estimate.id, estimate]));
  const bounds = activities.map(activity => {
    const explicit = estimates.get(activity.id);
    const low = explicit ? explicit.optimistic : Math.max(1, Math.round(activity.duration * (1 - uncertainty)));
    const mode = explicit ? explicit.mostLikely : activity.duration;
    const high = explicit
      ? explicit.pessimistic
      : Math.max(low, Math.round(activity.duration * (1 + uncertainty)));
    if (!(low <= mode && mode <= high)) {
      throw new Error(`Três pontos inválidos para ${activity.id}: ${low}/${mode}/${high}`);
    }
    return { activity, id: activity.id, low, mode, high };
  });

  const deterministicDuration = calculateCpm(activities, dependencies).projectDuration;
  const random = createRandom(options.seed ?? DEFAULT_SEED);
  const finishes: number[] = new Array(iterations);
  const criticality = new Map<string, number>();
  const sampleSum = new Map<string, number>();
  const sampleSquareSum = new Map<string, number>();
  const crossSum = new Map<string, number>();

  for (let index = 0; index < iterations; index += 1) {
    const sampled: CpmActivity[] = bounds.map(bound => ({
      // Preserva restrições (mustStartOn, finishNoLaterThan, startOffsetDay):
      // só a duração é amostrada. Se o simulador as descartasse, o prazo
      // simulado ignoraria exatamente o que o cronograma real obedece.
      ...bound.activity,
      duration: sampleTriangular(bound.low, bound.mode, bound.high, random()),
    }));
    const schedule = calculateCpm(sampled, dependencies);
    const finish = schedule.projectDuration;
    finishes[index] = finish;

    for (const activity of sampled) {
      const duration = activity.duration;
      sampleSum.set(activity.id, (sampleSum.get(activity.id) ?? 0) + duration);
      sampleSquareSum.set(activity.id, (sampleSquareSum.get(activity.id) ?? 0) + duration * duration);
      crossSum.set(activity.id, (crossSum.get(activity.id) ?? 0) + duration * finish);
    }
    for (const result of schedule.activities) {
      if (result.critical) criticality.set(result.id, (criticality.get(result.id) ?? 0) + 1);
    }
  }

  const sorted = [...finishes].sort((a, b) => a - b);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;

  const criticalityIndex: Record<string, number> = {};
  for (const activity of activities) {
    criticalityIndex[activity.id] = (criticality.get(activity.id) ?? 0) / iterations;
  }

  // Correlação de Pearson entre a duração amostrada e o prazo final.
  // Não é causalidade: mede quanto o prazo anda junto com aquela atividade.
  const totalFinish = sorted.reduce((total, value) => total + value, 0);
  const totalFinishSquare = sorted.reduce((total, value) => total + value * value, 0);
  const sensitivity = activities
    .map(activity => {
      const n = iterations;
      const sx = sampleSum.get(activity.id) ?? 0;
      const sxx = sampleSquareSum.get(activity.id) ?? 0;
      const sxy = crossSum.get(activity.id) ?? 0;
      const numerator = n * sxy - sx * totalFinish;
      const denominator = Math.sqrt(
        Math.max(0, n * sxx - sx * sx) * Math.max(0, n * totalFinishSquare - totalFinish * totalFinish)
      );
      return { id: activity.id, correlation: denominator === 0 ? 0 : numerator / denominator };
    })
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  const minDay = Math.floor(sorted[0]!);
  const maxDay = Math.ceil(sorted[sorted.length - 1]!);
  const bucketWidth = Math.max(1, Math.ceil((maxDay - minDay + 1) / 30));
  const buckets = new Map<number, number>();
  for (const value of sorted) {
    const bucket = minDay + Math.floor((value - minDay) / bucketWidth) * bucketWidth;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }

  return {
    iterations,
    deterministicDuration,
    mean,
    stdDev: Math.sqrt(variance),
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p80: percentile(sorted, 0.8),
    p90: percentile(sorted, 0.9),
    probabilityOfFinishingBy: (days: number) => {
      // Busca binária: a amostra já está ordenada.
      let low = 0;
      let high = sorted.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (sorted[middle]! <= days) low = middle + 1;
        else high = middle;
      }
      return low / sorted.length;
    },
    criticalityIndex,
    sensitivity,
    histogram: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([days, count]) => ({ days, count })),
    network: analyzeNetwork(activities, dependencies),
  };
}
