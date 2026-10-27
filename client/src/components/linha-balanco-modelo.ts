import type { EntradaDaLinha } from "@shared/cronograma-colunas";

export type PontoLob = {
  codigo: string;
  nome: string;
  local: string;
  inicio: string;
  fim: string;
  executado: number;
  quantidade: number | null;
  unidade: string | null;
};
export type SerieLob = {
  chave: string;
  nome: string;
  pontos: PontoLob[];
  repetitiva: boolean;
};
export type FaixaLob = { inicio: string; fimExclusivo: string; rotulo: string };
const DIA = 86400000;
export const diaUtc = (iso: string): number => Date.parse(iso + "T12:00:00Z");
export function dataValida(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const valor = diaUtc(iso);
  return Number.isFinite(valor) && new Date(valor).toISOString().slice(0, 10) === iso;
}
export function diaSeguinte(iso: string): string {
  return new Date(diaUtc(iso) + DIA).toISOString().slice(0, 10);
}
export function rotuloMes(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return nomes[Number(mes) - 1] + "/" + ano.slice(2);
}
export function prepararLinhaBalancoVertical(linhas: EntradaDaLinha[], finsCalculados: Record<string, string>) {
  const validas = linhas.filter(l => !l.marco && dataValida(l.inicio) &&
    dataValida(finsCalculados[l.codigo]) &&
    diaUtc(finsCalculados[l.codigo]) >= diaUtc(l.inicio) &&
    Number.isFinite(l.duracao) && l.duracao >= 1);
  const locais = Array.from(new Set(validas.map(l => String(l.pavimento ?? "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  const agrupados = new Map<string, SerieLob>();
  for (const l of validas) {
    // Frente/disciplina NÃO é unidade física: a LOB usa apenas o pavimento explicitamente cadastrado.
    const local = String(l.pavimento ?? "").trim();
    const nome = l.atividade.trim();
    if (!local || !nome) continue;
    // Mesmo nome em disciplinas distintas não forma automaticamente uma série de ritmo.
    const disciplina = String(l.frente ?? "").trim().toLocaleLowerCase("pt-BR");
    const chave = nome.toLocaleLowerCase("pt-BR") + (disciplina ? "|" + disciplina : "");
    if (!agrupados.has(chave)) agrupados.set(chave, { chave, nome, pontos: [], repetitiva: false });
    agrupados.get(chave)!.pontos.push({
      codigo: l.codigo, nome, local, inicio: l.inicio, fim: finsCalculados[l.codigo],
      executado: l.executado, quantidade: l.quantidade, unidade: l.unidade,
    });
  }
  const series = Array.from(agrupados.values()).map(serie => {
    const porLocal = new Set(serie.pontos.map(p => p.local));
    return { ...serie, repetitiva: porLocal.size >= 2 && porLocal.size === serie.pontos.length };
  }).sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR", {numeric:true}));
  return {
    locais, series,
    semLocal: validas.filter(l => !String(l.pavimento ?? "").trim()).length,
    descartadas: linhas.length - validas.length,
  };
}

/** Segmentos de calendário de verdade: não aproximar mês para 30 dias. */
export function faixasDeTempo(inicio: string, fim: string, escala: "mes" | "quinzena"): FaixaLob[] {
  if (!dataValida(inicio) || !dataValida(fim) || diaUtc(fim) < diaUtc(inicio)) return [];
  const cursor = new Date(diaUtc(inicio));
  cursor.setUTCDate(1);
  const limite = diaSeguinte(fim);
  const resultado: FaixaLob[] = [];
  for (let i = 0; i < 480 && cursor.getTime() < diaUtc(limite); i++) {
    const inicial = cursor.toISOString().slice(0,10);
    const proximo = new Date(cursor);
    if (escala === "mes") proximo.setUTCMonth(proximo.getUTCMonth() + 1, 1);
    else if (cursor.getUTCDate() === 1) proximo.setUTCDate(16);
    else { proximo.setUTCMonth(proximo.getUTCMonth() + 1, 1); }
    if (proximo.getTime() <= cursor.getTime()) break;
    resultado.push({inicio: inicial, fimExclusivo: proximo.toISOString().slice(0,10),
      rotulo: escala === "mes" ? rotuloMes(inicial) : inicial.slice(8,10)+"/"+inicial.slice(5,7)+"/"+inicial.slice(2,4)});
    cursor.setTime(proximo.getTime());
  }
  return resultado;
}

/** Quantidade de tarefas ativas num período/local. Nunca representa produtividade. */
export function ocupacaoNaFaixa(pontos: PontoLob[], local: string, faixa: FaixaLob): PontoLob[] {
  const inicio = diaUtc(faixa.inicio), fim = diaUtc(faixa.fimExclusivo);
  return pontos.filter(p => p.local === local && diaUtc(p.inicio) < fim && diaUtc(p.fim) >= inicio);
}
