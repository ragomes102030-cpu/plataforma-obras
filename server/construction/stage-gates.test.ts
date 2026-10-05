import { describe, expect, it } from "vitest";
import { evaluateStageTransition, type StageGateEvidence } from "./stage-gates";

const validEvidence: StageGateEvidence = {
  hasDescription: true,
  eapNodeCount: 4,
  eapValid: true,
  eapDictionaryStandardApproved: true,
  eapDictionaryCompliant: true,
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


  it("permite iniciar atividades quando a EAP é válida mesmo com cobertura do dicionário pendente", () => {
    const result = evaluateStageTransition({
      currentStage: "EAP_REVISAO",
      targetStage: "ATIVIDADES_PROPOSTA",
      decision: "approved",
      evidence: {
        ...validEvidence,
        eapDictionaryStandardApproved: false,
        eapDictionaryCompliant: false,
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.checks.some(check => check.code === "eap_valid" && check.valid)).toBe(true);
    expect(result.checks.some(check => check.code === "eap_dictionary_standard_approved")).toBe(false);
    expect(result.checks.some(check => check.code === "eap_dictionary_compliant")).toBe(false);
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
