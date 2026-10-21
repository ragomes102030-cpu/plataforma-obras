import type { CpmActivity, Dependency, RelationType } from "../../shared/cpm";
import { simulateMonteCarlo, type MonteCarloOptions } from "../../shared/monte-carlo";

/**
 * Adaptador entre o cronograma como o banco/tela conhecem e o simulador puro.
 *
 * Existe para que a rota não faça conta e o simulador não conheça banco: aqui só
 * traduz id numérico → string, valida duração e enriquece o resultado com o nome
 * legível das atividades que aparecem no tornado.
 */

export type RiskActivityInput = {
  id: number;
  wbsCode: string;
  name: string;
  durationDays: number;
};

export type RiskDependencyInput = {
  predecessorId: number;
  successorId: number;
  type: RelationType;
  lag: number;
};

export type ScheduleRiskResult = {
  iterations: number;
  deterministicDuration: number;
  mean: number;
  stdDev: number;
  p10: number;
  p50: number;
  p80: number;
  p90: number;
  histogram: { days: number; count: number }[];
  network: { components: number; disconnected: boolean; isolatedCount: number };
  criticality: { id: string; label: string; index: number }[];
  sensitivity: { id: string; label: string; correlation: number }[];
  /** O que o painel precisa dizer em voz alta antes de alguém prometer uma data. */
  alerts: string[];
};

const TOP = 12;

export function simulateScheduleRisk(
  activities: RiskActivityInput[],
  dependencies: RiskDependencyInput[],
  options: MonteCarloOptions = {}
): ScheduleRiskResult {
  if (activities.length === 0) {
    throw new Error("Não há atividades para simular. Monte a rede e calcule o CPM antes.");
  }

  const labels = new Map(activities.map(activity => [String(activity.id), `${activity.wbsCode} — ${activity.name}`]));
  const semDuracao = activities.filter(activity => !(activity.durationDays >= 1));

  const cpmActivities: CpmActivity[] = activities.map(activity => ({
    id: String(activity.id),
    // O motor rejeita duração < 1; aqui normalizamos e avisamos depois, em vez de
    // deixar a rota estourar com uma mensagem de erro de outro módulo.
    duration: Math.max(1, Math.round(activity.durationDays)),
  }));

  const cpmDependencies: Dependency[] = dependencies.map(dependency => ({
    predecessorId: String(dependency.predecessorId),
    successorId: String(dependency.successorId),
    type: dependency.type,
    lag: dependency.lag,
  }));

  const result = simulateMonteCarlo(cpmActivities, cpmDependencies, options);
  const label = (id: string) => labels.get(id) ?? id;

  const alerts: string[] = [];
  if (result.network.disconnected) {
    alerts.push(
      `A rede tem ${result.network.components} cadeias isoladas. O prazo simulado é o máximo entre elas, ` +
        "não o caminho crítico de uma só — sem vínculo entre as frentes, a obra não tem prazo único confiável."
    );
  }
  if (semDuracao.length > 0) {
    alerts.push(`${semDuracao.length} atividade(s) sem duração válida foram simuladas com 1 dia.`);
  }
  if (dependencies.length === 0 && activities.length > 1) {
    alerts.push("Não há dependências registradas: a simulação trata todas as atividades como paralelas.");
  }
  if (result.deterministicDuration > 0 && result.p80 > result.deterministicDuration * 1.5) {
    alerts.push(
      "A dispersão do p80 passa de 50% do prazo determinístico. Isso costuma indicar duração subestimada " +
        "em alguma frente, não apenas incerteza natural."
    );
  }

  return {
    iterations: result.iterations,
    deterministicDuration: result.deterministicDuration,
    mean: result.mean,
    stdDev: result.stdDev,
    p10: result.p10,
    p50: result.p50,
    p80: result.p80,
    p90: result.p90,
    histogram: result.histogram,
    network: {
      components: result.network.components,
      disconnected: result.network.disconnected,
      isolatedCount: result.network.isolatedActivities.length,
    },
    criticality: Object.entries(result.criticalityIndex)
      .map(([id, index]) => ({ id, label: label(id), index }))
      .sort((a, b) => b.index - a.index)
      .slice(0, TOP),
    sensitivity: result.sensitivity.slice(0, TOP).map(item => ({
      id: item.id,
      label: label(item.id),
      correlation: item.correlation,
    })),
    alerts,
  };
}
