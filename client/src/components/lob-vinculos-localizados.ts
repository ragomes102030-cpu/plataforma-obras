/**
 * Leitura visual da LOB, sem escrita e sem inferir precedências.
 * Uma atividade distribuída em vários locais mantém a identidade de atividade
 * mas cada barra precisa de uma chave própria (atividade + código + local).
 */
export type PontoLocalizadoLob = {
  activityId?: number;
  codigo: string;
  local: string;
  inicio: string;
  fim: string;
};
export type DependenciaAtividadeLob = {
  de: number;
  para: number;
  tipo: string;
  lag?: number;
};
export type VinculoLocalizadoLob = {
  chaveOrigem: string;
  chaveDestino: string;
  de: string;
  para: string;
  tipo: string;
  lag: number;
  localOrigem: string;
  localDestino: string;
};
export type RelatorioVinculosLob = {
  vinculos: VinculoLocalizadoLob[];
  semRepresentacao: number;
  dependenciasRepresentadas: number;
  dependenciasTotais: number;
};

export function chavePontoLob(
  ponto: Pick<PontoLocalizadoLob, "activityId" | "codigo" | "local">
): string {
  return `${ponto.activityId ?? "sem-id"}|${ponto.codigo}|${ponto.local}`;
}

/**
 * Cada vínculo oficial entre duas atividades vira uma ligação por local
 * compartilhado. Na ausência de local em uma ponta, só são permitidas ligações
 * com a atividade genérica; nunca se escolhe um pavimento vizinho por palpite.
 *
 * Nenhum vínculo é criado entre pavimentos para simular continuidade de equipe.
 * Isso exige relação de produção explícita e é uma etapa distinta do CPM.
 */
export function resolverVinculosLocalizadosLob(
  dependencias: readonly DependenciaAtividadeLob[],
  pontos: readonly PontoLocalizadoLob[],
): RelatorioVinculosLob {
  const porAtividade = new Map<number, PontoLocalizadoLob[]>();
  for (const ponto of pontos) {
    if (!Number.isInteger(ponto.activityId)) continue;
    const id = ponto.activityId!;
    const lista = porAtividade.get(id) ?? [];
    lista.push(ponto);
    porAtividade.set(id, lista);
  }
  const vinculos: VinculoLocalizadoLob[] = [];
  const vistos = new Set<string>();
  let semRepresentacao = 0;
  let dependenciasRepresentadas = 0;
  for (const d of dependencias) {
    if (d.de === d.para) { semRepresentacao += 1; continue; }
    const fontes = porAtividade.get(d.de) ?? [];
    const destinos = porAtividade.get(d.para) ?? [];
    let encontrados = 0;
    for (const destino of destinos) {
      const fontesNoLocal = destino.local
        ? fontes.filter(fonte => fonte.local === destino.local)
        : [];
      const fontesAdmissiveis = fontesNoLocal.length
        ? fontesNoLocal
        : fontes.filter(fonte => !fonte.local || !destino.local);
      for (const fonte of fontesAdmissiveis) {
        const chaveOrigem = chavePontoLob(fonte);
        const chaveDestino = chavePontoLob(destino);
        const chave = `${chaveOrigem}>>${chaveDestino}:${d.tipo}:${d.lag ?? 0}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        vinculos.push({
          chaveOrigem, chaveDestino, de: fonte.codigo, para: destino.codigo,
          tipo: d.tipo, lag: d.lag ?? 0,
          localOrigem: fonte.local, localDestino: destino.local,
        });
        encontrados += 1;
      }
    }
    if (encontrados > 0) dependenciasRepresentadas += 1;
    else semRepresentacao += 1;
  }
  return {
    vinculos, semRepresentacao, dependenciasRepresentadas,
    dependenciasTotais: dependencias.length,
  };
}

/**
 * Distribuição compacta de barras de um mesmo pavimento.
 * Apenas intervalos que se cruzam recebem faixas distintas; serviços em
 * períodos sequenciais reutilizam a mesma faixa, como no Excel aprovado.
 */
export function calcularFaixasCompactasLob(
  barras: readonly { inicio: string; fim: string }[]
): { faixas: number[]; totalFaixas: number } {
  const faixas = Array.from({length:barras.length}, () => 0);
  const fimPorFaixa: string[] = [];
  const indices = barras.map((_, i) => i)
    .sort((a,b) => barras[a]!.inicio.localeCompare(barras[b]!.inicio)
      || barras[a]!.fim.localeCompare(barras[b]!.fim) || a-b);
  for (const i of indices) {
    const barra = barras[i]!;
    let faixa = fimPorFaixa.findIndex(fim => fim < barra.inicio);
    if (faixa === -1) faixa = fimPorFaixa.length;
    fimPorFaixa[faixa] = barra.fim;
    faixas[i] = faixa;
  }
  return { faixas, totalFaixas: fimPorFaixa.length };
}
