/**
 * Curva de desembolso — quando o dinheiro sai, não quando o serviço acontece.
 *
 * A curva S do cronograma (procedimento `scurve`) mede avanço físico. Esta mede
 * **caixa**: quanto está previsto sair por mês, quanto saiu de verdade e quanto
 * ainda vai sair. São curvas diferentes e é normal que se descolem — serviço
 * executado em dezembro pode ser pago em janeiro, e material comprado em
 * novembro é consumido em março.
 *
 * Três séries, e cada uma responde a uma pergunta:
 *
 *   `planejado`  — o custo da baseline, distribuído nos dias úteis da atividade.
 *   `realizado`  — `cost_entries` confirmados, pela data de competência.
 *   `projetado`  — realizado no passado; no futuro, o planejado do mês corrigido
 *                  pelo CPI. Sem AC não existe CPI: a projeção vira o próprio
 *                  planejado, e o painel diz isso em vez de inventar um desvio.
 *
 * O rateio é por dia útil e linear dentro da atividade. Não é o único critério
 * possível (curva de aquisição por insumo seria melhor), mas é o único que o
 * dado atual sustenta sem inventar premissa: a atividade tem duração em dias
 * úteis e valor planejado, e nada mais.
 */

import { dateAt, type WorkCalendar } from "../../shared/work-calendar";

export type AtividadeComCustoPlanejado = {
  id: number;
  /** Valor planejado da atividade: quantidade planejada × preço do item. */
  peso: number;
  startOffset: number;
  durationDays: number;
};

export type ValorPorMes = { mes: string; valor: number };

export type DesembolsoEntrada = {
  plannedStartIso: string;
  calendar: WorkCalendar;
  atividades: AtividadeComCustoPlanejado[];
  /** Custo real confirmado, por competência (mês `YYYY-MM`). */
  custoRealPorMes: ValorPorMes[];
  hojeMes: string;
  cpi: number | null;
};

export type MesDesembolso = {
  mes: string;
  situacao: "passado" | "corrente" | "futuro";
  planejado: number;
  realizado: number;
  projetado: number;
  acumuladoPlanejado: number;
  acumuladoRealizado: number;
  acumuladoProjetado: number;
  /** Realizado − planejado no mês. Negativo = gastou menos que o previsto. */
  desvio: number;
};

export type DesembolsoResultado = {
  meses: MesDesembolso[];
  /** Custo planejado total (BAC do escopo com datas). */
  bac: number;
  realizadoTotal: number;
  projetadoTotal: number;
  /** Projetado − BAC. Positivo = tendência de estouro. */
  /**
   * Projeção − BAC. `null` quando não há custo lançado: sem CPI, "projetado" é
   * o próprio planejado e a diferença contra o BAC só mede o que ainda não
   * saiu — apresentar isso como "economia" mentiria na cara do usuário.
   */
  desvioProjetado: number | null;
  cpi: number | null;
  alertas: string[];
};

const dinheiro = (valor: number): number => Math.round(valor * 100) / 100;

/** `YYYY-MM` de uma data ISO. Sem `Date`: o mês é texto. */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

export function mesAnterior(mes: string): string {
  const [ano, numero] = mes.split("-").map(Number);
  const data = new Date(Date.UTC(ano!, numero! - 2, 1));
  return data.toISOString().slice(0, 7);
}

export function mesSeguinte(mes: string): string {
  const [ano, numero] = mes.split("-").map(Number);
  const data = new Date(Date.UTC(ano!, numero!, 1));
  return data.toISOString().slice(0, 7);
}

/** Custo planejado por mês, rateado nos dias úteis de cada atividade. */
export function planejadoPorMes(entrada: {
  plannedStartIso: string;
  calendar: WorkCalendar;
  atividades: AtividadeComCustoPlanejado[];
}): Map<string, number> {
  const porMes = new Map<string, number>();
  for (const atividade of entrada.atividades) {
    if (!(atividade.peso > 0)) continue;
    const duracao = Math.max(1, Math.floor(atividade.durationDays));
    const cota = atividade.peso / duracao;
    for (let dia = 0; dia < duracao; dia += 1) {
      const iso = dateAt(
        entrada.calendar,
        entrada.plannedStartIso,
        atividade.startOffset + dia
      );
      const mes = mesDe(iso);
      porMes.set(mes, (porMes.get(mes) ?? 0) + cota);
    }
  }
  return porMes;
}

/**
 * Quanto multiplicar o custo planejado futuro para chegar ao custo provável.
 *
 * CPI é `EV / AC`. CPI 1 = no prazo do orçamento. CPI 0,80 = cada real
 * entregue custou 1,25 → fator 1 / 0,80 = 1,25.
 *
 * CPI ausente ou não positivo vira fator 1: projetar com número inventado é
 * pior que projetar sem correção, porque some a dúvida sem resolver o dado.
 */
function fatorDeProjecao(cpi: number | null): number {
  if (cpi == null || !Number.isFinite(cpi) || cpi <= 0) return 1;
  // Um CPI de 0,05 projetaria 20× o orçamento: é dado quebrado, não tendência.
  return 1 / Math.max(0.2, cpi);
}

export function computeDesembolso(entrada: DesembolsoEntrada): DesembolsoResultado {
  const planejado = planejadoPorMes(entrada);
  const realizado = new Map<string, number>();
  for (const linha of entrada.custoRealPorMes) {
    realizado.set(linha.mes, (realizado.get(linha.mes) ?? 0) + linha.valor);
  }

  const chaves = new Set<string>([...planejado.keys(), ...realizado.keys()]);
  if (chaves.size === 0) {
    return {
      meses: [],
      bac: 0,
      realizadoTotal: 0,
      projetadoTotal: 0,
      desvioProjetado: null,
      cpi: entrada.cpi,
      alertas: [
        entrada.atividades.length > 0
          ? // Há atividades, então a curva não está vazia por falta de plano: está
            // vazia porque nenhuma delas tem valor. Dizer "sem planejamento" aqui
            // manda o usuário procurar um plano que existe.
            "As atividades do plano não têm valor planejado — confira o vínculo com os itens do orçamento."
          : "Sem atividades no plano nem custo lançado: não há curva para desenhar.",
      ],
    };
  }

  const ordenadas = [...chaves].sort();
  const primeira = ordenadas[0]!;
  const ultima = [...ordenadas, entrada.hojeMes].sort().at(-1)!;

  // Meses contíguos: um buraco na curva faz o acumulado parecer um degrau.
  const meses: MesDesembolso[] = [];
  let cursor = primeira;
  let guarda = 0;
  let acumuladoPlanejado = 0;
  let acumuladoRealizado = 0;
  let acumuladoProjetado = 0;

  while (cursor <= ultima && guarda < 600) {
    guarda += 1;
    const valorPlanejado = dinheiro(planejado.get(cursor) ?? 0);
    const valorRealizado = dinheiro(realizado.get(cursor) ?? 0);
    const situacao: MesDesembolso["situacao"] =
      cursor < entrada.hojeMes
        ? "passado"
        : cursor === entrada.hojeMes
          ? "corrente"
          : "futuro";

    // Passado e mês corrente: o que saiu é o realizado. Futuro: planejado
    // corrigido pelo CPI. E a correção é DIVISÃO, não multiplicação: CPI é
    // EV/AC, então CPI 0,80 significa que cada R$ 1,00 entregue custou
    // R$ 1,25 — o que falta gastar custa planejado ÷ 0,80, não × 0,80.
    const projetado =
      situacao === "futuro"
        ? dinheiro(valorPlanejado * fatorDeProjecao(entrada.cpi))
        : valorRealizado;

    acumuladoPlanejado += valorPlanejado;
    acumuladoRealizado += valorRealizado;
    acumuladoProjetado += projetado;

    meses.push({
      mes: cursor,
      situacao,
      planejado: valorPlanejado,
      realizado: valorRealizado,
      projetado,
      acumuladoPlanejado: dinheiro(acumuladoPlanejado),
      acumuladoRealizado: dinheiro(acumuladoRealizado),
      acumuladoProjetado: dinheiro(acumuladoProjetado),
      desvio: dinheiro(valorRealizado - valorPlanejado),
    });

    cursor = mesSeguinte(cursor);
  }

  const bac = dinheiro(meses.reduce((soma, mes) => soma + mes.planejado, 0));
  const realizadoTotal = dinheiro(meses.reduce((soma, mes) => soma + mes.realizado, 0));
  const projetadoTotal = dinheiro(meses.reduce((soma, mes) => soma + mes.projetado, 0));

  const alertas: string[] = [];
  if (entrada.cpi === null) {
    alertas.push(
      "Sem custo real lançado não existe CPI: a projeção usa o custo planejado, sem correção de tendência."
    );
  }
  if (realizadoTotal === 0) {
    alertas.push("Nenhum custo confirmado na obra: a curva é só planejamento.");
  }
  if (bac > 0 && projetadoTotal > bac * 1.05) {
    alertas.push(
      `Projeção ${dinheiro(((projetadoTotal - bac) / bac) * 100)}% acima do planejado.`
    );
  }
  const mesesGastandoMais = meses.filter(
    mes => mes.situacao !== "futuro" && mes.planejado > 0 && mes.realizado > mes.planejado * 1.2
  );
  if (mesesGastandoMais.length > 0) {
    alertas.push(
      `${mesesGastandoMais.length} mês(es) com desembolso mais de 20% acima do planejado.`
    );
  }

  return {
    meses,
    bac,
    realizadoTotal,
    projetadoTotal,
    desvioProjetado: entrada.cpi === null ? null : dinheiro(projetadoTotal - bac),
    cpi: entrada.cpi,
    alertas,
  };
}
