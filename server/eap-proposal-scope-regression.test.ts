import { describe, expect, it } from "vitest";
import { buildInitialEapProposal } from "./construction/eap-proposal";

describe("proposta inicial de EAP sensível ao escopo", () => {
  it("decompõe uma edificação residencial complexa em frentes macro", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Residencial Multifamiliar 6 Pavimentos",
        descricao:
          "Edificação residencial com seis pavimentos, fundações, estrutura de concreto, alvenaria, instalações e acabamentos.",
        tipoDeObra: "Edificação residencial multifamiliar",
      },
      false
    );

    expect(proposal.nodes).toHaveLength(9);
    expect(proposal.nodes[0]).toMatchObject({
      code: "1",
      nodeType: "grupo",
      parentCode: null,
    });

    const phases = proposal.nodes.slice(1);
    expect(phases).toHaveLength(8);
    expect(phases.every((node) => node.parentCode === "1")).toBe(true);
    expect(phases.every((node) => node.nodeType === "pacote")).toBe(true);

    const names = phases.map((node) => node.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Fundações e contenções",
        "Estrutura de concreto",
        "Vedações e alvenarias",
        "Instalações prediais",
        "Revestimentos e acabamentos",
        "Comissionamento, documentação e entrega",
      ])
    );
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
