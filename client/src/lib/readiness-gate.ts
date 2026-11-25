import type { BloqueioProntidao } from "@shared/obra-readiness";

const ABA_POR_ETAPA = {
  escopo: "escopo",
  eap: "eap",
  orcamento: "financeiro",
  atividades: "atividades",
  rede: "dependencias",
  cpm: "cpm",
  baseline: "baseline",
  execucao: "producao",
} as const;

export function destinoDaBarreira(barreira: BloqueioProntidao): string {
  if (barreira.codigo.startsWith("LOB_")) return "linha-balanco";
  if (barreira.codigo.startsWith("MEDICAO_")) return "producao";
  return ABA_POR_ETAPA[barreira.impacta[0]] ?? "escopo";
}

export function rotuloDaBarreira(barreira: BloqueioProntidao, planejamentoLiberado: boolean): string {
  if (!planejamentoLiberado) return "GOVERNANÇA DO PLANEJAMENTO";
  if (barreira.codigo.startsWith("LOB_")) return "PLANEJAMENTO LIBERADO · LINHA DE BALANÇO EM REVISÃO";
  if (barreira.codigo.startsWith("MEDICAO_")) return "PLANEJAMENTO LIBERADO · EXECUÇÃO AGUARDA MEDIÇÃO";
  if (barreira.impacta.includes("orcamento")) return "PLANEJAMENTO LIBERADO · CONTROLE FINANCEIRO EM REVISÃO";
  if (barreira.impacta.includes("baseline")) return "PLANEJAMENTO LIBERADO · BASELINE DE PRAZO PENDENTE";
  return "PLANEJAMENTO LIBERADO · PRÓXIMA ETAPA EM REVISÃO";
}
