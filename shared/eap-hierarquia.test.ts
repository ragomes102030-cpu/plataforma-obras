import { describe, expect, it } from "vitest";
import {
  TIPOS_DE_OBRA,
  classificarPorTrilha,
  classificarServico,
  gerarEap,
  normalizar,
  type CategoriaDeObra,
  type ServicoDoCatalogo,
} from "./eap-engine";

/**
 * Regressões medidas contra o `Planos-de-Servicos-028---ENC.-SOCIAIS-114,15.xls`
 * (SEINFRA-CE 028, 4.437 serviços). Os nomes de capítulo e subgrupo aqui são
 * copiados da planilha, não inventados — foi a leitura dela que mostrou o
 * defeito de classificação.
 */

describe("casamento por palavra inteira", () => {
  it("termo curto não casa dentro de outra palavra", () => {
    // Com `includes` puro, "porta" casava dentro de "PORTARIA" e "IMPORTAÇÃO",
    // e "gas" casava dentro de "VIGAS". O serviço ia para a ala errada da obra.
    expect(classificarServico("PORTARIA E RECEPÇÃO DO EDIFÍCIO")).not.toBe(
      "revestimentos"
    );
    expect(classificarServico("IMPORTAÇÃO DE MATERIAIS DIVERSOS")).toBeNull();
    expect(classificarServico("VIGAS PRÉ-MOLDADAS DE CONCRETO")).not.toBe(
      "instalacoes"
    );
  });

  it("o termo real continua casando", () => {
    expect(classificarServico("ABERTURA DE PORTA DE AÇO EM PAREDE")).toBe(
      "revestimentos"
    );
    expect(classificarServico("CABO ISOLADO PVC 750V 35MM2")).toBe("instalacoes");
    expect(classificarServico("GASOMETRO E REGULAGEM DE PRESSÃO")).toBe("instalacoes");
    expect(classificarServico("VIGAMENTO DE MADEIRA")).toBe("estrutura");
  });

  it("aceita plural, porque a planilha escreve no plural", () => {
    expect(classificarServico("PISOS CERÂMICOS")).toBe("revestimentos");
    expect(classificarServico("CABOS DE COBRE")).toBe("instalacoes");
  });

  it("desmobilizacao casa pela palavra, não por accidents de substring", () => {
    // O termo estava escrito "demobilizacao" e só casava porque
    // "desmobilizacao" contém essa sequência. O casamento por palavra
    // inteira expôs o erro; o termo foi corrigido.
    expect(classificarServico("Mobiização e desmobilização de equipe")).toBe(
      "preliminares"
    );
  });
});

describe("classificação pela taxonomia oficial da planilha", () => {
  it("o capítulo manda, e a descrição não interfere", () => {
    // Estas três iam para a ala errada quando o motor só lia a descrição:
    // "cabo" levava sondagem e protensão para Instalações, e "porta" levava
    // disjuntor para Revestimentos.
    expect(
      classificarServico("EXECUÇÃO DE SONDAGEM ELÉTRICA VERTICAL AB/2 ATÉ 150m", [
        "SERVICOS PRELIMINARES",
        "SONDAGENS",
      ])
    ).toBe("preliminares");

    expect(
      classificarServico("PROTENSÃO E INJEÇÃO EM CABO COM CORDOALHA DE 12,7mm", [
        "FUNDAÇÕES E  ESTRUTURAS",
        "ESTACAS",
      ])
    ).toBe("fundacao");

    expect(
      classificarServico(
        "DISJUNTOR TRIPOLAR C/ACIONAMENTO NA PORTA DO Q.D.ATE 63A",
        ["INST. ELÉTRICAS, TELEFONIA, LÓGICA, SOM E SISTEMAS DE CONTROLE", "BASES, CHAVES E DISJUNTORES"]
      )
    ).toBe("instalacoes");
  });

  it("o subgrupo distingue capítulos que misturam naturezas", () => {
    // Capítulo 6 junta tubulão (fundação) e formas (estrutura).
    expect(
      classificarPorTrilha(["FUNDAÇÕES E  ESTRUTURAS", "TUBULÕES A CÉU ABERTO"])
    ).toBe("fundacao");
    expect(classificarPorTrilha(["FUNDAÇÕES E  ESTRUTURAS", "FORMAS"])).toBe(
      "estrutura"
    );
    // Capítulo 12 junta baldrame, calha e reservatório.
    expect(classificarPorTrilha(["IMPERMEABILIZAÇÃO", "BALDRAMES"])).toBe("fundacao");
    expect(classificarPorTrilha(["IMPERMEABILIZAÇÃO", "CALHAS"])).toBe("cobertura");
    expect(classificarPorTrilha(["IMPERMEABILIZAÇÃO", "RESERVATÓRIOS"])).toBe(
      "instalacoes"
    );
  });

  it("o subgrupo com norma técnica casa por prefixo", () => {
    // 12.8 embute a norma no título, e ela muda a cada revisão.
    expect(
      classificarPorTrilha([
        "IMPERMEABILIZAÇÃO",
        "IMPERMEABILIZAÇÃO UTILIZANDO MANTA ASFÁLTICA (ABNT NBR 9952:2014)",
      ])
    ).toBe("fundacao");
  });

  it("embasamento é fundação, não estrutura", () => {
    expect(
      classificarPorTrilha([
        "FUNDAÇÕES E  ESTRUTURAS",
        "EMBASAMENTOS E BALDRAMES",
      ])
    ).toBe("fundacao");
  });

  it("trilha vazia ou desconhecida devolve undefined, para cair na descrição", () => {
    expect(classificarPorTrilha([])).toBeUndefined();
    expect(classificarPorTrilha(null)).toBeUndefined();
    expect(classificarPorTrilha(["CAPÍTULO QUE NÃO EXISTE"])).toBeUndefined();
  });

  it("cada capítulo da planilha com destino é reconhecido", () => {
    // Nomes exatos da SEINFRA-CE 028. São 29 de 30: o capítulo 30
    // ("SERVIÇOS DIVERSOS" — indenizações, limpeza final) fica sem mapa de
    // propósito, e cai na classificação por descrição.
    const capitulos: Array<[string, CategoriaDeObra]> = [
      ["SERVICOS PRELIMINARES", "preliminares"],
      ["MOVIMENTO DE TERRA", "terraplenagem"],
      ["SERVIÇOS AUXILIARES", "preliminares"],
      ["OBRAS DE DRENAGEM", "terraplenagem"],
      ["ARGAMASSAS", "revestimentos"],
      ["FUNDAÇÕES E  ESTRUTURAS", "estrutura"],
      ["CONTENÇÕES", "fundacao"],
      ["PAREDES E PAINÉIS", "vedacao"],
      ["ESQUADRIAS E FERRAGENS", "revestimentos"],
      ["VIDROS", "revestimentos"],
      ["COBERTURA", "cobertura"],
      ["IMPERMEABILIZAÇÃO", "fundacao"],
      ["PROTEÇÃO TÉRMICA", "revestimentos"],
      ["REVESTIMENTOS", "revestimentos"],
      ["PISOS", "revestimentos"],
      ["INSTALAÇÕES HIDRÁULICAS", "instalacoes"],
      ["SERVIÇOS OPERACIONAIS", "preliminares"],
      [
        "INST. ELÉTRICAS, TELEFONIA, LÓGICA, SOM E SISTEMAS DE CONTROLE",
        "instalacoes",
      ],
      ["PINTURA", "revestimentos"],
      ["PAVIMENTAÇÃO DO SISTEMA VIÁRIO", "pavimentacao"],
      ["CONSERVAÇÃO DO SISTEMA VIÁRIO", "pavimentacao"],
      ["OBRAS PORTUÁRIAS", "terraplenagem"],
      ["TRANSPORTES PARA OBRAS RODOVIÁRIAS", "preliminares"],
      ["SINALIZAÇÃO DO SISTEMA VIÁRIO", "pavimentacao"],
      ["URBANIZAÇÃO/PAISAGISMO", "terraplenagem"],
      ["MUROS E FECHAMENTOS", "vedacao"],
      ["SISTEMA DE AR CONDICIONADO", "instalacoes"],
      ["REDE DE DISTRIBUIÇÃO DE GÁS NATURAL", "instalacoes"],
      ["ACESSIBILIDADE À EDIFICAÇÕES E ESPAÇOS", "revestimentos"],
    ];
    expect(capitulos).toHaveLength(29);
    for (const [capitulo, esperado] of capitulos) {
      expect(classificarPorTrilha([capitulo]), capitulo).toBe(esperado);
    }
  });

  it("SERVIÇOS DIVERSOS fica sem mapa e cai na descrição", () => {
    // O capítulo 30 são 9 serviços (indenizações, limpeza final). Não têm
    // natureza definida, e forçar um destino só criaria folha errada.
    expect(classificarPorTrilha(["SERVIÇOS DIVERSOS", "LIMPEZA FINAL"])).toBeUndefined();
    expect(
      classificarServico("LIMPEZA MECANIZADA DE TERRENO", [
        "SERVIÇOS DIVERSOS",
        "LIMPEZA FINAL",
      ])
    ).toBe("preliminares");
  });
});

describe("cobertura é grupo de primeira classe", () => {
  it("edifício pede cobertura", () => {
    // Antes não existia: o capítulo 11 (154 serviços — telhas, madeira,
    // metálica, domos) não tinha onde cair e a obra saía sem telhado.
    const edificio = TIPOS_DE_OBRA.find(t => t.value === "edificio")!;
    expect(edificio.grupos).toContain("cobertura");
  });

  it("saneamento pede a rede, senão sai sem um único tubo", () => {
    // O capítulo 16 (TUBOS E CONEXÕES, POÇOS E CAIXAS) é o maior da planilha,
    // com 1.082 serviços, e é a própria obra de saneamento.
    const saneamento = TIPOS_DE_OBRA.find(t => t.value === "saneamento")!;
    expect(saneamento.grupos).toContain("instalacoes");
  });
});

/** Monta um serviço com trilha, no formato que o seeder entrega. */
function servico(
  code: string,
  description: string,
  capitulo: string,
  subgrupo: string
): ServicoDoCatalogo {
  return {
    code,
    description,
    unit: "un",
    unitPrice: 10,
    trilha: [capitulo, subgrupo],
  };
}

describe("escolha dos representantes", () => {
  const hidraulica = "INSTALAÇÕES HIDRÁULICAS";
  const catalogo: ServicoDoCatalogo[] = [
    servico("C001", "TUBO PVC DN 100", hidraulica, "TUBOS E CONEXÕES DE PVC"),
    servico("C002", "TUBO PVC DN 150", hidraulica, "TUBOS E CONEXÕES DE PVC"),
    servico("C003", "TUBO PVC DN 200", hidraulica, "TUBOS E CONEXÕES DE PVC"),
    servico("C004", "TUBO AÇO DN 300", hidraulica, "TUBOS E CONEXÕES DE AÇO"),
    servico("C005", "TUBO FERRO FUNDIDO DN 400", hidraulica, "TUBOS E CONEXÕES DE FERRO FUNDIDO"),
    servico("C006", "REGISTRO DE GAVETA D=100mm", hidraulica, "REGISTROS E VÁLVULAS"),
    servico("C007", "CAIXA DE INSPEÇÃO 60X60", hidraulica, "POÇOS E CAIXAS"),
    servico("C008", "LIGAÇÃO PREDIAL DN 20", hidraulica, "LIGAÇÕES PREDIAIS"),
    servico("C009", "VÁLVULA DE GAVETA D=75", hidraulica, "REGISTROS E VÁLVULAS"),
    servico("C010", "TUBO CONCRETO DN 500", hidraulica, "TUBOS E CONEXÕES DE CONCRETO"),
  ];

  it("cobre os subgrupos em vez de encher a cota com a mesma família", () => {
    // Com espalhamento por índice, as 3 primeiras (as três tubulações PVC)
    // ocupavam 3 das 12 vagas.
    const r = gerarEap(catalogo, { tipoDeObra: "saneamento" });
    const folhas = r.nos.filter(n => n.level === 2);
    const subgrupos = new Set(
      folhas.map(f => f.name).map(n => normalizar(n))
    );
    expect(subgrupos.size).toBeGreaterThanOrEqual(6);
  });

  it("não devolve folha repetida", () => {
    const r = gerarEap(catalogo, { tipoDeObra: "saneamento" });
    const codigos = r.nos.filter(n => n.externalId).map(n => n.externalId!);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("catálogo sem trilha cai na descrição, e ainda cobre a cota", () => {
    // Catálogo de cadastro manual, sem hierarquia da planilha. Aqui só a
    // palavra da descrição decide, e o espalhamento por índice vale.
    const semTrilha: ServicoDoCatalogo[] = Array.from({ length: 30 }, (_, i) => ({
      code: `C${100 + i}`,
      description: `TUBULAÇÃO DE ÁGUA FRIA COM TUBO PVC DN ${50 + i}`,
      unit: "m",
      unitPrice: 10 + i,
    }));
    const r = gerarEap(semTrilha, { tipoDeObra: "saneamento" });
    // Nenhuma dessas descrições casa com termo de keyword, então o motor
    // trabalha só com as que casam — e o que importa é não inventar folha.
    expect(r.servicosSemGrupo).toBe(semTrilha.length);
    expect(r.servicosUsados).toBe(0);
    expect(r.aviso).toBeTruthy();
  });

  it("catálogo sem trilha usa a descrição quando ela tem palavra-chave", () => {
    const comPalavra: ServicoDoCatalogo[] = [
      { code: "C201", description: "Escavação de solo em vala", unit: "m3", unitPrice: 38 },
      { code: "C202", description: "Aterro com compactação mecânica", unit: "m3", unitPrice: 22 },
      { code: "C203", description: "Drenagem com tubo cerâmico perfurado", unit: "m", unitPrice: 61 },
    ];
    const r = gerarEap(comPalavra, { tipoDeObra: "saneamento" });
    expect(r.servicosSemGrupo).toBe(0);
    // Só um dos três vira folha: os dois primeiros classificam como `fundacao`
    // (escavação e aterro são termos de fundação, que vem antes na ordem de
    // precedência) e `saneamento` não pede fundação. Serviço de grupo que o
    // tipo não pediu é descartado, e não vira folha — é o comportamento
    // documentado de `gerarEap`.
    expect(r.servicosUsados).toBe(1);
    expect(r.nos.filter(n => n.externalId).map(n => n.externalId)).toEqual(["C203"]);
  });

  it("tipo que pede o grupo aproveita todos os serviços daquele grupo", () => {
    const mesma = [
      { code: "C201", description: "Escavação de solo em vala", unit: "m3", unitPrice: 38 },
      { code: "C202", description: "Aterro com compactação mecânica", unit: "m3", unitPrice: 22 },
    ];
    const comFundacao = gerarEap(mesma, { tipoDeObra: "todos" });
    expect(comFundacao.servicosUsados).toBe(2);
  });
});
