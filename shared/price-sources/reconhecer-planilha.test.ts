import { describe, expect, it } from "vitest";
import { reconhecerPlanilhaSeinfra, type PlanilhaSeinfra } from "./seinfra";

/**
 * A Tabela Unificada da SEINFRA-CE vem em três arquivos, e eles não são
 * intercambiáveis. Sem reconhecê-los, o importador devolvia "cabeçalho não
 * identificado" para o arquivo de Composições — verdadeiro e inútil — e
 * aceitava a Tabela de Insumos em silêncio, deixando o usuário com 11.828
 * itens e nenhuma EAP, sem aviso.
 *
 * Os trechos abaixo reproduzem o começo real de cada arquivo da 028.
 */

const COMPOSICOES: unknown[][] = [
  [null, "Relatório de Composições"],
  [null, "Tabela 028 - ENC. SOCIAIS"],
  ["C1802 - BOMBA CENTRÍFUGA D", null, null, null, null, null],
  ["MAO DE OBRA", null, "Unidade", "Coeficiente", "Preço", "Total"],
  ["I0043", "AJUDANTE DE ENCANADOR", "H", 8, 21.1, 168.8],
  [null, null, null, null, "Total:", 378.24],
  ["MATERIAIS", null, null, null, null, null],
  ["I0852", "BOMBA CENTRIFUGA P=1/4CV", "UN", 1, 457.81, 457.81],
  [null, null, "Total Simples:", null, null, 836.05],
  ["Encargos Sociais:", null, null, "INCLUSO"],
  ["Valor BDI:", null, null, 0],
  ["Valor Geral:", null, null, 836.05],
];

const INSUMOS: unknown[][] = [
  [null, null, "Tabela Unificada SEINFRA"],
  [null, null, "028 - ENC. SOCIAIS 114,15%"],
  ["Insumo", "Descrição", "Unidade", "Valor (R$)"],
  ["I8600", "ALMOXARIFE", "HxMÊS", 4965.16],
  ["I8599", "APONTADOR", "HxMÊS", 5104.16],
  ["G0409", "INSPETOR DE DUTOS N1-SNQC (CEGÁS)", "MÊS", 1200],
];

const SERVICOS: unknown[][] = [
  [null, null, "TABELA UNIFICADA SEINFRA"],
  [null, null, "028 - ENC. SOCIAIS 114,15%", "BDI: 0,00%"],
  ["ITEM", "CÓDIGO", "DESCRIÇÃO", null, null, "UNIDADE", "PREÇO UNITÁRIO"],
  ["1", "SERVICOS PRELIMINARES", null, null, null, null, 130764.04],
  ["1.1", "SONDAGENS", null, null, null, null, 6269.76],
  ["1.1.1", "C2820", "EXECUÇÃO DE SONDAGEM ELÉTRICA", null, null, "UN", 623.05],
  ["1.1.2", "C2818", "EXECUÇÃO DE SONDAGEM ELÉTRICA", null, null, "UN", 797.17],
];

describe("reconhecerPlanilhaSeinfra", () => {
  const casos: Array<[string, unknown[][], PlanilhaSeinfra]> = [
    ["Planos-de-Servicos", SERVICOS, "servicos"],
    ["Tabela-de-Insumos", INSUMOS, "insumos"],
    ["Composicoes", COMPOSICOES, "composicoes"],
    ["lixo", [["a", "b"], ["c", "d"]], "desconhecida"],
  ];

  for (const [nome, rows, esperado] of casos) {
    it(`reconhece ${nome} como "${esperado}"`, () => {
      expect(reconhecerPlanilhaSeinfra(rows), nome).toBe(esperado);
    });
  }

  it("reconhece o relatório de composições pelo título, mesmo sem o padrão de bloco", () => {
    // O título está na segunda coluna em algumas versões.
    expect(
      reconhecerPlanilhaSeinfra([[null, "Relatório de Composições"], [null, "Tabela 028"]])
    ).toBe("composicoes");
  });

  it("não confunde serviço com insumo pela letra do código", () => {
    // `I8600 ALMOXARIFE` e `G0409 INSPETOR` são insumo; `C2820` é serviço.
    // A distinção é o que decide se a EAP vai nascer.
    expect(reconhecerPlanilhaSeinfra(INSUMOS)).not.toBe("servicos");
    expect(reconhecerPlanilhaSeinfra(SERVICOS)).not.toBe("insumos");
  });
});
