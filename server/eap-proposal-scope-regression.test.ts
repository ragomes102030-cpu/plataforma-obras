import { describe, expect, it } from "vitest";
import { buildInitialEapProposal } from "./construction/eap-proposal";

describe("EAP proposal scope-aware regression", () => {
  it("decomposes a complex residential building into real construction fronts", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Residencial Multifamiliar 6 Pavimentos",
        descricao: "Edifício residencial com 6 pavimentos, fundações, estrutura, alvenaria, instalações e acabamentos.",
        tipoDeObra: "edificio",
      },
      false
    );

    expect(proposal.nodes).toHaveLength(9);
    expect(proposal.nodes[0]).toMatchObject({
      code: "1",
      name: "Residencial Multifamiliar 6 Pavimentos",
      parentCode: null,
    });

    const names = proposal.nodes.map(node => node.name);
    expect(names).toEqual(expect.arrayContaining([
      "Fundações e contenções",
      "Estrutura de concreto",
      "Vedações e alvenarias",
      "Instalações prediais",
      "Revestimentos e acabamentos",
      "Comissionamento, documentação e entrega",
    ]));

    expect(proposal.nodes.slice(1).every(node => node.parentCode === "1")).toBe(true);
  });

  it("does not use the building template when the scope does not identify an edification", () => {
    const proposal = buildInitialEapProposal(
      {
        name: "Pavimentação de Via Urbana",
        descricao: "Execução de pavimento e drenagem em via urbana.",
        tipoDeObra: "pavimentacao",
      },
      false
    );

    expect(proposal.nodes.map(node => node.name)).toContain("Infraestrutura");
    expect(proposal.nodes.map(node => node.name)).not.toContain("Fundações e contenções");
  });

  it("does not propose duplicate creation when an EAP already exists", () => {
    const proposal = buildInitialEapProposal(
      { name: "Obra já estruturada", descricao: "Edifício residencial" },
      true
    );

    expect(proposal.nodes).toEqual([]);
  });
});
