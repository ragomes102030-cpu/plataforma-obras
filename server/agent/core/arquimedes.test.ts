import { describe, expect, it } from "vitest";
import { parseEapProposal } from "./arquimedes";

describe("parseEapProposal", () => {
  it("transforma JSON truncado em erro controlado", () => {
    expect(() =>
      parseEapProposal('{"action":"propose_eap","basis":[],"assumptions":[],"missingInformation":[],"nodes":[{"name":"Implantação"')
    ).toThrow(/proposta EAP incompleta ou inválida/i);
  });

  it("valida a estrutura mínima da proposta", () => {
    expect(
      parseEapProposal(
        JSON.stringify({
          action: "propose_eap",
          basis: ["descrição da obra"],
          assumptions: [],
          missingInformation: [],
          nodes: [
            {
              operation: "create",
              parentCode: null,
              code: "1",
              name: "Implantação",
              nodeType: "grupo",
              rationale: "Organiza o escopo inicial",
            },
          ],
        })
      )
    ).toMatchObject({
      action: "propose_eap",
      nodes: [{ code: "1", nodeType: "grupo" }],
    });
  });

  it("rejeita proposta estruturalmente incorreta", () => {
    expect(() =>
      parseEapProposal(
        JSON.stringify({
          action: "propose_eap",
          basis: [],
          assumptions: [],
          missingInformation: [],
          nodes: [{ operation: "create", name: "Sem tipo", rationale: "x" }],
        })
      )
    ).toThrow(/contrato estruturado/i);
  });
});
