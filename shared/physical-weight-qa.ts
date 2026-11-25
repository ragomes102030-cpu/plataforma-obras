export const PHYSICAL_WEIGHT_QA_PREFIX = "Premissa QA:";

export function isPhysicalWeightQaEvidence(evidence: string | null | undefined): boolean {
  return evidence?.trim().toLocaleLowerCase("pt-BR").startsWith(PHYSICAL_WEIGHT_QA_PREFIX.toLocaleLowerCase("pt-BR")) ?? false;
}

export function physicalWeightQaEvidence(weight: number, activityCount: number): string {
  return `${PHYSICAL_WEIGHT_QA_PREFIX} peso de ${weight.toFixed(6)}% por rateio uniforme entre ${activityCount} atividades operacionais. Obra demonstrativa sem documentação de medição; cenário sintético para validar os indicadores, sem representar levantamento ou produção real.`;
}
