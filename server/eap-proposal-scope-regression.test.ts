import { describe, expect, it } from "vitest";
import { buildInitialEapProposal } from "./construction/eap-proposal";

describe("proposta inicial de EAP sensível ao escopo", () => {
  it("mantém sistemas construtivos declarados sem presumir contenções ou áreas externas", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Residencial Multifamiliar 6 Pavimentos",
        descricao:
          "Edificação residencial com seis pavimentos, fundações, estrutura de concreto, alvenaria, instalações e acabamentos.",
        tipoDeObra: "Edificação residencial multifamiliar",
      },
      false
    );

    expect(proposal.nodes).toHaveLength(8);
    expect(proposal.nodes[0]).toMatchObject({
      code: "1",
      nodeType: "grupo",
      parentCode: null,
    });

    const phases = proposal.nodes.slice(1);
    expect(phases).toHaveLength(7);
    expect(phases.every((node) => node.parentCode === "1")).toBe(true);
    expect(phases.every((node) => node.nodeType === "pacote")).toBe(true);

    const names = phases.map((node) => node.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Infraestrutura e fundações",
        "Estrutura de concreto",
        "Vedações em alvenaria",
        "Instalações prediais (sistemas a confirmar)",
        "Acabamentos e componentes internos (escopo a confirmar)",
        "Comissionamento, documentação e entrega",
      ])
    );
    expect(names).not.toContain("Fundações e contenções");
    expect(names).not.toContain("Áreas externas e urbanização");
  });

  it("deixa sistemas e serviços externos em aberto quando o escopo não os define", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "PROJETO ESCOLA ARQUIMEDES",
        descricao: "Obra didática: edifício residencial, térreo e três pavimentos, 12 apartamentos, sem subsolo. Lote, projetos e sistemas construtivos não definidos.",
        tipoDeObra: "Edificação / construção nova",
      },
      false
    );

    const names = proposal.nodes.map(node => node.name);
    expect(names).toContain("Estrutura resistente (sistema a definir)");
    expect(names).toContain("Vedações e envoltória (sistema a definir)");
    expect(names).not.toContain("Estrutura de concreto");
    expect(names).not.toContain("Vedações em alvenaria");
    expect(names).not.toContain("Fundações e contenções");
    expect(names).not.toContain("Áreas externas e urbanização");
    expect(proposal.assumptions.join(" ")).toContain("não presume sistemas construtivos");
    expect(proposal.missingInformation.join(" ")).toContain("lote e sondagem");
  });

  it("usa uma decomposição macro conservadora quando o escopo não identifica uma edificação", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Pavimentação de Via Urbana",
        descricao: "Implantação de pavimento asfáltico, drenagem e sinalização.",
        tipoDeObra: "Infraestrutura viária",
      },
      false
    );

    const names = proposal.nodes.map((node) => node.name);
    expect(names).toContain("Infraestrutura");
    expect(names).toContain("Estrutura e sistemas principais");
    expect(names).not.toContain("Fundações e contenções");
  });

  it("trata reforma de unidade existente como reforma, sem fundação, estrutura nova nem áreas externas", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "PILOTO — Reforma Apartamento Meireles 92m²",
        descricao:
          "Reforma de apartamento de 92 m² em edifício existente, 3 quartos, 2 banheiros, sala e cozinha. " +
          "Inclui demolição de alvenarias internas, revisão das instalações hidráulicas e elétricas, troca de " +
          "revestimentos de piso e parede, forro de gesso, pintura, esquadrias de alumínio e mobiliário fixo da " +
          "cozinha. Não inclui fachada, área comum do condomínio nem estrutura. Prazo previsto de 4 meses.",
        tipoDeObra: "reforma",
      },
      false
    );

    const nomes = proposal.nodes.map(node => node.name);
    // O erro que originou este teste: "apartamento" fazia o gerador usar o
    // modelo de construção nova e propor fundação/estrutura para uma reforma.
    expect(nomes).not.toContain("Fundações e contenções");
    expect(nomes).not.toContain("Estrutura de concreto");
    expect(nomes).not.toContain("Áreas externas e urbanização");
    expect(nomes).not.toContain("Cobertura");

    expect(nomes).toEqual(
      expect.arrayContaining([
        "Demolições e remoções",
        "Instalações hidrossanitárias",
        "Instalações elétricas",
        "Vedações, forros e gesso",
        "Revestimentos",
        "Esquadrias e mobiliário fixo",
        "Pintura e acabamentos finais",
        "Limpeza, testes e entrega",
      ])
    );

    // A proposta de reforma desce até atividade (folha), não para em macrofase.
    const fases = proposal.nodes.filter(node => node.parentCode === "1");
    const atividades = proposal.nodes.filter(node => (node.code ?? "").split(".").length === 3);
    expect(fases).toHaveLength(9);
    expect(atividades).toHaveLength(20);
    expect(proposal.nodes).toHaveLength(30);
    for (const atividade of atividades) {
      expect(proposal.nodes.some(node => node.code === atividade.parentCode)).toBe(true);
      expect(atividade.nodeType).toBe("entrega");
    }

    expect(proposal.basis.join(" ")).toContain("reforma");
    expect(proposal.basis.join(" ")).toContain("estrutura");
    expect(proposal.validation?.issues.map(item => item.code)).toContain(
      "eap_estrutura_base_por_tipologia"
    );
  });

  it("remove a fase quando o escopo exclui explicitamente aquele serviço", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Reforma de sala comercial",
        descricao:
          "Reforma de sala comercial com demolição de divisórias, instalações elétricas e forro. Não inclui pintura.",
        tipoDeObra: "reforma",
      },
      false
    );

    const nomes = proposal.nodes.map(node => node.name);
    expect(nomes).toContain("Demolições e remoções");
    expect(nomes).not.toContain("Pintura e acabamentos finais");
    expect(nomes).not.toContain("Preparação de superfícies e pintura");
  });

  it("não cria proposta inicial quando a obra já possui EAP", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Residencial já estruturado",
        descricao: "Obra com EAP existente.",
        tipoDeObra: "Residencial",
      },
      true
    );

    expect(proposal.nodes).toEqual([]);
  });
});
