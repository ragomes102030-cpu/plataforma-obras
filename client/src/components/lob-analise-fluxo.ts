import { diaUtc, type PontoLob, type SerieLob } from "./linha-balanco-modelo";

const DIA = 86400000;
const distanciaEmDias = (inicio: string, fim: string): number =>
  Math.round((diaUtc(fim) - diaUtc(inicio)) / DIA);

export type AlertaFluxoLob = {
  tipo: "sobreposicao" | "intervalo" | "transferencia";
  local: string;
  servicos: string;
  dias: number;
  codigos: string[];
  descricao: string;
};
export type RitmoServicoLob = {
  chave: string;
  nome: string;
  locais: number;
  diasPorTransferencia: number | null;
  menorIntervalo: number | null;
  maiorIntervalo: number | null;
  variavel: boolean;
  invertido: boolean;
};

export type AnaliseFluxoLob = {
  ritmos: RitmoServicoLob[];
  alertas: AlertaFluxoLob[];
  sobreposicoes: number;
  intervalos: number;
  transferencias: number;
};

/**
 * Análise descritiva e somente leitura das datas aprovadas/atuais na grade.
 * A coincidência de janelas NÃO prova disputa de equipes, impossibilidade
 * técnica ou violação de precedências. "Intervalo" é ausência de serviço
 * selecionado, NÃO ociosidade comprovada de uma equipe.
 */
export function analisarFluxoLob(series: SerieLob[], locaisExibidos: string[]): AnaliseFluxoLob {
  const permitidos = new Set(locaisExibidos);
  const ordenacao = (a: PontoLob, b: PontoLob) =>
    a.local.localeCompare(b.local, "pt-BR", { numeric: true });

  const ritmos: RitmoServicoLob[] = series.map(s => {
    const pontos = s.pontos.filter(p => permitidos.has(p.local)).sort(ordenacao);
    const intervalos = pontos.slice(1).map((p, i) => distanciaEmDias(pontos[i]!.inicio, p.inicio));
    const menor = intervalos.length ? Math.min(...intervalos) : null;
    const maior = intervalos.length ? Math.max(...intervalos) : null;
    const media = intervalos.length ? intervalos.reduce((a, b) => a + b, 0) / intervalos.length : null;
    return {
      chave: s.chave, nome: s.nome, locais: pontos.length,
      diasPorTransferencia: media === null ? null : Math.round(media * 10) / 10,
      menorIntervalo: menor, maiorIntervalo: maior,
      variavel: menor !== null && maior !== null && maior !== menor,
      invertido: intervalos.some(n => n < 0),
    };
  });

  const alertas: AlertaFluxoLob[] = [];
  for (const local of locaisExibidos) {
    const tarefas = series.flatMap(s =>
      s.pontos.filter(p => p.local === local).map(p => ({ nome: s.nome, ponto: p }))
    ).sort((a, b) => a.ponto.inicio.localeCompare(b.ponto.inicio));

    // Pares simultâneos, inclusive janelas encaixadas: sem afirmar conflito físico.
    for (let i = 0; i < tarefas.length; i++) {
      for (let j = i + 1; j < tarefas.length; j++) {
        const a = tarefas[i]!, b = tarefas[j]!;
        if (b.ponto.inicio > a.ponto.fim) break;
        const limite = a.ponto.fim < b.ponto.fim ? a.ponto.fim : b.ponto.fim;
        const dias = distanciaEmDias(b.ponto.inicio, limite) + 1;
        if (dias > 0) alertas.push({
          tipo: "sobreposicao", local,
          servicos: a.nome + " / " + b.nome, dias,
          codigos: [a.ponto.codigo, b.ponto.codigo],
          descricao: "Janelas planejadas simultâneas no mesmo local. Verificar compatibilidade das frentes.",
        });
      }
    }

    // Intervalos entre serviços VISÍVEIS, não inferência sobre equipes/obra inteira.
    let ultimoFim: string | null = null;
    let anterior: typeof tarefas[number] | null = null;
    for (const tarefa of tarefas) {
      if (ultimoFim !== null && anterior !== null) {
        const dias = distanciaEmDias(ultimoFim, tarefa.ponto.inicio) - 1;
        if (dias > 0) alertas.push({
          tipo: "intervalo", local, dias,
          servicos: anterior.nome + " / " + tarefa.nome,
          codigos: [anterior.ponto.codigo, tarefa.ponto.codigo],
          descricao: "Dias sem nenhum dos serviços selecionados neste pavimento.",
        });
      }
      if (ultimoFim === null || tarefa.ponto.fim > ultimoFim) {
        ultimoFim = tarefa.ponto.fim;
        anterior = tarefa;
      }
    }
  }

  // Saltos sem trabalho cadastrado na mesma sequência entre pavimentos consecutivos.
  for (const serie of series) {
    const pontos = serie.pontos.filter(p => permitidos.has(p.local)).sort(ordenacao);
    for (let i = 1; i < pontos.length; i++) {
      const anterior = pontos[i - 1]!, atual = pontos[i]!;
      const dias = distanciaEmDias(anterior.fim, atual.inicio) - 1;
      if (dias > 0) alertas.push({
        tipo: "transferencia",
        local: anterior.local + " → " + atual.local,
        servicos: serie.nome,
        dias,
        codigos: [anterior.codigo, atual.codigo],
        descricao: "Intervalo de calendário entre execuções da mesma sequência. Não implica equipe ociosa.",
      });
    }
  }

  return {
    ritmos, alertas,
    sobreposicoes: alertas.filter(a => a.tipo === "sobreposicao").length,
    intervalos: alertas.filter(a => a.tipo === "intervalo").length,
    transferencias: alertas.filter(a => a.tipo === "transferencia").length,
  };
}
