export type BarraComPeriodo = {
  codigo: string;
  inicio: string;
  fim: string;
};

export type FaixasVisiveis = {
  porCodigo: Map<string, number>;
  quantidade: number;
};

/** Empacota apenas barras que cruzam a janela temporal mostrada no gráfico. */
export function empacotarFaixasVisiveis(
  barras: readonly BarraComPeriodo[],
  inicioJanela: string,
  fimJanelaExclusivo: string
): FaixasVisiveis {
  const visiveis = barras
    .filter(barra => barra.fim >= inicioJanela && barra.inicio < fimJanelaExclusivo)
    .slice()
    .sort((a, b) =>
      a.inicio.localeCompare(b.inicio) ||
      a.fim.localeCompare(b.fim) ||
      a.codigo.localeCompare(b.codigo)
    );
  const fimDasFaixas: string[] = [];
  const porCodigo = new Map<string, number>();

  for (const barra of visiveis) {
    // Datas de término são inclusivas: só libera a faixa no dia seguinte.
    let faixa = fimDasFaixas.findIndex(fim => fim < barra.inicio);
    if (faixa < 0) faixa = fimDasFaixas.length;
    porCodigo.set(barra.codigo, faixa);
    fimDasFaixas[faixa] = barra.fim;
  }

  return { porCodigo, quantidade: fimDasFaixas.length };
}
