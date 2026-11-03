import { describe, expect, it } from "vitest";
import { avaliarPrazoDashboard } from "./prazo-dashboard";

const atual = { cpmCalculatedAt: "2026-11-03T12:00:00Z", updatedAt: "2026-11-03T11:00:00Z" };

describe("prazo no Dashboard", () => {
  it("não trata data de EAP em elaboração como prazo validado", () => {
    expect(avaliarPrazoDashboard({ fim: "2027-09-02", eapApproved: false, atividades: [atual] })).toEqual({
      confiavel: false,
      motivo: "EAP em elaboração",
    });
  });

  it("não valida prazo quando atividade foi alterada depois do CPM", () => {
    const resultado = avaliarPrazoDashboard({
      fim: "2027-09-02", eapApproved: true,
      atividades: [{ cpmCalculatedAt: "2026-11-03T10:00:00Z", updatedAt: "2026-11-03T11:00:00Z" }],
    });
    expect(resultado.confiavel).toBe(false);
    expect(resultado.motivo).toContain("CPM pendente ou desatualizado");
  });

  it("mostra prazo calculado apenas com EAP aprovada e CPM atual em todas as atividades", () => {
    expect(avaliarPrazoDashboard({ fim: "2027-09-02", eapApproved: true, atividades: [atual] }).confiavel).toBe(true);
    expect(avaliarPrazoDashboard({ fim: "2027-09-02", eapApproved: true, atividades: [atual, { cpmCalculatedAt: null, updatedAt: null }] }).confiavel).toBe(false);
  });
});
