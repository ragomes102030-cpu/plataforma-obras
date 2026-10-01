import { describe, expect, it } from "vitest";
import { parseEapProposal, proposeEapWithArquimedes } from "./arquimedes";
import type { ArquimedesProjectContext } from "./types";

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


describe("proposeEapWithArquimedes", () => {
  const context: ArquimedesProjectContext = {
    projectId: 10,
    name: "Edifício teste",
    description: "Edifício residencial de oito pavimentos com áreas comuns.",
    tipoDeObra: "edificio",
    stage: "EAP_PROPOSTA",
    wbs: [],
  };

  it("constrói a EAP vazia em macroestrutura e subárvores", async () => {
    const calls: Array<{ task: string; maxTokens?: number }> = [];

    const provider = {
      async complete(request: { user: string; maxTokens?: number }) {
        const payload = JSON.parse(request.user) as {
          task: string;
          root?: { code?: string };
        };
        calls.push({ task: payload.task, maxTokens: request.maxTokens });

        if (payload.task === "mapear_eap_macro") {
          return JSON.stringify({
            action: "mapear_eap_macro",
            basis: ["escopo informado"],
            assumptions: [],
            missingInformation: [],
            nodes: [
              {
                operation: "create",
                parentCode: null,
                code: "1",
                name: "Implantação",
                nodeType: "grupo",
                rationale: "Organiza a implantação",
              },
              {
                operation: "create",
                parentCode: null,
                code: "2",
                name: "Estrutura",
                nodeType: "grupo",
                rationale: "Organiza a estrutura",
              },
              {
                operation: "create",
                parentCode: null,
                code: "3",
                name: "Instalações",
                nodeType: "grupo",
                rationale: "Organiza as instalações",
              },
            ],
          });
        }

        const code = payload.root?.code ?? "1";
        return JSON.stringify({
          action: "expandir_subarvore_eap",
          basis: [],
          assumptions: [],
          missingInformation: [],
          nodes: [
            {
              operation: "create",
              parentCode: code,
              code: code + ".1",
              name: "Pacote do ramo",
              nodeType: "pacote",
              rationale: "Primeiro pacote controlável",
            },
          ],
        });
      },
    };

    const result = await proposeEapWithArquimedes(context, provider);
    const proposal = JSON.parse(result.raw) as {
      nodes: Array<{ code?: string; parentCode?: string | null }>;
    };

    expect(calls.map(call => call.task)).toEqual([
      "mapear_eap_macro",
      "expandir_subarvore_eap",
      "expandir_subarvore_eap",
      "expandir_subarvore_eap",
    ]);
    expect(calls[0]?.maxTokens).toBe(4096);
    expect(calls.slice(1).every(call => call.maxTokens === 8192)).toBe(true);
    expect(proposal.nodes.map(node => node.code)).toEqual([
      "1",
      "1.1",
      "2",
      "2.1",
      "3",
      "3.1",
    ]);
  });
});


describe("parseEapProposal por etapa", () => {
  it("aceita a ação própria da macroestrutura e normaliza internamente", () => {
    const result = parseEapProposal(
      JSON.stringify({
        action: "mapear_eap_macro",
        basis: [],
        assumptions: [],
        missingInformation: [],
        nodes: [{
          operation: "create",
          parentCode: null,
          code: "1",
          name: "Implantação",
          nodeType: "grupo",
          rationale: "Raiz da obra",
        }],
      }),
      "mapear_eap_macro"
    );
    expect(result.action).toBe("propose_eap");
  });

  it("rejeita ação de outra etapa", () => {
    expect(() =>
      parseEapProposal(
        JSON.stringify({
          action: "mapear_eap_macro",
          basis: [],
          assumptions: [],
          missingInformation: [],
          nodes: [],
        }),
        "expandir_subarvore_eap"
      )
    ).toThrow(/action/i);
  });
});
