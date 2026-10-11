import { describe, expect, it } from "vitest";
import {
  validarCoerenciaEngenharia,
  type AtividadeParaCoerencia,
  type ItemOrcamentoParaCoerencia,
  type ComposicaoParaCoerencia,
  type ObraParaCoerencia,
} from "./coerencia-engenharia";

/**
 * Estes testes usam os casos REAIS medidos na AURORA TESTE (OB-PUPOCN) em
 * 11/10/2026. Nao sao exemplos inventados: cada numero veio de consulta ao
 * banco de producao. Se o validador deixar de acusar algum deles, o defeito
 * voltou.
 */

const obraBase: ObraParaCoerencia = {
  projectId: 7,
  nome: "AURORA TESTE",
  tipoDeObra: "edificio",
  // Trecho real da descricao da obra: e daqui que sai o sistema construtivo.
  descricao: "A estrutura principal sera em concreto armado, incluindo fundacoes, pilares, vigas, lajes e demais elementos estruturais.",
  pavimentos: 6,
  areaTerreno: 2400,
};

function item(over: Partial<ItemOrcamentoParaCoerencia>): ItemOrcamentoParaCoerencia {
  return {
    code: "1.0",
    description: "Item",
    unit: "m2",
    quantity: 100,
    unitPrice: 10,
    compositionId: null,
    compositionCode: null,
    compositionDescription: null,
    compositionUnit: null,
    compositionUnitCost: null,
    somaComponentes: null,
    ...over,
  };
}

function composicao(over: Partial<ComposicaoParaCoerencia>): ComposicaoParaCoerencia {
  return {
    id: 1,
    code: "C0001",
    description: "Composicao",
    unit: "m2",
    status: "validada",
    somaComponentes: 0,
    componentesComPreco: 0,
    totalComponentes: 1,
    ...over,
  };
}

describe("coerencia de engenharia - natureza do servico", () => {
  it("acusa servico de escritorio (cadastro/desenho) vinculado a execucao de obra", () => {
    // Caso real: AURORA 1.13.2 "Drenagem externa" -> C0584 "CADASTRO DE REDE
    // DE ESGOTO/EMISSARIO/DRENAGEM (MEIO MAGNETICO)". Componentes: plotter,
    // computador, desenhista CAD, papel vegetal. R$ 1.448.016,50 = 28% do
    // orcamento total da obra.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.13.2",
          description: "Drenagem externa",
          unit: "m",
          quantity: 350,
          unitPrice: 4137.19,
          compositionId: 22195,
          compositionCode: "C0584",
          compositionDescription: "CADASTRO DE REDE DE ESGOTO/EMISSARIO/DRENAGEM (MEIO MAGNETICO)",
          compositionUnit: "M",
          compositionUnitCost: 4137.19,
          somaComponentes: 0,
        }),
      ],
      composicoes: [
        composicao({
          id: 22195,
          code: "C0584",
          description: "CADASTRO DE REDE DE ESGOTO/EMISSARIO/DRENAGEM (MEIO MAGNETICO)",
          unit: "M",
          somaComponentes: 0,
          componentesComPreco: 0,
          totalComponentes: 9,
        }),
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_natureza_servico_incompativel");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("error");
    expect(achado!.ref).toBe("1.13.2");
    expect(resultado.valid).toBe(false);
  });

  it("acusa alvenaria estrutural vinculada a elemento de concreto armado", () => {
    // Caso real: AURORA 1.4.1..1.4.4 e 1.6.1 -> C3270 (concreto fck=15 MPa)
    // com descricao de item "Alvenaria estrutural bloco concreto 19x19x39".
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.3",
          description: "Lajes - Alvenaria estrutural bloco concreto 19x19x39",
          unit: "m3",
          quantity: 320,
          unitPrice: 348.6,
          compositionId: 22988,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR., FCK=15MPa COM AGREGADO PRODUZIDO (S/ TRANSP.)",
          compositionUnit: "M3",
          compositionUnitCost: 348.6,
          somaComponentes: 91.99,
        }),
      ],
      composicoes: [
        composicao({
          id: 22988,
          code: "C3270",
          description: "CONCRETO P/VIBR., FCK=15MPa COM AGREGADO PRODUZIDO (S/ TRANSP.)",
          unit: "M3",
          somaComponentes: 91.99,
          componentesComPreco: 2,
          totalComponentes: 6,
        }),
      ],
    });

    const codes = resultado.issues.map(i => i.code);
    expect(codes).toContain("eng_sistema_construtivo_incompativel");
    expect(resultado.valid).toBe(false);
  });

  it("acusa concreto de baixa resistencia em elemento estrutural", () => {
    // fck=15 MPa e concreto de regularizacao. NBR 6118 exige >= 25 MPa para
    // elemento estrutural em classe de agressividade urbana (C30 usual).
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.1",
          description: "Pilares",
          unit: "m3",
          quantity: 80,
          unitPrice: 348.6,
          compositionId: 22988,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR., FCK=15MPa COM AGREGADO PRODUZIDO",
          compositionUnit: "M3",
          compositionUnitCost: 348.6,
          somaComponentes: 91.99,
        }),
      ],
      composicoes: [composicao({ id: 22988, code: "C3270", description: "CONCRETO P/VIBR., FCK=15MPa COM AGREGADO PRODUZIDO", unit: "M3", somaComponentes: 91.99, componentesComPreco: 2, totalComponentes: 6 })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_concreto_resistencia_insuficiente");
  });

  it("NAO acusa item de vedacao (alvenaria comum) como incompativel", () => {
    // Falso positivo que ja aconteceu: o termo "estrutura" casava dentro de
    // "estrutural", e itens de alvenaria passavam a ser tratados como elemento
    // de concreto. Alvenaria de vedacao e legitima numa obra de concreto.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.5.1",
          description: "Alvenarias de vedacao em bloco ceramico",
          unit: "m2",
          quantity: 4500,
          unitPrice: 125,
        }),
      ],
      composicoes: [],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_sistema_construtivo_incompativel");
  });

  it("NAO acusa composicao compativel (sem falso positivo)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.1",
          description: "Pilares em concreto armado",
          unit: "m3",
          quantity: 80,
          unitPrice: 520,
          compositionId: 900,
          compositionCode: "C3274",
          compositionDescription: "CONCRETO P/VIBR., FCK=30MPa COM AGREGADO PRODUZIDO",
          compositionUnit: "M3",
          compositionUnitCost: 520,
          somaComponentes: 518.4,
        }),
      ],
      composicoes: [composicao({ id: 900, code: "C3274", description: "CONCRETO P/VIBR., FCK=30MPa COM AGREGADO PRODUZIDO", unit: "M3", somaComponentes: 518.4, componentesComPreco: 6, totalComponentes: 6 })],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_concreto_resistencia_insuficiente");
    expect(resultado.issues.map(i => i.code)).not.toContain("eng_natureza_servico_incompativel");
  });
});

describe("coerencia de engenharia - preco", () => {
  it("acusa preco do item divergente da soma dos componentes da composicao", () => {
    // Caso real: item a R$ 348,60/m3, soma dos componentes = R$ 91,99/m3 (279%).
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.2",
          description: "Vigas",
          unit: "m3",
          quantity: 100,
          unitPrice: 348.6,
          compositionId: 22988,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR., FCK=15MPa",
          compositionUnit: "M3",
          compositionUnitCost: 348.6,
          somaComponentes: 91.99,
        }),
      ],
      composicoes: [composicao({ id: 22988, code: "C3270", description: "CONCRETO P/VIBR., FCK=15MPa", unit: "M3", somaComponentes: 91.99, componentesComPreco: 2, totalComponentes: 6 })],
    });

    const achado = resultado.issues.find(i => i.code === "eng_preco_sem_lastro");
    expect(achado).toBeDefined();
    expect(achado!.ref).toBe("1.4.2");
    expect(achado!.message).toMatch(/91,99|348,60/);
  });

  it("acusa composicao sem nenhum componente com preco", () => {
    // Caso real: 21.104 de 23.266 componentes com unitPriceSnapshot = 0.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.6.3",
          description: "Calhas, rufos e arremates",
          unit: "m",
          quantity: 140,
          unitPrice: 4193.78,
          compositionId: 23476,
          compositionCode: "C0387",
          compositionDescription: "BEIRA E BICA EM TELHA COLONIAL",
          compositionUnit: "M",
          compositionUnitCost: 4193.78,
          somaComponentes: 0,
        }),
      ],
      composicoes: [composicao({ id: 23476, code: "C0387", description: "BEIRA E BICA EM TELHA COLONIAL", unit: "M", somaComponentes: 0, componentesComPreco: 0, totalComponentes: 5 })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_composicao_sem_preco");
  });

  it("acusa custo por m2 muito abaixo da referencia de mercado", () => {
    // Caso real: R$ 5.193.043 para ~7.200 m2 = R$ 721/m2, ~26% do CUB comercial.
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200 },
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 5193043 })],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_custo_m2_abaixo_referencia");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("warning");
  });

  it("NAO acusa custo por m2 quando esta em faixa plausivel", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200 },
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 2800 })],
      composicoes: [],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_custo_m2_abaixo_referencia");
  });
});

describe("coerencia de engenharia - dimensao e sequencia", () => {
  it("acusa unidade divergente entre orcamento e cronograma", () => {
    // Caso real: 1.3.2 orcamento em 'm', cronograma em 'm3'.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.3.2", description: "Fundacoes", unit: "m", quantity: 220, unitPrice: 185 })],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.3.2", name: "Fundacoes", durationDays: 7, unit: "m3", plannedQuantity: 220, earlyStart: 12, earlyFinish: 19, critical: true },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_unidade_divergente");
    expect(achado).toBeDefined();
    expect(achado!.ref).toBe("1.3.2");
  });

  it("acusa superestrutura sem decomposicao por pavimento", () => {
    // Caso real: 6 pavimentos, estrutura em 4 atividades unicas de 8-9 dias
    // (34 dias no total) - sem repeticao por ciclo construtivo.
    const atividades: AtividadeParaCoerencia[] = [
      { id: 375, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3", plannedQuantity: 80, earlyStart: 19, earlyFinish: 27, critical: true },
      { id: 376, wbsCode: "1.4.2", name: "Vigas", durationDays: 9, unit: "m3", plannedQuantity: 100, earlyStart: 27, earlyFinish: 36, critical: true },
      { id: 377, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3", plannedQuantity: 320, earlyStart: 36, earlyFinish: 44, critical: true },
      { id: 378, wbsCode: "1.4.4", name: "Escadas", durationDays: 9, unit: "m3", plannedQuantity: 25, earlyStart: 44, earlyFinish: 53, critical: true },
    ];

    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades,
    });

    const achado = resultado.issues.find(i => i.code === "eng_estrutura_sem_ciclo_pavimento");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("error");
  });

  it("NAO acusa superestrutura quando ha decomposicao por pavimento", () => {
    const atividades: AtividadeParaCoerencia[] = [];
    const pavimentos = ["Terreo", "1o Pav", "2o Pav", "3o Pav", "4o Pav", "5o Pav", "Cobertura"];
    pavimentos.forEach((pav, i) => {
      atividades.push(
        { id: 100 + i * 4, wbsCode: `1.4.1.${i + 1}`, name: `Pilares ${pav}`, durationDays: 12, unit: "m3", plannedQuantity: 12, earlyStart: i * 20, earlyFinish: i * 20 + 12, critical: true },
        { id: 101 + i * 4, wbsCode: `1.4.2.${i + 1}`, name: `Vigas ${pav}`, durationDays: 12, unit: "m3", plannedQuantity: 15, earlyStart: i * 20 + 12, earlyFinish: i * 20 + 24, critical: true },
        { id: 102 + i * 4, wbsCode: `1.4.3.${i + 1}`, name: `Lajes ${pav}`, durationDays: 14, unit: "m3", plannedQuantity: 46, earlyStart: i * 20 + 24, earlyFinish: i * 20 + 38, critical: true },
        { id: 103 + i * 4, wbsCode: `1.4.4.${i + 1}`, name: `Escadas ${pav}`, durationDays: 6, unit: "m3", plannedQuantity: 4, earlyStart: i * 20 + 24, earlyFinish: i * 20 + 30, critical: false },
      );
    });

    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [], atividades });
    expect(resultado.issues.map(i => i.code)).not.toContain("eng_estrutura_sem_ciclo_pavimento");
  });

  it("acusa atividade de elemento superior comecando antes da fundacao", () => {
    // Caso real: 1.6.1 "Estrutura da cobertura" com earlyStart=0, igual a
    // mobilizacao, antes de qualquer fundacao (1.3.2 comeca no dia 12).
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades: [
        { id: 383, wbsCode: "1.6.1", name: "Estrutura da cobertura", durationDays: 6, unit: "m3", plannedQuantity: 18, earlyStart: 0, earlyFinish: 6, critical: false },
        { id: 373, wbsCode: "1.3.2", name: "Fundacoes", durationDays: 7, unit: "m3", plannedQuantity: 220, earlyStart: 12, earlyFinish: 19, critical: true },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_sequencia_construtiva_invertida");
    expect(achado).toBeDefined();
    expect(achado!.ref).toBe("1.6.1");
  });

  it("acusa atividades sem predecessor que deveriam ter", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades: [
        { id: 393, wbsCode: "1.9.1", name: "Portas e esquadrias", durationDays: 80, unit: "m2", plannedQuantity: 950, earlyStart: 0, earlyFinish: 80, critical: false, semPredecessor: true },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_atividade_sem_predecessor");
    expect(achado).toBeDefined();
    expect(achado!.ref).toBe("1.9.1");
  });

  it("NAO acusa mobilizacao nem servicos preliminares por comecarem no dia 0", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades: [
        { id: 366, wbsCode: "1.1.1", name: "Mobilizacao e canteiro", durationDays: 5, unit: "vb", plannedQuantity: 1, earlyStart: 0, earlyFinish: 5, critical: false, semPredecessor: true },
        { id: 369, wbsCode: "1.2.1", name: "Locacao e preparacao do terreno", durationDays: 3, unit: "m2", plannedQuantity: 2400, earlyStart: 0, earlyFinish: 3, critical: false, semPredecessor: true },
      ],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_atividade_sem_predecessor");
  });
});

describe("coerencia de engenharia - resumo", () => {
  it("conta erros e avisos e deriva o veredito", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200 },
      itens: [
        item({ code: "1.13.2", description: "Drenagem externa", unit: "m", quantity: 350, unitPrice: 4137.19, compositionId: 22195, compositionCode: "C0584", compositionDescription: "CADASTRO DE REDE DE ESGOTO/DRENAGEM (MEIO MAGNETICO)", compositionUnit: "M", compositionUnitCost: 4137.19, somaComponentes: 0 }),
      ],
      composicoes: [composicao({ id: 22195, code: "C0584", description: "CADASTRO DE REDE DE ESGOTO/DRENAGEM (MEIO MAGNETICO)", unit: "M", somaComponentes: 0, componentesComPreco: 0, totalComponentes: 9 })],
    });

    expect(resultado.resumo.erros).toBeGreaterThan(0);
    expect(resultado.valid).toBe(false);
    expect(resultado.resumo.porSeveridade.error).toBe(resultado.resumo.erros);
  });

  it("obra sem problemas fica valida e com resumo zerado", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200 },
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 2800, unit: "vb" })],
      composicoes: [],
      atividades: [],
    });

    expect(resultado.valid).toBe(true);
    expect(resultado.resumo.erros).toBe(0);
  });

  it("nao quebra com entradas vazias", () => {
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [] });
    expect(resultado.valid).toBe(true);
    expect(resultado.resumo.total).toBe(0);
  });
});
