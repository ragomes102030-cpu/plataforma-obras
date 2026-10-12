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

  it("divergencia de 25% acusa mesmo sem BDI declarado — mas como CONFERENCIA", () => {
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

describe("revisao 3 - regra 4: BDI DECLARADO como entrada (R4-01)", () => {
  // A banda era simetrica em torno da razao 1,0 — isto e, centrada em BDI = 0%
  // em silencio. Um BDI de 25%, rotina em obra publica, caia fora e virava
  // ERROR em massa. O esperado agora e (1 + BDI declarado da obra).
  const cenario = (razao: number, bdiDeclarado?: number | null) => {
    const obra: ObraParaCoerencia =
      bdiDeclarado === undefined ? obraBase : { ...obraBase, bdiDeclarado };
    return validarCoerenciaEngenharia({
      obra,
      itens: [
        item({
          code: "1.0",
          description: "Servico",
          unit: "m2",
          quantity: 10,
          unitPrice: 100 * razao,
          compositionId: 1,
          compositionCode: "C1",
          compositionDescription: "Servico",
          compositionUnit: "M2",
          somaComponentes: 100,
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C1", description: "Servico", unit: "M2", somaComponentes: 100, componentesComPreco: 3, totalComponentes: 3 })],
    });
  };

  it("BDI declarado de 25% EXPLICA o preco: nao acusa (era o falso positivo)", () => {
    const resultado = cenario(1.25, 0.25);
    expect(resultado.issues.map(i => i.code)).not.toContain("eng_preco_sem_lastro");
  });

  it("BDI declarado: desvio de 60% (razao 1,60) continua sendo ERROR", () => {
    const achado = cenario(1.6, 0.25).issues.find(i => i.code === "eng_preco_sem_lastro");
    expect(achado?.severity).toBe("error");
    expect(achado?.message).toContain("BDI declarado de 25%");
  });

  it("SEM BDI declarado o achado e WARNING de conferencia, nunca error", () => {
    const achado = cenario(1.25, undefined).issues.find(i => i.code === "eng_preco_sem_lastro");
    expect(achado?.severity).toBe("warning");
    expect(achado?.message).toContain("NAO declara BDI");
  });

  it("conferencia sem BDI declarado NAO entra no valor em risco", () => {
    expect(cenario(1.25, undefined).resumo.valorEmRisco).toBe(0);
    expect(cenario(1.6, 0.25).resumo.valorEmRisco).toBeGreaterThan(0);
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

describe("revisao 3 - R1-03: o vocabulario de escritorio era fechado demais", () => {
  it("acusa 'ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO'", () => {
    // Cena R1-03: o item tem radical de EXECUCAO ("drenagem") e a composicao e
    // de servico de projeto. A lista so tinha "projeto executivo" e "projeto
    // basico" — "projeto" sozinho nao estava, e a regra nao rodava.
    const desc = "ELABORACAO DE PROJETO DE DRENAGEM - SERVICO TECNICO SEM EXECUCAO";
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
          compositionCode: "C9001",
          compositionDescription: desc,
          compositionUnit: "M",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C9001", description: desc, unit: "M" })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_natureza_servico_incompativel");
  });

  it("cobre os servicos de escritorio que faltavam (sondagem, ensaio, laudo, consultoria, supervisao, plotagem)", () => {
    for (const desc of [
      "SONDAGEM A PERCUSSAO SPT",
      "ENSAIO DE COMPACTACAO",
      "LAUDO TECNICO DE VIZINHANCA",
      "CONSULTORIA DE GESTAO DE OBRAS",
      "SUPERVISAO TECNICA DE OBRA",
      "PLOTAGEM E IMPRESSAO DE PLANTAS",
    ]) {
      const resultado = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [
          item({
            code: "1.3.1",
            description: "Escavacoes e movimento de terra",
            unit: "m3",
            quantity: 10,
            unitPrice: 50,
            compositionId: 1,
            compositionCode: "C9",
            compositionDescription: desc,
            compositionUnit: "m3",
          }),
        ],
        composicoes: [composicao({ id: 1, code: "C9", description: desc, unit: "m3" })],
      });
      expect(resultado.issues.map(i => i.code), desc).toContain("eng_natureza_servico_incompativel");
    }
  });

  it("R1-04 (ABERTO POR DECISAO): composicao de EXECUCAO que cita 'projeto executivo' segue acusada", () => {
    // Trava o falso positivo conhecido que NAO foi corrigido nesta rodada, para
    // que a pendencia seja consciente: o texto nao separa "o projeto" (assunto)
    // de "projetar" (servico). Foi por isso que "projeto" puro NAO entrou na
    // lista — entrar sem um negativo que separe os casos so pioraria esta cena.
    const desc = "INSTALACAO DE AGUA FRIA - EXECUCAO INCLUSIVE PROJETO EXECUTIVO E AS BUILT";
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.10.1",
          description: "Instalacoes hidrossanitarias",
          unit: "vb",
          quantity: 1,
          unitPrice: 120000,
          compositionId: 1,
          compositionCode: "C9",
          compositionDescription: desc,
          compositionUnit: "VB",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C9", description: desc, unit: "VB" })],
    });

    expect(resultado.issues.map(i => i.code)).toContain("eng_natureza_servico_incompativel");
  });
});

describe("revisao 3 - R2-01: obra sem o sistema na descricao nao desliga mais a regra 2", () => {
  const obraSilenciosa: ObraParaCoerencia = {
    projectId: 7,
    nome: "OBRA SEM DESCRICAO TECNICA",
    tipoDeObra: "edificio",
    descricao: "Obra de reforma e ampliacao do bloco administrativo.",
    pavimentos: 6,
  };

  it("infere o sistema da maioria dos itens e acusa o item divergente", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraSilenciosa,
      itens: [
        item({ code: "1.4.1", description: "Pilares em concreto armado", unit: "m3", quantity: 100, unitPrice: 800 }),
        item({ code: "1.4.2", description: "Vigas em concreto armado", unit: "m3", quantity: 100, unitPrice: 800 }),
        item({ code: "1.4.3", description: "Lajes em concreto armado", unit: "m3", quantity: 100, unitPrice: 800 }),
        item({ code: "1.5.1", description: "Alvenaria estrutural em bloco de concreto 19x19x39", unit: "m2", quantity: 100, unitPrice: 90 }),
      ],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_sistema_construtivo_incompativel");
    expect(achado).toBeDefined();
    expect(achado?.message).toContain("inferido da maioria dos itens");
    expect(achado?.refs).toEqual(["1.5.1"]);
  });

  it("a descricao da obra tem PRECEDENCIA sobre a inferencia", () => {
    // A descricao declara ALVENARIA e os itens sao de concreto: a divergencia e
    // do item, e a mensagem nao pode dizer que inferiu (nao inferiu).
    const resultado = validarCoerenciaEngenharia({
      obra: { ...obraSilenciosa, descricao: "Estrutura em alvenaria estrutural." },
      itens: [item({ code: "1.4.1", description: "Pilares em concreto armado", unit: "m3", quantity: 10, unitPrice: 800 })],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_sistema_construtivo_incompativel");
    expect(achado).toBeDefined();
    expect(achado?.message).not.toContain("inferido");
    expect(achado?.message).toContain("alvenaria estrutural");
  });

  it("sem descricao e sem itens que declarem sistema: AVISA que nao pode avaliar (nao fica silenciosa)", () => {
    // Fechamento do R2-01: ausencia de achado nao pode ser lida como coerencia.
    const resultado = validarCoerenciaEngenharia({
      obra: obraSilenciosa,
      itens: [item({ code: "1.1.1", description: "Administracao e controle da obra", unit: "vb", quantity: 1, unitPrice: 100000 })],
      composicoes: [],
    });

    const codes = resultado.issues.map(i => i.code);
    expect(codes).not.toContain("eng_sistema_construtivo_incompativel");
    expect(codes).toContain("eng_sistema_construtivo_nao_avaliavel");
  });

  it("o aviso de nao-avaliavel e WARNING, nunca error: falta de dado nao bloqueia a obra", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraSilenciosa,
      itens: [item({ code: "1.1.1", description: "Administracao e controle da obra", unit: "vb", quantity: 1, unitPrice: 100000 })],
      composicoes: [],
    });

    const achado = resultado.issues.find(i => i.code === "eng_sistema_construtivo_nao_avaliavel");
    expect(achado?.severity).toBe("warning");
    expect(resultado.valid).toBe(true);
  });

  it("nao avisa nada quando o sistema e declara na descricao ou inferivel dos itens", () => {
    const porDescricao = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [item({ code: "1.1.1", description: "Administracao e controle da obra", unit: "vb", quantity: 1, unitPrice: 100000 })],
      composicoes: [],
    });
    const porInferencia = validarCoerenciaEngenharia({
      obra: obraSilenciosa,
      itens: [item({ code: "1.4.1", description: "Pilares em concreto armado", unit: "m3", quantity: 10, unitPrice: 800 })],
      composicoes: [],
    });

    expect(porDescricao.issues.map(i => i.code)).not.toContain("eng_sistema_construtivo_nao_avaliavel");
    expect(porInferencia.issues.map(i => i.code)).not.toContain("eng_sistema_construtivo_nao_avaliavel");
  });
});

describe("revisao 3 - R3-03: item chamado apenas 'Estrutura' passa pela regra de fck", () => {
  it("acusa FCK insuficiente em item nomeado apenas 'Estrutura'", () => {
    // Cena R3-03: "Estrutura" nao casava com nenhum radical especifico (pilar,
    // viga, laje, sapata...) e a checagem de fck era PULADA — o falso negativo
    // era silencioso justamente no item mais estrutural da EAP.
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.0",
          description: "Estrutura",
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

  it("continua silencioso quando a composicao NAO cita concreto (o alargamento e contido)", () => {
    const resultado = validarCoerenciaEngenharia({
      obra: obraBase,
      itens: [
        item({
          code: "1.4.0",
          description: "Estrutura metalica da cobertura",
          unit: "kg",
          quantity: 1000,
          unitPrice: 20,
          compositionId: 1,
          compositionCode: "C1",
          compositionDescription: "PERFIL METALICO SOLDADO",
          compositionUnit: "KG",
        }),
      ],
      composicoes: [composicao({ id: 1, code: "C1", description: "PERFIL METALICO SOLDADO", unit: "KG" })],
    });

    expect(resultado.issues.map(i => i.code)).not.toContain("eng_concreto_resistencia_insuficiente");
  });
});

/**
 * COBERTURA POR REGRA — declaracao de ALCANCE, nao achado.
 *
 * O defeito de origem: "sem achado" era indistinguivel de "conferido". Na AURORA,
 * 35 de 53 itens (66%) nao tem composicao vinculada — a regra de preco conferiu 18
 * e as outras 35 nao foram reprovadas, nao foram CONFERIDAS. O painel dizia
 * "Nenhuma incoerencia encontrada" e o engenheiro lia como obra coerente.
 *
 * Cada regra declara quantos itens conseguiu avaliar e quantos ficaram fora, com o
 * motivo NOMEADO (nunca "nao aplicavel"). Ha um teste por motivo de exclusao.
 * Nada aqui toca no dado nem muda severidade.
 */
describe("cobertura por regra (alcance declarado, nao achado)", () => {
  type Resultado = ReturnType<typeof validarCoerenciaEngenharia>;

  const obraSemSistema: ObraParaCoerencia = {
    projectId: 7,
    nome: "OBRA SEM SISTEMA DECLARADO",
    tipoDeObra: "edificio",
    descricao: "Obra civil de reforma e ampliacao.",
  };

  function ativ(over: Partial<AtividadeParaCoerencia>): AtividadeParaCoerencia {
    return { id: 1, wbsCode: "1.1.1", name: "Atividade", durationDays: 10, unit: "m3", ...over };
  }

  function alcance(r: Resultado, n: number) {
    const c = r.resumo.cobertura.find(x => x.regra.startsWith(`${n}.`));
    if (!c) throw new Error(`a regra ${n} nao registrou cobertura`);
    return c;
  }

  /** O motivo NOMEADO tem de estar presente na cobertura da regra. */
  function esperaMotivo(r: Resultado, n: number, motivo: string) {
    const c = alcance(r, n);
    const m = c.motivos.find(x => x.motivo === motivo);
    expect(m, `motivo "${motivo}" ausente na regra ${n}: ${JSON.stringify(c.motivos)}`).toBeDefined();
    return c;
  }

  const cenarioCheio = () => ({
    obra: { ...obraBase, areaConstruida: 4800 },
    itens: [
      item({ code: "1.1.1", description: "Escavacao", unit: "m3", quantity: 100, unitPrice: 50 }),
      item({
        code: "1.4.1", description: "Pilares", unit: "m3", quantity: 10, unitPrice: 2000,
        compositionId: 1, compositionCode: "C1", compositionDescription: "CONCRETO FCK=25MPa",
        compositionUnit: "M3", somaComponentes: 1900,
      }),
    ],
    composicoes: [composicao({ id: 1, code: "C1", description: "CONCRETO FCK=25MPa", unit: "M3", totalComponentes: 2, componentesComPreco: 2 })],
    atividades: [
      ativ({ id: 1, wbsCode: "1.3.2", name: "Fundacao", earlyStart: 1, earlyFinish: 20 }),
      ativ({ id: 2, wbsCode: "1.4.1", name: "Estrutura", earlyStart: 25, earlyFinish: 60 }),
    ],
  });

  it("o resumo expoe cobertura para TODAS as 10 regras, com a forma combinada", () => {
    const r = validarCoerenciaEngenharia(cenarioCheio());
    expect(r.resumo.cobertura).toHaveLength(10);
    for (const c of r.resumo.cobertura) {
      expect(typeof c.regra).toBe("string");
      expect(typeof c.total).toBe("number");
      expect(typeof c.avaliados).toBe("number");
      expect(typeof c.fora).toBe("number");
      expect(["itens", "composicoes", "atividades"]).toContain(c.universo);
      expect(c).toHaveProperty("motivo");
      expect(Array.isArray(c.motivos)).toBe(true);
    }
  });

  it("toda regra fecha a conta: avaliados + fora === total", () => {
    const r = validarCoerenciaEngenharia(cenarioCheio());
    for (const c of r.resumo.cobertura) {
      expect(c.avaliados + c.fora, `${c.regra}: ${c.avaliados} + ${c.fora} != ${c.total}`).toBe(c.total);
      // e o total declarado e o tamanho real do universo daquela regra
      const universo = c.universo === "itens" ? 2 : c.universo === "composicoes" ? 1 : 2;
      expect(c.total, c.regra).toBe(universo);
    }
  });

  it("motivo de exclusao e sempre NOMEADO — nunca generico, nunca vazio", () => {
    const GENERICOS = ["nao aplicavel", "n/a", "outros", "diversos", "generico", "varios"];
    const r = validarCoerenciaEngenharia(cenarioCheio());
    for (const c of r.resumo.cobertura) {
      if (c.fora > 0) {
        expect(c.motivo, `${c.regra} tem ${c.fora} fora mas motivo nulo`).toBeTruthy();
        expect(GENERICOS).not.toContain(c.motivo);
        expect(c.motivo!.length).toBeGreaterThan(8);
      }
      for (const m of c.motivos) {
        expect(m.itens).toBeGreaterThan(0);
        expect(GENERICOS).not.toContain(m.motivo);
      }
      expect(c.motivos.reduce((s, m) => s + m.itens, 0)).toBe(c.fora);
    }
  });

  it("'fora' de verdade: 35 de 53 sem composicao vinculada (o caso AURORA, em miniatura)", () => {
    // 53 itens, 18 com composicao: a regra de preco avalia 18 e declara 35 fora.
    const itens = Array.from({ length: 53 }, (_, i) =>
      i < 18
        ? item({ code: `${i}`, description: `Servico ${i}`, unit: "m3", unitPrice: 100, compositionId: 100 + i, compositionUnit: "M3", somaComponentes: 100 })
        : item({ code: `${i}`, description: `Servico ${i}`, unit: "m3", unitPrice: 100 }),
    );
    const composicoes = Array.from({ length: 18 }, (_, i) =>
      composicao({ id: 100 + i, code: `C${i}`, unit: "M3", totalComponentes: 1, componentesComPreco: 1 }),
    );

    const r = validarCoerenciaEngenharia({ obra: obraBase, itens, composicoes });
    const c = alcance(r, 4);
    expect(c.total).toBe(53);
    expect(c.avaliados).toBe(18);
    expect(c.fora).toBe(35);
    expect(c.motivo).toBe("sem composicao vinculada");
    expect(c.motivos.find(m => m.motivo === "sem composicao vinculada")?.itens).toBe(35);
  });

  describe("regra 1 - natureza do servico", () => {
    it("motivo: sem composicao vinculada", () => {
      const r = validarCoerenciaEngenharia({ obra: obraBase, itens: [item({ code: "1.1.1", description: "Escavacao" })], composicoes: [] });
      const c = alcance(r, 1);
      expect(c.total).toBe(1);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("sem composicao vinculada");
    });

    it("motivo: composicao nao encontrada", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", compositionId: 99, compositionCode: "C99" })],
        composicoes: [],
      });
      expect(alcance(r, 1).motivo).toBe("composicao nao encontrada");
    });

    it("motivo: composicao sem descricao", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", compositionId: 5 })],
        composicoes: [composicao({ id: 5, code: "C5", description: "" })],
      });
      const c = alcance(r, 1);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("composicao sem descricao");
    });
  });

  describe("regra 2 - sistema construtivo", () => {
    it("motivo: obra sem sistema construtivo declarado nem inferivel", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraSemSistema,
        itens: [item({ code: "1.1.1", description: "Servicos preliminares" })],
        composicoes: [],
      });
      const c = alcance(r, 2);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("obra sem sistema construtivo declarado nem inferivel");
    });

    it("motivo: obra declara sistema misto (nao avalia por decisao)", () => {
      const r = validarCoerenciaEngenharia({
        obra: { ...obraBase, descricao: "Estrutura em concreto armado com alvenaria estrutural nas vedacoes." },
        itens: [item({ code: "1.1.1", description: "Servicos preliminares" })],
        composicoes: [],
      });
      const c = alcance(r, 2);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("obra declara sistema misto: a regra nao avalia por decisao");
    });

    it("motivo: item sem sistema construtivo reconhecivel", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Servicos preliminares" })],
        composicoes: [],
      });
      const c = alcance(r, 2);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("item sem sistema construtivo reconhecivel");
    });

    it("motivo: item declara sistema misto (nao comparavel a um sistema unico)", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Bloco em concreto armado com alvenaria estrutural" })],
        composicoes: [],
      });
      const c = alcance(r, 2);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("item declara sistema misto (nao comparavel a um sistema unico)");
    });

    it("quando a regra avalia, os itens deixam de aparecer como fora", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [
          item({ code: "1.4.1", description: "Pilares em concreto armado", unit: "m3", quantity: 10, unitPrice: 800 }),
          item({ code: "1.1.1", description: "Servicos preliminares" }),
        ],
        composicoes: [],
      });
      const c = alcance(r, 2);
      expect(c.avaliados).toBe(1);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("item sem sistema construtivo reconhecivel");
    });
  });

  describe("regra 3 - resistencia do concreto", () => {
    it("motivo: item nao e elemento estrutural (item fora da regra, com ou sem composicao)", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.9.1", description: "Pintura acrilica" })],
        composicoes: [],
      });
      const c = alcance(r, 3);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("item nao e elemento estrutural");
    });

    it("motivo: sem composicao vinculada (NAO 'composicao nao cita concreto')", () => {
      // O item E estrutural, mas nao tem composicao. Dizer "a composicao nao cita
      // concreto" mandaria o engenheiro procurar uma composicao que nao existe.
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.4.1", description: "Pilares" })],
        composicoes: [],
      });
      const c = alcance(r, 3);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("sem composicao vinculada");
      expect(c.motivos.map(m => m.motivo)).not.toContain("composicao nao cita concreto");
    });

    it("motivo: composicao sem descricao", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.4.1", description: "Pilares", compositionId: 5 })],
        composicoes: [composicao({ id: 5, code: "C5", description: "" })],
      });
      const c = alcance(r, 3);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("composicao sem descricao");
    });

    it("motivo: composicao nao cita concreto", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.4.1", description: "Pilares", unit: "kg", compositionId: 1, compositionDescription: "PERFIL METALICO SOLDADO", compositionUnit: "KG" })],
        composicoes: [composicao({ id: 1, code: "C1", description: "PERFIL METALICO SOLDADO", unit: "KG" })],
      });
      const c = alcance(r, 3);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("composicao nao cita concreto");
    });

    it("motivo: fck nao declarado na composicao", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.4.1", description: "Pilares", compositionId: 1, compositionDescription: "CONCRETO USINADO BOMBEADO" })],
        composicoes: [composicao({ id: 1, code: "C1", description: "CONCRETO USINADO BOMBEADO" })],
      });
      const c = alcance(r, 3);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("fck nao declarado na composicao");
    });
  });

  describe("regra 4 - preco sem lastro", () => {
    it("motivo: sem composicao vinculada", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3", unitPrice: 50 })],
        composicoes: [],
      });
      expect(alcance(r, 4).motivo).toBe("sem composicao vinculada");
    });

    it("motivo: unidade divergente da composicao", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3", unitPrice: 50, compositionId: 1, compositionUnit: "M2", somaComponentes: 40 })],
        composicoes: [composicao({ id: 1, code: "C1", unit: "M2" })],
      });
      const c = alcance(r, 4);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("unidade divergente da composicao");
    });

    it("motivo: soma de componentes indisponivel", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3", unitPrice: 50, compositionId: 1, compositionUnit: "M3", somaComponentes: null })],
        composicoes: [composicao({ id: 1, code: "C1", unit: "M3" })],
      });
      expect(alcance(r, 4).motivo).toBe("soma de componentes indisponivel");
    });

    it("motivo: preco do item nao informado", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3", unitPrice: 0, compositionId: 1, compositionUnit: "M3", somaComponentes: 40 })],
        composicoes: [composicao({ id: 1, code: "C1", unit: "M3" })],
      });
      const c = alcance(r, 4);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("preco do item nao informado");
    });
  });

  describe("regra 5 - cobertura de preco da composicao", () => {
    it("motivo: composicao sem componentes", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [composicao({ id: 1, code: "C1", totalComponentes: 0 })],
      });
      const c = alcance(r, 5);
      expect(c.universo).toBe("composicoes");
      expect(c.total).toBe(1);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("composicao sem componentes");
    });
  });

  describe("regra 6 - custo por m2", () => {
    it("motivo: obra sem area construida", () => {
      const r = validarCoerenciaEngenharia({
        obra: { ...obraBase, areaConstruida: null },
        itens: [item({ code: "1.1.1", description: "Escavacao", quantity: 10, unitPrice: 100 })],
        composicoes: [],
      });
      const c = alcance(r, 6);
      expect(c.total).toBe(1);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("obra sem area construida");
    });

    it("motivo: item nao e custo direto de construcao", () => {
      const r = validarCoerenciaEngenharia({
        obra: { ...obraBase, areaConstruida: 100, pavimentos: 1 },
        itens: [
          item({ code: "1.0.1", description: "Administracao local da obra", quantity: 1, unitPrice: 100, custoDireto: false }),
          item({ code: "1.0.2", description: "Execucao da estrutura", quantity: 100, unitPrice: 2000, custoDireto: true }),
        ],
        composicoes: [],
      });
      const c = alcance(r, 6);
      expect(c.total).toBe(2);
      expect(c.avaliados).toBe(1);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("item nao e custo direto de construcao");
    });

    it("motivo: custo direto sem valor informado", () => {
      const r = validarCoerenciaEngenharia({
        obra: { ...obraBase, areaConstruida: 100, pavimentos: 1 },
        itens: [item({ code: "1.0.2", description: "Execucao da estrutura", quantity: 100, unitPrice: 0, custoDireto: true })],
        composicoes: [],
      });
      const c = alcance(r, 6);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("custo direto sem valor informado");
    });
  });

  describe("regra 7 - unidade orcamento x cronograma", () => {
    it("motivo: atividade sem item correspondente no orcamento", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3" })],
        composicoes: [],
        atividades: [ativ({ id: 1, wbsCode: "9.9.9", name: "Sem item", unit: "m3" })],
      });
      const c = alcance(r, 7);
      expect(c.universo).toBe("atividades");
      expect(c.total).toBe(1);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("atividade sem item correspondente no orcamento");
    });

    it("motivo: atividade sem unidade", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [item({ code: "1.1.1", description: "Escavacao", unit: "m3" })],
        composicoes: [],
        atividades: [ativ({ id: 1, wbsCode: "1.1.1", name: "Escavacao", unit: null })],
      });
      const c = alcance(r, 7);
      expect(c.avaliados).toBe(0);
      expect(c.motivo).toBe("atividade sem unidade");
    });
  });

  describe("regra 8 - superestrutura e ciclo de pavimento", () => {
    it("motivo: atividade fora da superestrutura", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [ativ({ id: 1, wbsCode: "1.3.2", name: "Fundacao", durationDays: 20 })],
      });
      const c = alcance(r, 8);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("atividade fora da superestrutura");
    });

    it("motivo: superestrutura em nivel unico (nao ha ciclo entre niveis para comparar)", () => {
      // Ha subnivel (1.4.N.M) mas so UM nivel representado (M=1 nas duas etapas):
      // nao existe ciclo para comparar, e a regra nao pode ser avaliada.
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [
          ativ({ id: 1, wbsCode: "1.4.1.1", name: "Forma", durationDays: 30 }),
          ativ({ id: 2, wbsCode: "1.4.2.1", name: "Armadura", durationDays: 30 }),
        ],
      });
      const c = alcance(r, 8);
      expect(c.universo).toBe("atividades");
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(2);
      expect(c.motivo).toBe("superestrutura em nivel unico: nao ha ciclo entre niveis para comparar");
    });

    it("superestrutura SEM decomposicao NAO e exclusao: a regra avalia (e acusa)", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [
          ativ({ id: 1, wbsCode: "1.4.1", name: "Estrutura", durationDays: 30 }),
          ativ({ id: 2, wbsCode: "1.4.2", name: "Estrutura", durationDays: 30 }),
        ],
      });
      const c = alcance(r, 8);
      expect(c.avaliados).toBe(2);
      expect(c.fora).toBe(0);
      expect(c.motivo).toBeNull();
      expect(r.issues.map(i => i.code)).toContain("eng_estrutura_sem_ciclo_pavimento");
    });
  });

  describe("regra 9 - sequencia construtiva", () => {
    it("motivo: obra sem fundacao (1.3.2) com termino no CPM", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [ativ({ id: 1, wbsCode: "1.4.1", name: "Estrutura", earlyStart: 1, earlyFinish: 30 })],
      });
      const c = alcance(r, 9);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("obra sem fundacao (1.3.2) com termino no CPM");
    });

    it("motivo: atividade que nao e elemento superior", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [
          ativ({ id: 1, wbsCode: "1.3.2", name: "Fundacao", earlyStart: 1, earlyFinish: 20 }),
          ativ({ id: 2, wbsCode: "1.3.1", name: "Escavacao", earlyStart: 1, earlyFinish: 5 }),
        ],
      });
      const c = alcance(r, 9);
      expect(c.avaliados).toBe(0);
      expect(c.fora).toBe(2);
      expect(c.motivo).toBe("atividade que nao e elemento superior");
    });

    it("motivo: atividade sem inicio (earlyStart) calculado", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [
          ativ({ id: 1, wbsCode: "1.3.2", name: "Fundacao", earlyStart: 1, earlyFinish: 20 }),
          ativ({ id: 2, wbsCode: "1.4.1", name: "Estrutura", earlyStart: null, earlyFinish: 30 }),
        ],
      });
      const c = esperaMotivo(r, 9, "atividade sem inicio (earlyStart) calculado");
      expect(c.avaliados).toBe(0);
    });
  });

  describe("regra 10 - atividade sem predecessor", () => {
    it("motivo: atividade que pode comecar sem predecessor (frente de inicio)", () => {
      const r = validarCoerenciaEngenharia({
        obra: obraBase,
        itens: [],
        composicoes: [],
        atividades: [ativ({ id: 1, wbsCode: "1.1.1", name: "Inicio" }), ativ({ id: 2, wbsCode: "1.4.1", name: "Estrutura", semPredecessor: true })],
      });
      const c = alcance(r, 10);
      expect(c.universo).toBe("atividades");
      expect(c.total).toBe(2);
      expect(c.avaliados).toBe(1);
      expect(c.fora).toBe(1);
      expect(c.motivo).toBe("atividade que pode comecar sem predecessor (frente de inicio)");
    });
  });
});
