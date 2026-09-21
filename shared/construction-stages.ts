export const COORDINATOR_STAGES = [
  "DESCRITIVO",
  "EAP_PROPOSTA",
  "EAP_REVISAO",
  "ATIVIDADES_PROPOSTA",
  "DEPENDENCIAS_PROPOSTA",
  "CPM_VALIDADO",
  "CRONOGRAMA_PROPOSTO",
  "BASELINE_PROPOSTA",
  "GANTT_LOB_PROPOSTO",
  "CONTROLE",
] as const;

export type CoordinatorStage = (typeof COORDINATOR_STAGES)[number];

export const COORDINATOR_STAGE_LABELS: Record<CoordinatorStage, string> = {
  DESCRITIVO: "Descritivo",
  EAP_PROPOSTA: "EAP em proposta",
  EAP_REVISAO: "EAP em revisão",
  ATIVIDADES_PROPOSTA: "Atividades em proposta",
  DEPENDENCIAS_PROPOSTA: "Dependências em proposta",
  CPM_VALIDADO: "CPM validado",
  CRONOGRAMA_PROPOSTO: "Cronograma em proposta",
  BASELINE_PROPOSTA: "Baseline em proposta",
  GANTT_LOB_PROPOSTO: "Gantt / LOB em proposta",
  CONTROLE: "Controle",
};

export function stageIndex(stage: CoordinatorStage) {
  return COORDINATOR_STAGES.indexOf(stage);
}

export function nextCoordinatorStage(
  stage: CoordinatorStage
): CoordinatorStage | null {
  return COORDINATOR_STAGES[stageIndex(stage) + 1] ?? null;
}

export function previousCoordinatorStage(
  stage: CoordinatorStage
): CoordinatorStage | null {
  return COORDINATOR_STAGES[stageIndex(stage) - 1] ?? null;
}
