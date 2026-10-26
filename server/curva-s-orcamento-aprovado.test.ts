import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Guarda o contrato entre a Curva S e a versão aprovada do orçamento. */
const router = readFileSync("server/routers.ts", "utf-8");
const componente = readFileSync("client/src/components/AbaCurvaS.tsx", "utf-8");
const inicio = router.indexOf("    approvedForCurve: protectedProcedure");
const fim = router.indexOf("    list: protectedProcedure", inicio);
const consulta = router.slice(inicio, fim);

describe("Curva S: fonte de custo aprovada", () => {
  it("busca itens de orçamento aprovado, nunca rascunho mais recente", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    expect(consulta).toContain('eq(budgetVersions.status, "aprovado")');
    expect(consulta).toContain("eq(budgetItems.budgetVersionId, approved.id)");
  });
  it("a tela consome a consulta de versão aprovada", () => {
    expect(componente).toContain("trpc.budgets.approvedForCurve.useQuery");
    expect(componente).not.toContain("trpc.budgets.list.useQuery");
  });
});
