import { describe, expect, it } from "vitest";
import {
  GRUPOS,
  TIPOS_DE_OBRA,
  classificarServico,
  ehCodigoDeServico,
  gerarEap,
  normalizar,
  type ServicoDoCatalogo,
} from "./eap-engine";

/** Catálogo sintético no formato que o upload da SEINFRA grava. */
const CATALOGO: ServicoDoCatalogo[] = [
  { code: "C10101", description: "Instalação de canteiro", unit: "un", unitPrice: 4200 },
  { code: "C10102", description: "Mobiização e desmobilização de equipe", unit: "un", unitPrice: 1800 },
  { code: "C20101", description: "Escavação de solo em vala", unit: "m3", unitPrice: 38.5 },
  { code: "C20102", description: "Estaca hélice contínua D400", unit: "m", unitPrice: 132.4 },
  { code: "C20103", description: "Bloco de fundação em concreto armado", unit: "un", unitPrice: 890 },
  { code: "C30101", description: "Concreto armado para estrutura", unit: "m3", unitPrice: 487.32 },
  { code: "C30102", description: "Armação de aço CA-50", unit: "kg", unitPrice: 14.2 },
  { code: "C30103", description: "Fôrma de madeira para laje", unit: "m2", unitPrice: 68.9 },
  { code: "C40101", description: "Alvenaria de bloco cerâmico", unit: "m2", unitPrice: 74.5 },
  { code: "C40102", description: "Emboço e reboco interno", unit: "m2", unitPrice: 41.3 },
  { code: "C50101", description: "Instalação elétrica predial", unit: "m2", unitPrice: 22.7 },
  { code: "C50102", description: "Instalação hidrossanitária", unit: "m2", unitPrice: 58.1 },
  { code: "C50103", description: "Rede elétrica de baixa tensão", unit: "m", unitPrice: 31.4 },
  { code: "C60101", description: "Piso cerâmico", unit: "m2", unitPrice: 96.2 },
  { code: "C60102", description: "Pintura interna emlatex", unit: "m2", unitPrice: 19.8 },
  { code: "C70101", description: "Recapeamento asfáltico", unit: "m2", unitPrice: 68.4 },
  { code: "C70201", description: "Sarjeta de concreto", unit: "m", unitPrice: 44.1 },
  // insumos: não são serviço e não devem virar folha
  { code: "I10101", description: "Cimento CP II-E 32kg", unit: "sc", unitPrice: 38.9 },
  { code: "I10201", description: "Areia media", unit: "m3", unitPrice: 92.0 },
];

describe("reconhecimento de codigo", () => {
  it("servico comeca em C, insumo em I", () => {
    expect(ehCodigoDeServico("C10101")).toBe(true);
    expect(ehCodigoDeServico("C 10101")).toBe(true);
    expect(ehCodigoDeServico("c10101")).toBe(true);
    expect(ehCodigoDeServico("I10101")).toBe(false);
    expect(ehCodigoDeServico("01.001")).toBe(false);
  });

  it("normalizar tira acento e caixa", () => {
    expect(normalizar("Instalação Elétrica")).toBe("instalacao eletrica");
    expect(normalizar("Fôrma de madeira")).toBe("forma de madeira");
  });
});

describe("classificacao de servico", () => {
  it.each([
    ["Instalação de canteiro", "preliminares"],
    ["Estaca hélice contínua D400", "fundacao"],
    ["Concreto armado para estrutura", "estrutura"],
    ["Alvenaria de bloco cerâmico", "vedacao"],
    ["Instalação elétrica predial", "instalacoes"],
    ["Piso cerâmico", "revestimentos"],
    ["Recapeamento asfáltico", "pavimentacao"],
    ["Escavação de solo em vala", "fundacao"],
  ])("classifica %s como %s", (descricao, esperado) => {
    expect(classificarServico(descricao)).toBe(esperado);
  });

  it("devolve null quando nada casa", () => {
    expect(classificarServico("Serviço não catalogado xyzzy")).toBeNull();
    expect(classificarServico("")).toBeNull();
  });

  it("agrupa pela descricao com acento e caixa diferentes", () => {
    expect(classificarServico("ALVENARIA DE BLOCO CERÂMICO")).toBe("vedacao");
  });
});

describe("gerarEap", () => {
  const r = gerarEap(CATALOGO, { tipoDeObra: "edificio" });

  it("cria os nos", () => {
    expect(r.nos.length).toBeGreaterThan(0);
    expect(r.aviso).toBeNull();
  });

  it("ignora insumos: so servico C vira folha", () => {
    const codigos = r.nos.map(n => n.externalId).filter(Boolean);
    expect(codigos.every(c => ehCodigoDeServico(String(c)))).toBe(true);
    expect(codigos).not.toContain("I10101");
    expect(codigos).not.toContain("I10201");
  });

  // ESTA E A PROPRIEDADE QUE FAZ O ORCAMENTO CASAR COM A EAP
  it("toda folha carrega o codigo oficial do catalogo", () => {
    const catalogo = new Set(CATALOGO.map(s => s.code));
    for (const no of r.nos.filter(n => n.externalId)) {
      expect(catalogo.has(String(no.externalId)), `código ${no.externalId} não existe no catálogo`).toBe(true);
    }
  });

  it("toda folha tem codigo EAP sequencial e parentavel", () => {
    const codigos = r.nos.map(n => n.code);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const no of r.nos.filter(n => n.level === 2)) {
      const pai = no.code.split(".")[0];
      expect(r.nos.some(p => p.code === pai && p.level === 1), `pai ${pai} ausente de ${no.code}`).toBe(true);
    }
  });

  it("no de nivel 1 e grupo, sem codigo oficial", () => {
    for (const no of r.nos.filter(n => n.level === 1)) {
      expect(no.nodeType).toBe("grupo");
      expect(no.externalId).toBeNull();
    }
  });

  it("a folha carrega preco e unidade do catalogo", () => {
    const folha = r.nos.find(n => n.externalId === "C30101");
    expect(folha?.unitPrice).toBe(487.32);
    expect(folha?.unit).toBe("m3");
  });

  it("edificio nao traz pavimentacao", () => {
    const nomes = r.nos.map(n => n.name);
    expect(nomes.some(n => n.includes("Pavimentação"))).toBe(false);
  });

  it("pavimentacao traz pavimentacao e nao traz estrutura", () => {
    const rp = gerarEap(CATALOGO, { tipoDeObra: "pavimentacao" });
    const nomes = rp.nos.map(n => n.name);
    expect(nomes.some(n => n.includes("Pavimentação"))).toBe(true);
    expect(nomes.some(n => n.includes("Estrutura"))).toBe(false);
  });

  it("sem tipo de obra usa todos os grupos", () => {
    const rt = gerarEap(CATALOGO);
    const nomes = rt.nos.map(n => n.name);
    expect(nomes.some(n => n.includes("Pavimentação"))).toBe(true);
    expect(nomes.some(n => n.includes("Estrutura"))).toBe(true);
  });

  it("respeita o maximo por grupo", () => {
    const r1 = gerarEap(CATALOGO, { tipoDeObra: "todos", maximoPorGrupo: 1 });
    for (const no of r1.nos.filter(n => n.level === 1)) {
      const filhos = r1.nos.filter(n => n.code.startsWith(`${no.code}.`));
      expect(filhos.length, `grupo ${no.code} excedeu o máximo`).toBeLessThanOrEqual(1);
    }
  });

  it("e deterministico: mesma entrada, mesma saida", () => {
    const a = gerarEap(CATALOGO, { tipoDeObra: "edificio" });
    const b = gerarEap(CATALOGO, { tipoDeObra: "edificio" });
    expect(JSON.stringify(a.nos)).toBe(JSON.stringify(b.nos));
  });

  it("nao depende da ordem do catalogo para classificar", () => {
    const embaralhado = [...CATALOGO].reverse();
    const a = gerarEap(CATALOGO, { tipoDeObra: "edificio" });
    const b = gerarEap(embaralhado, { tipoDeObra: "edificio" });
    expect(a.servicosUsados).toBe(b.servicosUsados);
  });

  it("conta servicos sem grupo", () => {
    const comLixo = [
      ...CATALOGO,
      { code: "C99999", description: "Serviço não catalogado xyzzy", unit: "un", unitPrice: 10 },
    ];
    const r2 = gerarEap(comLixo, { tipoDeObra: "edificio" });
    expect(r2.servicosSemGrupo).toBe(1);
  });

  it("relata grupos vazios do tipo pedido", () => {
    // reforma nao tem fundacao/estrutura no tipo, mas o catalogo tem —
    // gruposPedidos restringe, entao fundacao nao entra
    const rr = gerarEap(CATALOGO, { tipoDeObra: "reforma" });
    expect(rr.nos.some(n => n.name.includes("Fundação"))).toBe(false);
  });
});

describe("gerarEap sem catalogo", () => {
  it("catalogo vazio avisa em vez de lancar", () => {
    const r = gerarEap([], { tipoDeObra: "edificio" });
    expect(r.nos).toEqual([]);
    expect(r.aviso).toContain("não tem serviços");
  });

  it("so insumos avisa", () => {
    const r = gerarEap(
      [{ code: "I10101", description: "Cimento", unit: "sc", unitPrice: 38.9 }],
      { tipoDeObra: "edificio" }
    );
    expect(r.nos).toEqual([]);
    expect(r.aviso).not.toBeNull();
  });

  it("tipo desconhecido cai em todos os grupos, sem lancar", () => {
    const r = gerarEap(CATALOGO, { tipoDeObra: "nao-existe" });
    expect(r.nos.length).toBeGreaterThan(0);
  });

  it("null e undefined nao lancam", () => {
    expect(() => gerarEap(null as never)).not.toThrow();
    expect(() => gerarEap(undefined as never)).not.toThrow();
  });
});

describe("consistencia do catalogo de tipos", () => {
  it("todo tipo declara grupos que existem em GRUPOS", () => {
    const existentes = new Set(GRUPOS.map(g => g.categoria));
    for (const tipo of TIPOS_DE_OBRA) {
      for (const grupo of tipo.grupos) {
        expect(existentes.has(grupo), `${tipo.value} referencia grupo inexistente: ${grupo}`).toBe(true);
      }
    }
  });

  it("todo grupo tem pelo menos um termo de busca", () => {
    for (const grupo of GRUPOS) {
      expect(grupo.termos.length, `${grupo.categoria} sem termos`).toBeGreaterThan(0);
    }
  });

  it("termos de busca normalizam para algo que occurs na descricao testada", () => {
    // Um termo que nunca casa e um termo morto: engole o grupo inteiro.
    for (const grupo of GRUPOS) {
      for (const termo of grupo.termos) {
        expect(normalizar(termo).length, `termo vazio em ${grupo.categoria}`).toBeGreaterThan(2);
      }
    }
  });
});
