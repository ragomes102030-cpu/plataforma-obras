import { describe, expect, it } from "vitest";
import { isPhysicalWeightQaEvidence, physicalWeightQaEvidence } from "./physical-weight-qa";

describe("premissa QA dos pesos físicos", () => {
  it("marca a justificativa como cenário sintético e mantém claro que não é medição", () => {
    const evidence = physicalWeightQaEvidence(1.16279, 86);
    expect(isPhysicalWeightQaEvidence(evidence)).toBe(true);
    expect(evidence).toMatch(/rateio uniforme entre 86 atividades/);
    expect(evidence).toMatch(/sem representar levantamento ou produção real/);
  });

  it("não confunde memória de cálculo real com premissa QA", () => {
    expect(isPhysicalWeightQaEvidence("Memória de cálculo FIS-001, revisão 2, critério por área medida.")).toBe(false);
    expect(isPhysicalWeightQaEvidence("premissa qa: rateio de teste sem medição real.")).toBe(true);
    expect(isPhysicalWeightQaEvidence(null)).toBe(false);
  });
});
