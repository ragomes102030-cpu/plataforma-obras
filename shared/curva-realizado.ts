/**
 * A CURVA REALIZADA É DATADA PELA PRODUÇÃO, NÃO PELO CRONOGRAMA.
 *
 * Até 22/10/2026 o "realizado" da Curva S era o planejado multiplicado pelo
 * `% concluído` de cada atividade, espalhado dentro da janela PLANEJADA dela.
 * Na AURORA TESTE 10 atividades estavam em 100% (4.500 m² de alvenaria
 * confirmados em outubro), mas o CPM as coloca mais adiante no calendário — a
 * curva respondia "Realizado acumulado: 0,0%" para uma obra que já tinha
 * serviço feito. Pior: quem lança atrasado via o realizado "voltar no tempo".
 *
 * Aqui o realizado de um dia é o quanto de peso da obra foi confirmado ATÉ
 * aquele dia, pela data do lançamento de produção. É a definição que o
 * engenheiro usa na reunião: "até o dia 22 eu tinha 12% executado".
 */

export type EntradaRealizada = {
  /** Código da EAP da atividade (1.2.3). `null` quando o vínculo se perdeu. */
  codigo: string | null;
  quantidade: number;
  /** Data do lançamento, "YYYY-MM-DD". */
  data: string;
};

export type PesoDaAtividade = {
  /** Peso da atividade no valor da obra, em %. */
  peso: number;
  /** Quantidade planejada, na mesma unidade do lançamento. */
  planejado: number;
};

export type PontoRealizado = {
  /** Dia no eixo do cronograma (0 = início da obra). */
  dia: number;
  /** % acumulado da obra até esse dia. */
  percentual: number;
};

/**
 * Acumula os lançamentos confirmados por dia e devolve a série do realizado.
 *
 * Regras:
 *  - lançamento sem código (vínculo perdido) não inventa progresso;
 *  - quantidade acima do planejado é limitada a 100% da atividade (o excedente
 *    aparece no saldo, não na curva);
 *  - dia negativo (lançamento anterior ao início do cronograma) cai no dia 0.
 */
export function acumularRealizado(
  entradas: EntradaRealizada[],
  pesos: Map<string, PesoDaAtividade>,
  diaDe: (data: string) => number
): PontoRealizado[] {
  const porDia = new Map<number, number>();

  for (const entrada of entradas) {
    if (!entrada.codigo) continue;
    const peso = pesos.get(entrada.codigo);
    if (!peso || peso.peso <= 0 || !(peso.planejado > 0)) continue;
    const fracao = Math.min(1, Math.max(0, entrada.quantidade / peso.planejado));
    const dia = Math.max(0, diaDe(entrada.data));
    porDia.set(dia, (porDia.get(dia) ?? 0) + fracao * peso.peso);
  }

  const dias = [...porDia.keys()].sort((a, b) => a - b);
  const pontos: PontoRealizado[] = [{ dia: 0, percentual: 0 }];
  let acumulado = 0;
  for (const dia of dias) {
    acumulado += porDia.get(dia) ?? 0;
    const ultimo = pontos[pontos.length - 1];
    if (ultimo.dia === dia) {
      ultimo.percentual = Math.min(100, acumulado);
    } else {
      pontos.push({ dia, percentual: Math.min(100, acumulado) });
    }
  }
  return pontos;
}

/** % realizado acumulado até `dia` (último ponto não posterior a ele). */
export function realizadoNoDia(pontos: PontoRealizado[], dia: number): number {
  let valor = 0;
  for (const ponto of pontos) {
    if (ponto.dia > dia) break;
    valor = ponto.percentual;
  }
  return valor;
}
