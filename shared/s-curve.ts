/**
 * Curva S — valor planejado acumulado × valor realizado acumulado.
 *
 * A curva S é a ferramenta de controle de prazo que responde "quanto da obra
 * deveria estar pronta até hoje, e quanto está". Sem ela, avance se mede em
 * percentual único e não há como dizer se a obra está na data — só se "tem
 * 32%", que é verdade em qualquer semana.
 *
 * Este módulo é puro: não consulta relógio, banco ou rede. A mesma entrada
 * produz a mesma saída, o que a torna auditável e comparável entre versões.
 *
 * Não substitui o CPM. O CPM diz quando cada atividade *deveria* começar e
 * terminar; a curva S diz quanto do *valor* foi entregue até cada dia. As duas
 * se alimentam: se o CPM cair, a linha de base da curva muda junto.
 */

export type CurveActivity = {
  id: string;
  /** Duração em dias (índice de dia do CPM). */
  duration: number;
  /** Peso da atividade na curva. Zero significa "não entra no valor". */
  plannedPercent: number;
  /** Percentual físico já executado (0..100). Pode passar de 100. */
  actualPercent: number;
  /** Início previsto (índice de dia do CPM). Default 0. */
  earlyStart?: number;
};

export type CurvePoint = {
  day: number;
  planned: number;
  actual: number;
};

export type SCurveStatus = "adiantado" | "no_prazo" | "atrasado" | "indeterminado";

export type SCurveResult = {
  points: CurvePoint[];
  /** Duração total em dias (maior término planejado). */
  duration: number;
  /** Valor acumulado planejado ao fim do prazo. */
  finalPlanned: number;
  /** Valor acumulado realizado ao fim do prazo. */
  finalActual: number;
  /** Realizado menos planejado, em pontos percentuais. Negativo = atraso. */
  deviation: number;
  status: SCurveStatus;
};

function assertValido(activities: CurveActivity[]) {
  for (const activity of activities) {
    if (!Number.isFinite(activity.duration) || activity.duration < 0) {
      throw new Error(`Duração inválida para ${activity.id}`);
    }
    if (!Number.isFinite(activity.plannedPercent) || activity.plannedPercent < 0) {
      throw new Error(`Peso planejado inválido para ${activity.id}`);
    }
    // O realizado pode passar de 100 (sobre-execução) mas nunca negativo:
    // valor negativo é dado corrompido, não resultado.
    if (!Number.isFinite(activity.actualPercent) || activity.actualPercent < 0) {
      throw new Error(`Percentual realizado inválido para ${activity.id}`);
    }
  }
}

/**
 * Valor acumulado da atividade num dia dado.
 *
 * Planejado: cresce linearmente durante a execução, de 0 ao peso total.
 * Realizado: também linear, mas limitado ao peso — é por isso que
 * `actualPercent` acima de 100 satura em vez de estourar o total.
 */
function acumulado(
  activities: CurveActivity[],
  day: number,
  pick: (activity: CurveActivity) => number
): number {
  let total = 0;
  for (const activity of activities) {
    const weight = activity.plannedPercent;
    if (weight <= 0) continue;
    const start = activity.earlyStart ?? 0;
    const duration = activity.duration;
    if (duration <= 0) {
      // Atividade de duração zero: contribute o peso inteiro se o dia já passou.
      if (day >= start) total += weight * (pick(activity) / 100);
      continue;
    }
    const elapsed = day - start;
    if (elapsed <= 0) continue;
    const fracao = Math.min(1, elapsed / duration);
    total += weight * fracao * (pick(activity) / 100);
  }
  return total;
}

export function buildSCurve(activities: CurveActivity[]): SCurveResult {
  assertValido(activities);

  if (activities.length === 0) {
    return {
      points: [{ day: 0, planned: 0, actual: 0 }],
      duration: 0,
      finalPlanned: 0,
      finalActual: 0,
      deviation: 0,
      status: "indeterminado",
    };
  }

  const duration = activities.reduce((max, activity) => {
    const fim = (activity.earlyStart ?? 0) + activity.duration;
    return Math.max(max, fim);
  }, 0);

  // Um ponto por dia é o comportamento esperado para uma obra de centenas de
  // dias; acima de ~5.000 dias o volume deixaria de ser lido por humano e o
  // gráfico deixaria de cumprir função.
  if (duration > 5000) {
    throw new Error(`Curva S com ${duration} dias excede o limite suportado (5000).`);
  }

  const points: CurvePoint[] = [];
  for (let day = 0; day <= duration; day += 1) {
    points.push({
      day,
      planned: acumulado(activities, day, activity => 100),
      actual: acumulado(activities, day, activity => activity.actualPercent),
    });
  }

  // Normaliza pela soma dos pesos. O chamador pode passar peso por atividade
  // (100 = "vale a obra inteira"), e a soma disso é o total da obra, não 100.
  // Sem esta normalização a curva reportaria 200 para duas atividades de peso
  // 100 — aritmeticamente certo, semanticamente errado.
  //
  // A normalização vale para CADA ponto, não só para o total: uma curva que
  // termina em 100 mas passa de 100 no meio não é uma curva em S, é uma
  // montanha.
  const totalPeso = activities.reduce(
    (sum, activity) => sum + Math.max(0, activity.plannedPercent),
    0
  );
  const fator = totalPeso > 0 ? 100 / totalPeso : 0;
  for (const point of points) {
    point.planned *= fator;
    point.actual *= fator;
  }

  const finalPlanned = points[points.length - 1].planned;
  const finalActual = points[points.length - 1].actual;
  const deviation = finalActual - finalPlanned;

  let status: SCurveStatus;
  if (duration === 0 || finalPlanned <= 0) {
    status = "indeterminado";
  } else if (deviation > 0.5) {
    status = "adiantado";
  } else if (deviation < -0.5) {
    status = "atrasado";
  } else {
    status = "no_prazo";
  }

  return { points, duration, finalPlanned, finalActual, deviation, status };
}

/**
 * Percentual planejado acumulado até um dia — a leitura de "quanto deveria
 * estar pronto hoje". É o número que o engenheiro compara com o realizado.
 */
export function plannedPercentAtDay(result: SCurveResult, day: number): number {
  if (result.finalPlanned <= 0) return 0;
  const point = result.points.find(item => item.day === day) ?? result.points[0];
  return (point.planned / result.finalPlanned) * 100;
}
