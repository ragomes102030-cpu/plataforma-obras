import { describe, expect, it } from "vitest";
import { evaluateStageTransition, type StageGateEvidence } from "./stage-gates";

const validEvidence: StageGateEvidence = {
  hasDescription: true,
  eapNodeCount: 4,
  eapValid: true,
  eapDictionaryStandardApproved: true,
  eapDictionaryCompliant: true,
  eapApprovalReady: true,
  activityCount: 6,
  activitiesPlanned: 6,
  activitiesWithoutQuantity: 0,
  dependenciesValid: true,
  cpmValid: true,
  blockerCount: 0,
  costCoverageValid: true,
};

describe("stage gates", () => {
  it("avança somente para a próxima etapa quando todos os gates passam", () => {
    const result = evaluateStageTransition({
      currentStage: "EAP_PROPOSTA",
      targetStage: "EAP_REVISAO",
      decision: "approved",
      evidence: validEvidence,
    });

    expect(result.allowed).toBe(true);
    expect(result.nextStage).toBe("EAP_REVISAO");
    expect(result.checks.every(check => check.valid)).toBe(true);
  });


  it("bloqueia aprovação da EAP quando o padrão ou os campos obrigatórios estão pendentes", () => {
    const result = evaluateStageTransition({
      currentStage: "EAP_REVISAO",
      targetStage: "ATIVIDADES_PROPOSTA",
      decision: "approved",
      evidence: {
        ...validEvidence,
        eapDictionaryStandardApproved: false,
        eapDictionaryCompliant: false,
        eapApprovalReady: false,
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.checks.some(check => check.code === "eap_valid" && check.valid)).toBe(true);
    expect(result.checks.some(check => check.code === "eap_approval_ready" && !check.valid)).toBe(true);
  });

  it("impede saltar diretamente para uma etapa posterior", () => {
    const result = evaluateStageTransition({
      currentStage: "DESCRITIVO",
      targetStage: "CRONOGRAMA_PROPOSTO",
      decision: "approved",
      evidence: validEvidence,
    });

    expect(result.allowed).toBe(false);
    expect(result.errors.join(" ")).toContain("sequencial");
  });

  it("bloqueia aprovação quando a EAP ainda não existe", () => {
    const result = evaluateStageTransition({
      currentStage: "EAP_PROPOSTA",
      targetStage: "EAP_REVISAO",
      decision: "approved",
      evidence: { ...validEvidence, eapNodeCount: 0, eapValid: false },
    });

    expect(result.allowed).toBe(false);
    expect(result.checks.some(check => check.code === "eap_exists" && !check.valid)).toBe(true);
  });

  it("permite reabrir somente a etapa imediatamente anterior", () => {
    const allowed = evaluateStageTransition({
      currentStage: "CPM_VALIDADO",
      targetStage: "DEPENDENCIAS_PROPOSTA",
      decision: "reopen",
      evidence: validEvidence,
    });
    const denied = evaluateStageTransition({
      currentStage: "CPM_VALIDADO",
      targetStage: "EAP_PROPOSTA",
      decision: "reopen",
      evidence: validEvidence,
    });

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  it("bloqueia validação do CPM e captura de baseline quando o cálculo não é viável", () => {
    const evidence = { ...validEvidence, cpmValid: false };
    for (const [stage, target] of [
      ["DEPENDENCIAS_PROPOSTA", "CPM_VALIDADO"],
      ["CRONOGRAMA_PROPOSTO", "BASELINE_PROPOSTA"],
    ] as const) {
      const result = evaluateStageTransition({
        currentStage: stage, targetStage: target,
        decision: "approved", evidence,
      });
      expect(result.allowed).toBe(false);
      expect(result.checks.some(check => check.code === "cpm_valid" && !check.valid)).toBe(true);
    }
  });

  it("bloqueia baseline quando o dicionário obrigatório da EAP está incompleto", () => {
    const result = evaluateStageTransition({
      currentStage: "CRONOGRAMA_PROPOSTO",
      targetStage: "BASELINE_PROPOSTA",
      decision: "approved",
      evidence: { ...validEvidence, eapDictionaryCompliant: false },
    });

    expect(result.allowed).toBe(false);
    expect(result.checks.some(check => check.code === "eap_dictionary_compliant" && !check.valid)).toBe(true);
  });

  it("bloqueia baseline quando a cobertura de custo (regra dos 100%) falha", () => {
    const result = evaluateStageTransition({
      currentStage: "CRONOGRAMA_PROPOSTO",
      targetStage: "BASELINE_PROPOSTA",
      decision: "approved",
      evidence: { ...validEvidence, costCoverageValid: false },
    });

    expect(result.allowed).toBe(false);
    expect(
      result.checks.some(
        check => check.code === "cost_coverage_valid" && !check.valid
      )
    ).toBe(true);
  });

  it("não permite aprovação com bloqueador aberto", () => {
    const result = evaluateStageTransition({
      currentStage: "DESCRITIVO",
      targetStage: "EAP_PROPOSTA",
      decision: "approved",
      evidence: { ...validEvidence, blockerCount: 1 },
    });

    expect(result.allowed).toBe(false);
    expect(result.checks.find(check => check.code === "no_open_blockers")?.valid).toBe(false);
  });
});
