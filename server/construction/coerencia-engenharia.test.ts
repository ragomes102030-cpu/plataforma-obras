import { describe, expect, it } from "vitest";
import {
  validarCoerenciaEngenharia,
  type AtividadeParaCoerencia,
  type ItemOrcamentoParaCoerencia,
  type ComposicaoParaCoerencia,
  type ObraParaCoerencia,
} from "./coerencia-engenharia";

/**
 * Casos derivados de dados REAIS medidos na AURORA TESTE (OB-PUPOCN) em
 * 11/10/2026, e das 22 cenas da auditoria externa (commit c5abc57).
 *
 * A revisao 2 corrigiu defeitos que so apareciam contra o app real. Os testes
 * abaixo travam cada um deles: se voltarem, quebram aqui.
 */

const obraBase: ObraParaCoerencia = {
  projectId: 7,
  nome: "AURORA TESTE",
  tipoDeObra: "edificio",
  descricao:
    "A estrutura principal sera em concreto armado, incluindo fundacoes, pilares, vigas, lajes e demais elementos estruturais.",
  pavimentos: 6,
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

describe("revisao 2 - PLURAL (o defeito que pegou por sorte de grafia)", () => {
  // Em portugues "cao" vira "coes": "fundacoes" NAO contem "fundacao".
  // A versao anterior usava palavra inteira e nao reconhecia Fundacoes,
  // Instalacoes, Pavimentacoes, Escavacoes — os nomes mais comuns de EAP.
  // O caso dos R$ 1,4 milhao foi pego porque "drenagem" e invariavel.

  it("acusa composicao de escritorio com item no PLURAL (Instalacoes)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.10.1",
          description: "Instalacoes hidrossanitarias",
          unit: "vb",
          quantity: 1,
          unitPrice: 1448016.5,
          compositionId: 22195,
          compositionCode: "C0584",
          compositionDescription: "CADASTRO DE REDE DE ESGOTO/DRENAGEM (MEIO MAGNETICO)",
          compositionUnit: "M",
        }),
      ],
      composicoes: [composicao({ id: 22195, code: "C0584", description: "CADASTRO DE REDE DE ESGOTO/DRENAGEM (MEIO MAGNETICO)", unit: "M" })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_natureza_servico_incompativel");
  });

  it("acusa resistencia insuficiente com item no PLURAL (Fundacoes)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.3.2",
          description: "Fundacoes",
          unit: "m3",
          quantity: 220,
          unitPrice: 185,
          compositionId: 1,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR., FCK=15MPa",
          compositionUnit: "M3",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C3270", description: "CONCRETO P/VIBR., FCK=15MPa", unit: "M3" })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_concreto_resistencia_insuficiente");
  });

  it("acusa com Pavimentacoes, Escavacoes e Impermeabilizacoes (plurais)", () => {
    for (const [codigo, nome] of [
      ["1.13.1", "Pavimentacoes externas"],
      ["1.3.1", "Escavacoes e movimento de terra"],
      ["1.7.2", "Impermeabilizacoes de areas molhadas"],
    ] as const) {
      const resultado = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [
          item({
            code: codigo,
            description: nome,
            unit: "m2",
            quantity: 100,
            unitPrice: 50,
            compositionId: 9,
            compositionCode: "C0584",
            compositionDescription: "CADASTRO DE REDE (MEIO MAGNETICO)",
            compositionUnit: "M2",
          }),
        ],
        composicoes: [composicao({ id: 9, code: "C0584", description: "CADASTRO DE REDE (MEIO MAGNETICO)", unit: "M2" })],
      });
      expect(resultado.issues.map(i => i.code), nome).toContain("eng_natureza_servico_incompativel");
    }
  });

  it("NAO volta o falso positivo de termo curto (aco dentro de instalacoes)", () => {
    // "instalacoes" contem "aco" como substring. Com radical de 4+ letras, a
    // deteccao de sistema nao confunde instalacao com estrutura metalica.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.10.1", description: "Instalacoes hidrossanitarias", unit: "vb", quantity: 1, unitPrice: 120000 })],
      composicoes: [],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_sistema_construtivo_incompativel");
  });
});

describe("revisao 2 - valorEmRisco separado por dominio", () => {
  it("achado de CRONOGRAMA nao joga dinheiro no valorEmRisco", () => {
    // Cena R10-02 da auditoria: UMA atividade sem predecessor, com codigo que
    // coincide com codigo de item de R$ 1.000.000, inflava o valor em risco.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.9.1", description: "Portas e esquadrias", unit: "m2", quantity: 1000, unitPrice: 1000 })],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.9.1", name: "Portas e esquadrias", durationDays: 80, unit: "m2", earlyStart: 0, earlyFinish: 80, semPredecessor: true },
      ],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_atividade_sem_predecessor");
    expect(resultado.resumo.valorEmRisco).toBe(0);
    expect(resultado.resumo.porDominio.cronograma).toBeGreaterThan(0);
  });

  it("achado de ORCAMENTO soma o valor do item", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.13.2",
          description: "Drenagem externa",
          unit: "m",
          quantity: 350,
          unitPrice: 4137.19,
          compositionId: 1,
          compositionCode: "C0584",
          compositionDescription: "CADASTRO DE REDE (MEIO MAGNETICO)",
          compositionUnit: "M",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C0584", description: "CADASTRO DE REDE (MEIO MAGNETICO)", unit: "M" })],
    });

    expect(resultado.resumo.valorEmRisco).toBeCloseTo(350 * 4137.19, 2);
    expect(resultado.resumo.porDominio.orcamento).toBeGreaterThan(0);
    expect(resultado.resumo.porDominio.cronograma).toBe(0);
  });
});

describe("revisao 2 - regra 9 roda com fundacao no dia 0", () => {
  it("acusa elemento superior antes do FIM da fundacao, mesmo com fundacao no dia 0", () => {
    // Antes exigia inicioFundacao > 0, entao o caso comum (fundacao no dia 0)
    // nao rodava. Agora compara com o fim da fundacao.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.3.2", name: "Fundacoes", durationDays: 7, unit: "m3", earlyStart: 0, earlyFinish: 7 },
        { id: 2, wbsCode: "1.6.1", name: "Estrutura da cobertura", durationDays: 6, unit: "m3", earlyStart: 0, earlyFinish: 6 },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_sequencia_construtiva_invertida");
    expect(achado).toBeDefined();
    expect(achado!.refs).toContain("1.6.1");
  });

  it("NAO acusa quando o elemento superior comeca depois da fundacao terminar", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.3.2", name: "Fundacoes", durationDays: 7, unit: "m3", earlyStart: 0, earlyFinish: 7 },
        { id: 2, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3", earlyStart: 7, earlyFinish: 15 },
      ],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_sequencia_construtiva_invertida");
  });
});

describe("revisao 2 - regra 8 nao fabrica numero de pavimentos", () => {
  it("com pavimentos declarados: acusa como error citando o numero", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, pavimentos: 6 },
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3" },
        { id: 2, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3" },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_estrutura_sem_ciclo_pavimento");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("error");
    expect(achado!.message).toContain("6 pavimentos");
  });

  it("SEM pavimentos declarados: acusa como warning sem afirmar numero", () => {
    // Antes o numero era fabricado e a mensagem afirmava "a obra tem 6
    // pavimentos" como se fosse dado. Sem o dado, nao se afirma o dado.
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, pavimentos: null },
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3" },
        { id: 2, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3" },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_estrutura_sem_ciclo_pavimento");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("warning");
    expect(achado!.message).toContain("nao consta da obra");
    expect(achado!.message).not.toMatch(/\b6 pavimentos\b/);
  });

  it("roda tambem quando tipoDeObra nao e edificio (reforma/ampliacao)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, tipoDeObra: "reforma", pavimentos: null },
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3" },
      ],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_estrutura_sem_ciclo_pavimento");
  });

  it("NAO acusa quando ha decomposicao por nivel", () => {
    const atividades: AtividadeParaCoerencia[] = [];
    for (let i = 1; i <= 6; i++) {
      atividades.push({ id: 100 + i, wbsCode: `1.4.1.${i}`, name: `Pilares Pav ${i}`, durationDays: 12, unit: "m3" });
    }
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [], atividades });
    expect(resultado.issues.map(i => i.code)).not.toContain("eng_estrutura_sem_ciclo_pavimento");
  });
});

describe("revisao 2 - regra 4: unidade separada de preco", () => {
  it("acusa UNIDADE divergente como achado proprio, nao como preco", () => {
    // Cena R4-03: item em "m" com composicao em "m3" era acusado de
    // "divergencia de 101%" de PRECO quando a causa era UNIDADE.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.3.2",
          description: "Fundacoes",
          unit: "m",
          quantity: 220,
          unitPrice: 185,
          compositionId: 1,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR.",
          compositionUnit: "M3",
          somaComponentes: 92,
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C3270", description: "CONCRETO P/VIBR.", unit: "M3", somaComponentes: 92, componentesComPreco: 6, totalComponentes: 6 })],
    });

    const codes = resultado.issues.map(i => i.code);
    expect(codes).toContain("eng_unidade_composicao_divergente");
    expect(codes).not.toContain("eng_preco_sem_lastro");
  });

  it("acusa preco quando as unidades batem e o valor diverge", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.2",
          description: "Vigas",
          unit: "m3",
          quantity: 100,
          unitPrice: 348.6,
          compositionId: 1,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR.",
          compositionUnit: "M3",
          somaComponentes: 91.99,
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C3270", description: "CONCRETO P/VIBR.", unit: "M3", somaComponentes: 91.99, componentesComPreco: 6, totalComponentes: 6 })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_preco_sem_lastro");
  });

  it("tolerancia estreita: 25% de divergencia acusa (projeto declara BDI 0%)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.0",
          description: "Servico",
          unit: "m2",
          quantity: 10,
          unitPrice: 125,
          compositionId: 1,
          compositionCode: "C1",
          compositionDescription: "Servico",
          compositionUnit: "M2",
          somaComponentes: 100,
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C1", description: "Servico", unit: "M2", somaComponentes: 100, componentesComPreco: 3, totalComponentes: 3 })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_preco_sem_lastro");
  });
});

describe("revisao 2 - regra 3 usa o piso correto (NBR 6118 admite C20)", () => {
  it("NAO acusa C20 (permitido pela NBR 6118 Tabela 7.1)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.1",
          description: "Pilares",
          unit: "m3",
          quantity: 80,
          unitPrice: 400,
          compositionId: 1,
          compositionCode: "C0842",
          compositionDescription: "CONCRETO P/VIBR., FCK 20 MPa",
          compositionUnit: "M3",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C0842", description: "CONCRETO P/VIBR., FCK 20 MPa", unit: "M3" })],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_concreto_resistencia_insuficiente");
  });

  it("acusa fck=15 em elemento estrutural", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.1",
          description: "Pilares",
          unit: "m3",
          quantity: 80,
          unitPrice: 348.6,
          compositionId: 1,
          compositionCode: "C3270",
          compositionDescription: "CONCRETO P/VIBR., FCK=15MPa",
          compositionUnit: "M3",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C3270", description: "CONCRETO P/VIBR., FCK=15MPa", unit: "M3" })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_concreto_resistencia_insuficiente");
  });
});

describe("revisao 2 - dedup de causa raiz e ruido", () => {
  it("agrupa varias atividades sem predecessor em UM achado com os codigos", () => {
    // Cena R10-01: 12 atividades sem vinculo geravam 12 achados com a mesma
    // redacao. Agora e um achado com a lista — mas SO quando ha rede parcial.
    // Aqui: 12 sem predecessor e 1 com (a rede existe, esta incompleta).
    const atividades: AtividadeParaCoerencia[] = Array.from({ length: 12 }, (_, i) => ({
      id: 400 + i,
      wbsCode: `1.9.${i + 1}`,
      name: `Servico ${i + 1}`,
      durationDays: 10,
      unit: "m2",
      earlyStart: 0,
      earlyFinish: 10,
      semPredecessor: true,
    }));
    atividades.push({ id: 500, wbsCode: "1.9.99", name: "Servico com rede", durationDays: 10, unit: "m2", semPredecessor: false });
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [], atividades });

    const achados = resultado.issues.filter(i => i.code === "eng_atividade_sem_predecessor");
    expect(achados).toHaveLength(1);
    expect(achados[0].refs).toHaveLength(12);
  });

  it("R10-03: NENHUMA atividade com predecessor vira achado de DADO, nao de engenharia", () => {
    // Sugestao da verificacao: se todas as atividades estao sem predecessor, o
    // problema nao e o cronograma — e o vinculo de versao. Acusar a obra pelo
    // encanamento faz o engenheiro ver 200 erros e desligar o validador.
    const atividades: AtividadeParaCoerencia[] = Array.from({ length: 40 }, (_, i) => ({
      id: 600 + i,
      wbsCode: `1.9.${i + 1}`,
      name: `Servico ${i + 1}`,
      durationDays: 10,
      unit: "m2",
      semPredecessor: true,
    }));
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [], atividades });

    const codes = resultado.issues.map(i => i.code);
    expect(codes).toContain("eng_dependencias_ausentes_para_a_versao");
    expect(codes).not.toContain("eng_atividade_sem_predecessor");

    const achado = resultado.issues.find(i => i.code === "eng_dependencias_ausentes_para_a_versao")!;
    expect(achado.message).toContain("vinculo de versao");
  });

  it("NAO acusa mobilizacao nem servicos preliminares por comecarem no dia 0", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.1.1", name: "Mobilizacao e canteiro", durationDays: 5, unit: "vb", earlyStart: 0, earlyFinish: 5, semPredecessor: true },
        { id: 2, wbsCode: "1.2.1", name: "Locacao e preparacao do terreno", durationDays: 3, unit: "m2", earlyStart: 0, earlyFinish: 3, semPredecessor: true },
      ],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_atividade_sem_predecessor");
  });
});

describe("revisao 2 - regra 2 nao acusa causa que nao observa", () => {
  it("mensagem descreve a divergencia, nao afirma a causa", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.4.3", description: "Lajes - Alvenaria estrutural bloco concreto", unit: "m3", quantity: 320, unitPrice: 348.6 })],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_sistema_construtivo_incompativel");
    expect(achado).toBeDefined();
    expect(achado!.message).not.toContain("semelhanca de texto");
  });

  it("NAO acusa quando a obra declara sistema MISTO", () => {
    // Cena R2-03: obra declarada mista acusava o item de alvenaria estrutural
    // que ela mesma declara.
    const resultado = validarCoerenciaEngenharia({
      obra: {
        ...obraBase,
        descricao: "Estrutura em concreto armado com paredes de alvenaria estrutural nas areas internas.",
      },
      itens: [item({ code: "1.5.1", description: "Alvenaria estrutural bloco ceramico", unit: "m2", quantity: 4500, unitPrice: 125 })],
      composicoes: [],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_sistema_construtivo_incompativel");
  });
});

describe("revisao 2 - regra 6: custo direto, e silencio declarado", () => {
  it("NAO roda sem area construida (e nao inventa)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: null },
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 5193043 })],
      composicoes: [],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_custo_m2_abaixo_referencia");
  });

  it("usa so custo direto: administracao e licenca nao entram no R$/m2", () => {
    // Com o total (incluindo administracao), o R$/m2 passaria do piso e a regra
    // ficaria silenciosa. Com so custo direto, acusa.
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200, areaConstruidaFonte: "informada pelo usuario" },
      itens: [
        item({ code: "1.1.2", description: "Administracao e controle da obra", unit: "vb", quantity: 1, unitPrice: 4000000 }),
        item({ code: "1.4.1", description: "Pilares", unit: "m3", quantity: 100, unitPrice: 500 }),
      ],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_custo_m2_abaixo_referencia");
    expect(achado).toBeDefined();
    expect(achado!.message).toContain("custo direto");
  });

  it("mensagem declara que o piso e heuristica", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200 },
      itens: [item({ code: "1.4.1", description: "Pilares", unit: "m3", quantity: 100, unitPrice: 500 })],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_custo_m2_abaixo_referencia");
    expect(achado!.message).toContain("heuristica");
  });
});

describe("revisao 2 - correcoes do reprodutor do Butler (22 cenas)", () => {
  it("R7-01: 'und' e 'un' sao a MESMA unidade (nao acusar)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.9.1", description: "Portas", unit: "und", quantity: 40, unitPrice: 1250 })],
      composicoes: [],
      atividades: [{ id: 400, wbsCode: "1.9.1", name: "Portas", durationDays: 10, unit: "un" }],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_unidade_divergente");
  });

  it("R7-01: 'm2' e 'm²' sao a mesma unidade (nao acusar)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.8.1", description: "Reboco", unit: "m²", quantity: 8000, unitPrice: 17 })],
      composicoes: [],
      atividades: [{ id: 1, wbsCode: "1.8.1", name: "Reboco", durationDays: 45, unit: "m2" }],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_unidade_divergente");
  });

  it("R7-01: unidades realmente diferentes AINDA sao acusadas", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.3.2", description: "Fundacoes", unit: "m", quantity: 220, unitPrice: 185 })],
      composicoes: [],
      atividades: [{ id: 1, wbsCode: "1.3.2", name: "Fundacoes", durationDays: 7, unit: "m3" }],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_unidade_divergente");
  });

  it("R5-01: composicao com 1 de 50 componentes com preco acusa (cobertura parcial)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [composicao({ id: 9400, code: "C9400", description: "QUASE TODA SEM PRECO", unit: "M3", somaComponentes: 12.5, componentesComPreco: 1, totalComponentes: 50 })],
    });

    const codes = resultado.issues.map(i => i.code);
    expect(codes).toContain("eng_composicao_preco_incompleto");
  });

  it("R5-01: composicao com cobertura suficiente NAO acusa", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [],
      composicoes: [composicao({ id: 1, code: "C1", description: "OK", unit: "M3", somaComponentes: 100, componentesComPreco: 5, totalComponentes: 6 })],
    });

    const codes = resultado.issues.map(i => i.code);
    expect(codes).not.toContain("eng_composicao_preco_incompleto");
    expect(codes).not.toContain("eng_composicao_sem_preco");
  });
});

describe("revisao 3 - achados da verificacao (R8-03, R6-03, R6-04)", () => {
  it("R8-03: o ramo de ERROR da regra 8 e ALCANCAVEL (com pavimentos declarados)", () => {
    // A versao anterior tinha as duas condicoes mutuamente exclusivas: o ramo de
    // error era inalcancavel. Aqui a obra DECLARA os pavimentos e nao ha
    // decomposicao — o caso que antes nunca chegava na regra.
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, pavimentos: 6 },
      itens: [],
      composicoes: [],
      atividades: [
        { id: 1, wbsCode: "1.4.1", name: "Pilares", durationDays: 8, unit: "m3" },
        { id: 2, wbsCode: "1.4.3", name: "Lajes", durationDays: 8, unit: "m3" },
      ],
    });

    const achado = resultado.issues.find(i => i.code === "eng_estrutura_sem_ciclo_pavimento");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("error");
  });

  it("R8-03: COM decomposicao, checa a duracao POR NIVEL (novo diagnostico)", () => {
    // Antes: ver o dado DESLIGAVA a regra. Agora o dado permite o diagnostico
    // que era impossivel emitir — "16 dias para 6 pavimentos e implausivel".
    const atividades: AtividadeParaCoerencia[] = [];
    for (let n = 1; n <= 6; n++) {
      atividades.push({ id: 100 + n, wbsCode: `1.4.3.${n}`, name: `Lajes Pav ${n}`, durationDays: 2, unit: "m3" });
    }
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [], atividades });

    const achado = resultado.issues.find(i => i.code === "eng_ciclo_pavimento_implausivel");
    expect(achado).toBeDefined();
    expect(achado!.severity).toBe("error");
    expect(achado!.message).toContain("2 dia");
  });

  it("R8-03: decomposicao com duracao plausivel NAO acusa", () => {
    const atividades: AtividadeParaCoerencia[] = [];
    for (let n = 1; n <= 6; n++) {
      atividades.push({ id: 100 + n, wbsCode: `1.4.3.${n}`, name: `Lajes Pav ${n}`, durationDays: 14, unit: "m3" });
    }
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [], atividades });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_ciclo_pavimento_implausivel");
    expect(resultado.issues.map(i => i.code)).not.toContain("eng_estrutura_sem_ciclo_pavimento");
  });

  it("R6-04: custoDireto explicito manda sobre a classificacao por texto", () => {
    // Cena R6-04: numa obra viaria, "Sinalizacao viaria" era classificada como
    // NAO-custo-direto pelo texto, e a obra era acusada de R$ 1.389/m2 quando
    // tinha R$ 1.528/m2. Com o campo explicito, a classificacao e do chamador.
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 10000 },
      itens: [
        item({ code: "1.13.4", description: "Sinalizacao viaria horizontal", unit: "m2", quantity: 10000, unitPrice: 1528, custoDireto: true }),
      ],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_custo_m2_abaixo_referencia");
    expect(achado).toBeUndefined();
  });

  it("R6-04: sem o campo, o fallback por texto ainda funciona", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 10000 },
      itens: [
        item({ code: "1.1.2", description: "Administracao e controle da obra", unit: "vb", quantity: 1, unitPrice: 5000000 }),
        item({ code: "1.4.1", description: "Pilares", unit: "m3", quantity: 100, unitPrice: 500 }),
      ],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_custo_m2_abaixo_referencia");
    expect(achado).toBeDefined();
  });
});

describe("revisao 2 - resumo", () => {
  it("conta por dominio e deriva o veredito", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.13.2",
          description: "Drenagem externa",
          unit: "m",
          quantity: 350,
          unitPrice: 4137.19,
          compositionId: 1,
          compositionCode: "C0584",
          compositionDescription: "CADASTRO DE REDE (MEIO MAGNETICO)",
          compositionUnit: "M",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C0584", description: "CADASTRO DE REDE (MEIO MAGNETICO)", unit: "M" })],
    });

    expect(resultado.valid).toBe(false);
    expect(resultado.resumo.porDominio.orcamento).toBeGreaterThan(0);
    expect(resultado.resumo.porSeveridade.error).toBe(resultado.resumo.erros);
  });

  it("obra sem problemas fica valida e zerada", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraBase, areaConstruida: 7200 },
      itens: [item({ code: "1.0", quantity: 1, unitPrice: 7200 * 2800, unit: "vb" })],
      composicoes: [],
      atividades: [],
    });

    expect(resultado.valid).toBe(true);
    expect(resultado.resumo.erros).toBe(0);
    expect(resultado.resumo.valorEmRisco).toBe(0);
  });

  it("nao quebra com entradas vazias", () => {
    const resultado = validarCoerenciaEngenharia({ obra: obraBase, itens: [], composicoes: [] });
    expect(resultado.valid).toBe(true);
    expect(resultado.resumo.total).toBe(0);
  });
});
