import { describe, expect, it } from "vitest";
import { calcularProducaoQa } from "./qa-production-simulation";

const atividade = { valorOrcado: 10_000, quantidadePlanejada: 100 };

describe("calcularProducaoQa", () => {
  it("soma somente apontamentos QA confirmados, compatíveis e vinculados à versão atual", () => {
    const resultado = calcularProducaoQa([
      { status: "confirmada", exemplo: 0, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 80, data: "2026-11-22" },
      { status: "rascunho", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 80, data: "2026-11-22" },
      { status: "confirmada", exemplo: 1, unidadeCompativel: false, vinculo: "atual", codigo: "1.2.1", quantidade: 12, data: "2026-11-22" },
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "versao_anterior", codigo: "1.2.1", quantidade: 80, data: "2026-11-22" },
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 25, data: "2026-11-22" },
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 25, data: "2026-11-27" },
    ], new Map([["1.2.1", atividade]]), 10_000, "2026-11-25");

    expect(resultado).toMatchObject({
      valorAgregado: 2_500,
      percentual: 25,
      lancamentosValidos: 1,
      lancamentosUnidadeIncompativel: 1,
      lancamentosForaDaVersao: 1,
    });
    expect(resultado.pontos).toEqual([{ data: "2026-11-22", valorAcumulado: 2_500, percentual: 25 }]);
  });

  it("limita a quantidade somada ao planejado, mesmo em datas separadas", () => {
    const resultado = calcularProducaoQa([
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 60, data: "2026-11-22" },
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 80, data: "2026-11-23" },
    ], new Map([["1.2.1", atividade]]), 10_000, "2026-11-25");

    expect(resultado.valorAgregado).toBe(10_000);
    expect(resultado.percentual).toBe(100);
    expect(resultado.pontos.at(-1)).toEqual({ data: "2026-11-23", valorAcumulado: 10_000, percentual: 100 });
  });

  it("ignora quantidade sem vínculo, evidência de unidade ou data válida", () => {
    const resultado = calcularProducaoQa([
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "WBS-SEM-CUSTO", quantidade: 8, data: "2026-11-22" },
      { status: "confirmada", exemplo: 1, unidadeCompativel: true, vinculo: "atual", codigo: "1.2.1", quantidade: 8, data: "2026-02-30" },
    ], new Map([["1.2.1", atividade]]), 10_000, "2026-11-25");

    expect(resultado.valorAgregado).toBe(0);
    expect(resultado.lancamentosValidos).toBe(0);
    expect(resultado.pontos).toEqual([]);
  });
});
