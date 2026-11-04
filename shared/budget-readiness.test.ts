import { describe, expect, it } from "vitest";
import { findBudgetApprovalBlockers } from "./budget-readiness";

describe("prontidao de aprovacao do orcamento", () => {
  it("bloqueia fonte didatica mesmo com preco preenchido", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.1", unitPrice: 100, source: "RATEIO UNIFORME DIDÁTICO — não representa custo real" }])).toEqual([{ code: "1.1", reason: "fonte_didatica" }]);
  });
  it("bloqueia preco e fonte ausentes", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.2", unitPrice: 0, source: "A preencher" }])).toEqual([{ code: "1.2", reason: "sem_preco" }, { code: "1.2", reason: "sem_fonte" }]);
  });
  it("aceita fonte identificada e preco positivo", () => {
    expect(findBudgetApprovalBlockers([{ code: "1.3", unitPrice: "42.50", source: "SEINFRA-CE 028.1 / C1234" }])).toEqual([]);
  });
});
