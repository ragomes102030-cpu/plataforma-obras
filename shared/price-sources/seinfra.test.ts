import { describe, expect, it } from "vitest";
import {
  extractReferenceHint,
  findHeaderRow,
  parsePtBrCurrency,
  parseSeinfraRows,
} from "./seinfra";

describe("parsePtBrCurrency", () => {
  it("entende milhar pt-BR com vírgula decimal", () => {
    expect(parsePtBrCurrency("1.234,56")).toBe(1234.56);
    expect(parsePtBrCurrency("1234,56")).toBe(1234.56);
    expect(parsePtBrCurrency("R$ 1.234,56")).toBe(1234.56);
    expect(parsePtBrCurrency("4.685,00")).toBe(4685);
  });

  it("aceita número nativo e en-US", () => {
    expect(parsePtBrCurrency(1510.9)).toBe(1510.9);
    expect(parsePtBrCurrency("1510.90")).toBe(1510.9);
  });

  it("rejeita lixo", () => {
    expect(parsePtBrCurrency("abc")).toBeNull();
    expect(parsePtBrCurrency("")).toBeNull();
    expect(parsePtBrCurrency(null)).toBeNull();
  });
});

describe("findHeaderRow — tolerância de layout", () => {
  it("acha cabeçalho com título acima (layout Seinfra típico)", () => {
    const rows: unknown[][] = [
      ["Tabela de Preço de Insumos"],
      ["Tabela 028.1 - ENC. SOCIAIS 84,44%"],
      [],
      ["Código", "Descrição", "Unidade", "VALOR"],
      ["I0001", "BLOCO", "UN", 5.5],
    ];
    expect(findHeaderRow(rows)?.rowIndex).toBe(3);
  });

  it("acha cabeçalho acentuado ou sem acento", () => {
    const rows: unknown[][] = [
      ["Codigo", "Descricao", "Unidade", "Preço unitario"],
      ["I1", "X", "M", 1],
    ];
    expect(findHeaderRow(rows)?.rowIndex).toBe(0);
  });

  it("não confunde linhas de dados com cabeçalho", () => {
    const rows: unknown[][] = [
      ["I7501", "10 SLOTS CHASSIS", "UN", "1.537,41"],
      ["Codigo", "Descrição", "Un.", "Valor"],
    ];
    expect(findHeaderRow(rows)?.rowIndex).toBe(1);
  });

  it("retorna null quando não há tabela", () => {
    expect(findHeaderRow([["nota"], ["qualquer coisa"]])).toBeNull();
  });
});

describe("parseSeinfraRows", () => {
  it("extrai insumos I... com itemType material/mao_de_obra", () => {
    const rows: unknown[][] = [
      ["Tabela de Insumos 028.1"],
      ["Código", "Descrição", "Unidade", "VALOR"],
      ["I0001", "BLOCO CIMENTO 14x19x39", "UN", "4,80"],
      ["I0038", "AJUDANTE GERAL", "H", "14,52"],
      ["I0031", "ADUBO ORGANICO", "M3", "142,00"],
      ["", "linha vazia", "UN", 1],
      ["I9999", "SEM PRECO", "UN", "n/d"],
    ];
    const result = parseSeinfraRows(rows, "Tabela-de-Insumos-028.1.xls");
    expect(result.records).toHaveLength(3);
    expect(result.records[0]).toMatchObject({
      code: "I0001",
      unit: "UN",
      unitPrice: 4.8,
      itemType: "material",
    });
    expect(result.records[1].itemType).toBe("mao_de_obra");
    expect(result.referenceHint).toBe("028.1");
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("extrai composições C... como servico (Planos-de-Servicos)", () => {
    const rows: unknown[][] = [
      ["Relatório de Composições"],
      ["Código", "Descrição", "Unidade", "Valor Unitário"],
      ["C2850", "INSTALACOES PROVISORIAS DE LUZ", "UN", "1.510,90"],
      ["C1000", "CONCRETO ESTRUTURAL FA X", "M3", "520,00"],
    ];
    const result = parseSeinfraRows(rows, "Planos-de-Servicos-028.1.xls");
    expect(result.records).toHaveLength(2);
    expect(result.records[0].itemType).toBe("servico");
    expect(result.records[0].unitPrice).toBe(1510.9);
    expect(result.records[1].unitPrice).toBe(520);
  });

  it("colunas em ordem diferente não quebram (sniff por nome)", () => {
    const rows: unknown[][] = [
      ["VALOR", "Unid", "Descrição", "Código"],
      ["9,90", "KG", "ARGAMASSA X", "I5000"],
    ];
    const result = parseSeinfraRows(rows, "x.xls");
    expect(result.records[0]).toMatchObject({
      code: "I5000",
      unit: "KG",
      unitPrice: 9.9,
    });
  });
});

describe("extractReferenceHint", () => {
  it("pega versão do nome do arquivo Seinfra", () => {
    expect(
      extractReferenceHint(
        "Tabela-de-Insumos-028.1---ENC.-SOCIAIS-84,44.xls"
      )
    ).toBe("028.1");
    expect(extractReferenceHint("precos-09-2026.xlsx")).toBe("09/2026");
    expect(extractReferenceHint("sem-referencia.xlsx")).toBeNull();
  });
});
