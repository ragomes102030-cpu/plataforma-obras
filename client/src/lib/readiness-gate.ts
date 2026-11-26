import type { BloqueioProntidao, ResultadoProntidao } from "@shared/obra-readiness";

export type ContextoReadinessGate = "dashboard" | "cronograma" | "baseline" | "financeiro" | "linha-balanco";

export function primeiraBarreiraDoContexto(
  readiness: ResultadoProntidao,
  contexto: ContextoReadinessGate,
): BloqueioProntidao | null {
  if (contexto === "cronograma") return readiness.dominios.cronograma.bloqueios[0] ?? null;
  if (contexto === "baseline") return readiness.dominios.baseline.bloqueios[0] ?? null;
  if (contexto === "financeiro") return readiness.dominios.financeiro.bloqueios[0] ?? null;
  if (contexto === "linha-balanco") return readiness.dominios.linhaDeBalanco.bloqueios[0] ?? null;
  return readiness.dominios.cronograma.bloqueios[0] ?? readiness.primeiraBarreira;
}

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
  if (barreira.codigo.startsWith("MEDICAO_")) return "financeiro";
  return ABA_POR_ETAPA[barreira.impacta[0]] ?? "escopo";
}

export function rotuloDaBarreira(barreira: BloqueioProntidao, planejamentoLiberado: boolean): string {
  if (!planejamentoLiberado) return "GOVERNANÇA DO PLANEJAMENTO";
  if (barreira.codigo.startsWith("LOB_")) return "PLANEJAMENTO LIBERADO · LINHA DE BALANÇO EM REVISÃO";
  if (barreira.codigo.startsWith("MEDICAO_")) return "PLANEJAMENTO LIBERADO · MEDIÇÃO CONTRATUAL EM REVISÃO";
  if (barreira.impacta.includes("orcamento")) return "PLANEJAMENTO LIBERADO · CONTROLE FINANCEIRO EM REVISÃO";
  if (barreira.impacta.includes("baseline")) return "PLANEJAMENTO LIBERADO · BASELINE DE PRAZO PENDENTE";
  return "PLANEJAMENTO LIBERADO · PRÓXIMA ETAPA EM REVISÃO";
}
