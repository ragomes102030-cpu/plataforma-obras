import {
  nextCoordinatorStage,
  previousCoordinatorStage,
  stageIndex,
  type CoordinatorStage,
} from "../../shared/construction-stages";

export type StageGateEvidence = {
  hasDescription: boolean;
  eapNodeCount: number;
  eapValid: boolean;
  activityCount: number;
  dependenciesValid: boolean;
  cpmValid: boolean;
  blockerCount: number;
};

export type StageGateCheck = {
  code: string;
  label: string;
  valid: boolean;
};

export type StageTransitionInput = {
  currentStage: CoordinatorStage;
  targetStage?: CoordinatorStage;
  decision: "approved" | "partially_approved" | "rejected" | "reopen";
  evidence: StageGateEvidence;
};

export type StageTransitionResult = {
  allowed: boolean;
  nextStage: CoordinatorStage | null;
  checks: StageGateCheck[];
  errors: string[];
};

function checksForTarget(
  targetStage: CoordinatorStage,
  evidence: StageGateEvidence
): StageGateCheck[] {
  const common = [
    {
      code: "no_open_blockers",
      label: "Não existem bloqueadores abertos",
      valid: evidence.blockerCount === 0,
    },
  ];

  switch (targetStage) {
    case "EAP_PROPOSTA":
      return [
        ...common,
        {
          code: "descriptive_data",
          label: "O descritivo da obra possui informações mínimas",
          valid: evidence.hasDescription,
        },
      ];
    case "EAP_REVISAO":
      return [
        ...common,
        {
          code: "eap_exists",
          label: "A obra possui itens de EAP",
          valid: evidence.eapNodeCount > 0,
        },
        {
          code: "eap_valid",
          label: "A estrutura da EAP não possui erros",
          valid: evidence.eapValid,
        },
      ];
    case "ATIVIDADES_PROPOSTA":
      return [
        ...common,
        {
          code: "eap_valid",
          label: "A EAP está válida para receber atividades",
          valid: evidence.eapNodeCount > 0 && evidence.eapValid,
        },
      ];
    case "DEPENDENCIAS_PROPOSTA":
      return [
        ...common,
        {
          code: "activities_exist",
          label: "A obra possui atividades cadastradas",
          valid: evidence.activityCount > 0,
        },
      ];
    case "CPM_VALIDADO":
      return [
        ...common,
        {
          code: "activities_exist",
          label: "A obra possui atividades cadastradas",
          valid: evidence.activityCount > 0,
        },
        {
          code: "dependencies_valid",
          label: "As dependências não possuem ciclos ou referências inválidas",
          valid: evidence.dependenciesValid,
        },
        {
          code: "cpm_valid",
          label: "O caminho crítico pode ser calculado",
          valid: evidence.cpmValid,
        },
      ];
    case "CRONOGRAMA_PROPOSTO":
      return [
        ...common,
        {
          code: "cpm_valid",
          label: "O CPM foi validado antes do cronograma",
          valid: evidence.cpmValid,
        },
      ];
    case "BASELINE_PROPOSTA":
      return [
        ...common,
        {
          code: "cpm_valid",
          label: "O cronograma possui um CPM válido",
          valid: evidence.cpmValid,
        },
      ];
    case "GANTT_LOB_PROPOSTO":
      return [
        ...common,
        {
          code: "activities_exist",
          label: "Existem atividades para gerar Gantt e Linha de Balanço",
          valid: evidence.activityCount > 0,
        },
      ];
    case "CONTROLE":
      return [
        ...common,
        {
          code: "plan_ready",
          label: "O plano possui atividades e CPM válido",
          valid: evidence.activityCount > 0 && evidence.cpmValid,
        },
      ];
    case "DESCRITIVO":
      return [];
  }
}

export function evaluateStageTransition(
  input: StageTransitionInput
): StageTransitionResult {
  const targetStage = input.targetStage ?? input.currentStage;
  const currentIndex = stageIndex(input.currentStage);
  const targetIndex = stageIndex(targetStage);
  const errors: string[] = [];

  if (input.decision === "reopen") {
    const previous = previousCoordinatorStage(input.currentStage);
    if (!previous || targetStage !== previous) {
      errors.push("A reabertura só pode voltar para a etapa imediatamente anterior.");
    }
    return {
      allowed: errors.length === 0,
      nextStage: errors.length === 0 ? targetStage : input.currentStage,
      checks: [],
      errors,
    };
  }

  if (input.decision !== "approved") {
    if (targetStage !== input.currentStage) {
      errors.push("Uma decisão que não é aprovação não pode avançar a etapa.");
    }
    return {
      allowed: errors.length === 0,
      nextStage: input.currentStage,
      checks: [],
      errors,
    };
  }

  const expectedNext = nextCoordinatorStage(input.currentStage);
  if (!expectedNext) {
    errors.push("A obra já está na última etapa do fluxo.");
  } else if (targetStage !== expectedNext) {
    errors.push(
      `A etapa só pode avançar de forma sequencial para ${expectedNext}.`
    );
  }

  if (targetIndex <= currentIndex) {
    errors.push("Uma aprovação não pode retornar ou permanecer na etapa atual.");
  }

  const checks = expectedNext
    ? checksForTarget(expectedNext, input.evidence)
    : [];
  if (checks.some(check => !check.valid)) {
    errors.push("Um ou mais critérios obrigatórios do gate ainda não foram cumpridos.");
  }

  return {
    allowed: errors.length === 0,
    nextStage: errors.length === 0 ? targetStage : input.currentStage,
    checks,
    errors,
  };
}

export function describeStageGate(
  currentStage: CoordinatorStage,
  evidence: StageGateEvidence
) {
  const nextStage = nextCoordinatorStage(currentStage);
  if (!nextStage) {
    return {
      nextStage: null,
      checks: [],
      canAdvance: false,
      message: "Fluxo concluído; a obra está em controle.",
    };
  }
  const result = evaluateStageTransition({
    currentStage,
    targetStage: nextStage,
    decision: "approved",
    evidence,
  });
  return {
    nextStage,
    checks: result.checks,
    canAdvance: result.allowed,
    message: result.errors[0] ?? `Pronto para avançar para ${nextStage}.`,
  };
}
