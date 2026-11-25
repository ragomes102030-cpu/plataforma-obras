/**
 * Computes an explicitly synthetic production scenario without mixing it with
 * measured actuals. A QA entry only participates when it is confirmed, marked
 * as an example, compatible with the current activity unit, and linked to the
 * current plan version.
 */
export type EntradaProducaoQa = {
  status: string;
  exemplo?: number | string | null;
  unidadeCompativel?: boolean | null;
  vinculo?: string | null;
  codigo: string | null;
  quantidade: number | string;
  data: string;
};

export type CustoPlanejadoQa = {
  valorOrcado: number;
  quantidadePlanejada: number;
};

export type PontoProducaoQa = {
  data: string;
  valorAcumulado: number;
  percentual: number;
};

export type ResultadoProducaoQa = {
  valorAgregado: number;
  percentual: number;
  lancamentosValidos: number;
  lancamentosUnidadeIncompativel: number;
  lancamentosForaDaVersao: number;
  pontos: PontoProducaoQa[];
};

const numero = (value: number | string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dataIsoValida = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export function calcularProducaoQa(
  entries: readonly EntradaProducaoQa[],
  custosPorCodigo: ReadonlyMap<string, CustoPlanejadoQa>,
  valorTotalOrcamento: number,
  dataReferencia: string,
): ResultadoProducaoQa {
  const qaConfirmados = entries.filter(entry => entry.status === "confirmada" && Number(entry.exemplo ?? 0) === 1);
  const lancamentosUnidadeIncompativel = qaConfirmados.filter(entry => entry.unidadeCompativel !== true).length;
  const lancamentosForaDaVersao = qaConfirmados.filter(entry => entry.vinculo !== "atual").length;
  const porData = new Map<string, Map<string, number>>();
  let lancamentosValidos = 0;

  if (!dataIsoValida(dataReferencia) || !(valorTotalOrcamento > 0) || !Number.isFinite(valorTotalOrcamento)) {
    return { valorAgregado: 0, percentual: 0, lancamentosValidos, lancamentosUnidadeIncompativel, lancamentosForaDaVersao, pontos: [] };
  }

  for (const entry of qaConfirmados) {
    const codigo = entry.codigo?.trim();
    const custo = codigo ? custosPorCodigo.get(codigo) : undefined;
    const quantidade = numero(entry.quantidade);
    if (
      entry.unidadeCompativel !== true || entry.vinculo !== "atual" ||
      !codigo || !custo || !(custo.valorOrcado > 0) || !(custo.quantidadePlanejada > 0) ||
      !Number.isFinite(custo.valorOrcado) || !Number.isFinite(custo.quantidadePlanejada) ||
      !(quantidade > 0) || !dataIsoValida(entry.data) || entry.data > dataReferencia
    ) continue;

    const porCodigo = porData.get(entry.data) ?? new Map<string, number>();
    porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + quantidade);
    porData.set(entry.data, porCodigo);
    lancamentosValidos += 1;
  }

  let valorAgregado = 0;
  const quantidadeAcumulada = new Map<string, number>();
  const pontos: PontoProducaoQa[] = [];
  for (const data of [...porData.keys()].sort()) {
    let incrementoDoDia = 0;
    for (const [codigo, quantidadeDoDia] of porData.get(data) ?? []) {
      const custo = custosPorCodigo.get(codigo)!;
      const anterior = quantidadeAcumulada.get(codigo) ?? 0;
      const atual = Math.min(custo.quantidadePlanejada, anterior + quantidadeDoDia);
      const incremento = atual - anterior;
      if (incremento > 0) incrementoDoDia += custo.valorOrcado * incremento / custo.quantidadePlanejada;
      quantidadeAcumulada.set(codigo, atual);
    }
    if (incrementoDoDia <= 0) continue;
    valorAgregado += incrementoDoDia;
    pontos.push({
      data,
      valorAcumulado: valorAgregado,
      percentual: Math.min(100, 100 * valorAgregado / valorTotalOrcamento),
    });
  }

  return {
    valorAgregado,
    percentual: Math.min(100, 100 * valorAgregado / valorTotalOrcamento),
    lancamentosValidos,
    lancamentosUnidadeIncompativel,
    lancamentosForaDaVersao,
    pontos,
  };
}
