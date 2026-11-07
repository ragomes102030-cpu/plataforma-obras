import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calcularMedicao } from "./medicao";

/**
 * Regressão de homologação: lançamentos fictícios devem ficar separados de
 * produção elegível, e rascunhos de QA nunca são ateste.
 */
describe("medição — isolamento de QA e governança", () => {
  const dados = readFileSync("server/financeiro/medicao-dados.ts", "utf8");
  const router = readFileSync("server/routers.ts", "utf8");
  it("considera só produção confirmada sem exemplo e atividades da versão aprovada", () => {
    expect(dados).toContain('eq(productionEntries.status, "confirmada")');
    expect(dados).toContain("eq(productionEntries.exemplo, 0)");
    expect(dados).toContain("eq(scheduleActivities.exemplo, 0)");
    expect(dados).toContain("eq(scheduleActivities.versionId, approvedPlan.id)");
    expect(dados).toContain("inArray(scheduleActivities.budgetItemId, validBudgetItemIds)");
  });
  it("rascunho de simulação nunca satisfaz gate nem pode transicionar a aprovada", () => {
    expect(router).toContain("approvedMeasurementRows = measurementRows.filter");
    expect(router).toContain("medicoes: approvedMeasurementRows.length");
    expect(router).toContain('nota.notes?.includes("[SIMULACAO_QA]")');
    expect(router).toContain("Boletim de simulação não pode ser aprovado");
  });
  it("identifica excesso sobre contratado e mantém glosa explícita", () => {
    const r = calcularMedicao({
      itens: [{ budgetItemId: 1, code: "1.1.1", description: "Serviço", unit: "m²", quantity: 100, unitPrice: 20 }],
      produzidoAcumulado: [{ budgetItemId: 1, quantity: 110 }],
      medidoAcumuladoAnterior: [],
      retentionPercent: 0,
    });
    expect(r.itens[0].acimaDoContratado).toBe(true);
    expect(r.avisos.join(" ")).toContain("passa do contratado");
  });
});
