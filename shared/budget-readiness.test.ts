import { describe, expect, it } from "vitest";
import { findBudgetApprovalBlockers } from "./budget-readiness";

describe("prontidao de aprovacao do orcamento", () => {
  it("bloqueia fonte didatica mesmo com preco preenchido", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.1", unitPrice: 100, source: "RATEIO UNIFORME DIDÁTICO — não representa custo real", quantityEvidence: "Memória QA", quantityEvidenceStatus: "cenario" }])).toEqual([{ code: "1.1", reason: "fonte_didatica" }, { code: "1.1", reason: "sem_vinculo_rastreavel" }]);
  });
  it("bloqueia preco e fonte ausentes", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.2", unitPrice: 0, source: "A preencher", quantityEvidence: "Memória QA", quantityEvidenceStatus: "cenario" }])).toEqual([{ code: "1.2", reason: "sem_preco" }, { code: "1.2", reason: "sem_fonte" }, { code: "1.2", reason: "sem_vinculo_rastreavel" }]);
  });
  it("aceita serviço oficial com quantitativo de cenário rastreável", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.3", unitPrice: "42.50", source: "SEINFRA-CE 028.1 / C1234", officialPriceItemId: 15, quantityEvidence: "Projeto hidrossanitário R03, prancha 014, TA, 2º e 3º pavimentos", quantityEvidenceStatus: "cenario" }])).toEqual([]);
  });
  it("bloqueia preço simbólico e fonte que declara preço oficial pendente", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.6.4", unitPrice: 1, source: "CENÁRIO QA — valor simbólico R$ 1,00; preço oficial pendente", officialPriceItemId: 75991, quantityEvidence: "Cenário QA rastreável", quantityEvidenceStatus: "cenario" }])).toEqual([
      { code: "1.6.4", reason: "fonte_pendente" },
    ]);
  });
  it("bloqueia preço digitado sem vínculo ou exceção de preço documentada", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.7", unitPrice: 350, source: "SEINFRA-CE 028.1", quantityEvidence: "Memória QA", quantityEvidenceStatus: "cenario" }])).toEqual([
      { code: "1.7", reason: "sem_vinculo_rastreavel" },
    ]);
  });
  it("aceita exceção de preço quando a fonte identifica proposta rastreável", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.8", unitPrice: 350, source: "Proposta fornecedor QA 2026-11-15, ref. Q-018", isPriceException: true, quantityEvidence: "Memória QA", quantityEvidenceStatus: "cenario" }])).toEqual([]);
  });
  it("bloqueia quantitativo sem evidência ou ainda pendente", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.4", unitPrice: 10, source: "SINAPI", quantityEvidence: " ", quantityEvidenceStatus: "pendente" }])).toEqual([
      { code: "1.4", reason: "sem_vinculo_rastreavel" },
      { code: "1.4", reason: "sem_evidencia_quantidade" },
      { code: "1.4", reason: "quantidade_pendente" },
    ]);
  });
  it("permite cenário rastreável sem tratá-lo como execução", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.5", unitPrice: 10, source: "SINAPI", compositionId: 91, quantityEvidence: "Memória de cenário QA, não é medição", quantityEvidenceStatus: "cenario" }])).toEqual([]);
  });
});
