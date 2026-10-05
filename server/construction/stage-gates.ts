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
  /** O padrão do dicionário da EAP precisa ter sido decidido antes da aprovação. */
  eapDictionaryStandardApproved: boolean;
  /** A EAP deve cumprir os campos obrigatórios do padrão aprovado. */
  eapDictionaryCompliant: boolean;
  /**
   * Atividades na grade. Diz que a folha foi puxada da EAP, e nada mais.
   */
  activityCount: number;
  /**
   * Atividades COM PRAZO: início informado e duração maior que zero.
   *
   * Esta é a distinção que faltava. O gate antigo só olhava `activityCount`, e
   * aprovava um cronograma inteiro de atividades com duração zero — cadeia de
   * sete atividades com zero dia tem CPM trivialmente válido, caminho crítico
   * calculado sobre nada. É a mesma estrutura que parece pronta que o seeder
   * criava com cinco dias inventados, agora com zero dias em vez de cinco.
   *
   * Duração zero é dado faltando, não prazo curto: é a diferença entre "a
   * pessoa não planejou ainda" e "a atividade cabe em um dia".
   */
  activitiesPlanned: number;
  /**
   * Atividades sem quantidade planejada. NÃO reprova o gate de cronograma.
   *
   * Medir quantidade é trabalho de campo, e reprovar o cronograma por isso
   * seria obrigar a inventar número antes de planejar — o defeito inverso, e
   * pior: leva a quantia medida a ser preenchida com estimativa.
   */
  activitiesWithoutQuantity: number;
  dependenciesValid: boolean;
  cpmValid: boolean;
  blockerCount: number;
  costCoverageValid: boolean;
};

export type StageGateCheck = {
  code: string;
  label: string;
  valid: boolean;
  /**
   * O que está faltando, em número. Vazio quando o gate passa.
   *
   * O gate que diz apenas "não tem atividades cadastradas" obriga a pessoa a
   * contar as atividades para saber quantas faltam. Com `detail`, ela lê.
   */
  detail?: string;
};

/** "3 de 7 atividades sem duração." */
function detalheDoPrazo(evidence: StageGateEvidence): string {
  const faltam = evidence.activityCount - evidence.activitiesPlanned;
  if (faltam <= 0) return "";
  return `${faltam} de ${evidence.activityCount} atividade${evidence.activityCount === 1 ? "" : "s"} sem duração informada.`;
}

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
        // Cobertura do dicionário é evidência de qualidade da EAP, não um
        // bloqueio estrutural para começar a planejar atividades. Campos como
        // responsável/local podem ainda ser preenchidos durante o detalhamento.
        // O gate continua exigindo EAP existente e estruturalmente válida.
      ];
    case "DEPENDENCIAS_PROPOSTA":
      return [
        ...common,
        {
          code: "activities_exist",
          label: "A obra possui atividades cadastradas",
          valid: evidence.activityCount > 0,
        },
        {
          code: "activities_planned",
          label: "Toda atividade tem início e duração informados",
          valid: evidence.activityCount > 0 && evidence.activitiesPlanned === evidence.activityCount,
          detail: detalheDoPrazo(evidence),
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
          // O gate que faltava. Uma cadeia com duração zero tem CPM válido —
          // caminho crítico calculado sobre nada — e o gate antigo aprovava
          // por causa disso. Agora ele reprova e diz quantas atividades estão
          // sem duração.
          code: "activities_planned",
          label: "Toda atividade tem duração informada",
          valid: evidence.activityCount > 0 && evidence.activitiesPlanned === evidence.activityCount,
          detail: detalheDoPrazo(evidence),
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
        {
          code: "cost_coverage_valid",
          label:
            "A EAP tem cobertura de custo de 100% (toda entrega tem orçamento, sem dupla contagem)",
          valid: evidence.costCoverageValid,
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
        {
          code: "cost_coverage_valid",
          label:
            "A EAP tem cobertura de custo de 100% antes de entrar em controle",
          valid: evidence.costCoverageValid,
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
  const failedChecks = result.checks.filter(check => !check.valid);
  const eapFailed = failedChecks.some(check =>
    check.code === "eap_exists" || check.code === "eap_valid"
  );
  const blockerFailed = failedChecks.some(check => check.code === "no_open_blockers");
  const firstSpecificFailure =
    failedChecks.find(check => check.detail)?.detail ??
    failedChecks.find(check => check.code !== "no_open_blockers")?.label ??
    null;

  let message = result.errors[0] ?? `Pronto para avançar para ${nextStage}.`;
  if (eapFailed) {
    message = "Proposta bloqueada por estrutura da EAP.";
  } else if (blockerFailed) {
    message = firstSpecificFailure
      ? `Etapa bloqueada por pendência: ${firstSpecificFailure}`
      : "Etapa bloqueada por pendência aberta.";
  } else if (firstSpecificFailure) {
    message = firstSpecificFailure;
  }

  return {
    nextStage,
    checks: result.checks,
    canAdvance: result.allowed,
    message,
  };
}
