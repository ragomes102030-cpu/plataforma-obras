import { describe, expect, it } from "vitest";
import { findBudgetApprovalBlockers } from "./budget-readiness";

describe("prontidao de aprovacao do orcamento", () => {
  it("bloqueia fonte didatica mesmo com preco preenchido", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.1", unitPrice: 100, source: "RATEIO UNIFORME DIDÁTICO — não representa custo real", quantityEvidence: "Memória QA", quantityEvidenceStatus: "cenario" }])).toEqual([{ code: "1.1", reason: "fonte_didatica" }]);
  });
  it("bloqueia preco e fonte ausentes", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.2", unitPrice: 0, source: "A preencher", quantityEvidence: "Memória QA", quantityEvidenceStatus: "cenario" }])).toEqual([{ code: "1.2", reason: "sem_preco" }, { code: "1.2", reason: "sem_fonte" }]);
  });
  it("aceita fonte identificada e preco positivo", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.3", unitPrice: "42.50", source: "SEINFRA-CE 028.1 / C1234", quantityEvidence: "Projeto hidrossanitário R03, prancha 014, TA, 2º e 3º pavimentos", quantityEvidenceStatus: "cenario" }])).toEqual([]);
  });
  it("bloqueia quantitativo sem evidência ou ainda pendente", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.4", unitPrice: 10, source: "SINAPI", quantityEvidence: " ", quantityEvidenceStatus: "pendente" }])).toEqual([
      { code: "1.4", reason: "sem_evidencia_quantidade" },
      { code: "1.4", reason: "quantidade_pendente" },
    ]);
  });
  it("permite cenário rastreável sem tratá-lo como execução", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.5", unitPrice: 10, source: "SINAPI", quantityEvidence: "Memória de cenário v1", quantityEvidenceStatus: "cenario" }])).toEqual([]);
  });
});
