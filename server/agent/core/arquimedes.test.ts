import { describe, expect, it } from "vitest";
import { parseEapProposal, proposeEapWithArquimedes } from "./arquimedes";
import type { ArquimedesProjectContext } from "./types";

describe("parseEapProposal", () => {
  it("transforma JSON truncado em erro controlado", () => {
    expect(() =>
      parseEapProposal('{"action":"propose_eap","basis":[],"assumptions":[],"missingInformation":[],"nodes":[{"name":"Implantação"')
    ).toThrow(/proposta EAP incompleta ou inválida/i);
  });

  it("preserva o resumo das correções propostas pelo especialista", () => {
    const result = parseEapProposal(
      JSON.stringify({
        basis: [],
        assumptions: [],
        missingInformation: [],
        resolutionSummary: [
          "Atualizar o escopo do pacote 1.1 para separar as responsabilidades duplicadas.",
        ],
        nodes: [{
          operation: "update",
          nodeId: 11,
          parentCode: "1",
          code: "1.1",
          name: "Serviço revisado",
          nodeType: "pacote",
          rationale: "Elimina a sobreposição identificada.",
        }],
      })
    );

    expect(result.resolutionSummary).toEqual([
      "Atualizar o escopo do pacote 1.1 para separar as responsabilidades duplicadas.",
    ]);
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

  it("aceita campos de dicionario usados para corrigir escopo", () => {
    const result = parseEapProposal(
      JSON.stringify({
        basis: [],
        assumptions: [],
        missingInformation: [],
        resolutionSummary: ["Separar responsabilidades duplicadas nos pacotes afetados."],
        nodes: [{
          operation: "update",
          nodeId: 12,
          parentCode: "1.1",
          code: "1.1.2",
          name: "Impermeabilização",
          nodeType: "entrega",
          inclusions: "Impermeabilização da cobertura principal.",
          exclusions: "Áreas externas fora da cobertura.",
          description: "Escopo revisado para eliminar sobreposição com o irmão.",
          responsible: "Engenharia de execução",
          acceptanceCriteria: "Superfície concluída e aprovada.",
          rationale: "Ajusta o dicionário para eliminar a sobreposição textual.",
        }],
      })
    );

    expect(result.nodes[0]).toMatchObject({
      operation: "update",
      nodeId: 12,
      inclusions: "Impermeabilização da cobertura principal.",
      exclusions: "Áreas externas fora da cobertura.",
      acceptanceCriteria: "Superfície concluída e aprovada.",
    });
    expect(result.resolutionSummary).toHaveLength(1);
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
          action: "resposta_livre",
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
    expect(calls[0]?.maxTokens).toBe(8192);
    expect(calls.slice(1).every(call => call.maxTokens === 12288)).toBe(true);
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

describe("parseEapProposal — contrato flexível", () => {
  it("aceita action omitida", () => {
    const result = parseEapProposal(
      JSON.stringify({
        basis: ["escopo informado"],
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
      })
    );

    expect(result.action).toBe("propose_eap");
  });

  it("ignora uma action arbitrária enviada pelo provedor", () => {
    const result = parseEapProposal(
      JSON.stringify({
        action: "qualquer_coisa",
        basis: ["escopo informado"],
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
      })
    );

    expect(result.action).toBe("propose_eap");
  });
});

describe("parseEapProposal — etapas flexíveis", () => {
  it("normaliza uma macroestrutura mesmo sem operation, parentCode ou action", () => {
    const result = parseEapProposal(
      JSON.stringify({
        basis: "escopo informado",
        assumptions: [],
        missingInformation: [],
        nodes: [{
          code: "1",
          name: "Implantação",
        }],
      }),
      "macro"
    );

    expect(result.nodes[0]).toMatchObject({
      operation: "create",
      parentCode: null,
      code: "1",
      name: "Implantação",
      nodeType: "grupo",
    });
  });

  it("infere parentCode e operation na subárvore", () => {
    const result = parseEapProposal(
      JSON.stringify({
        basis: ["escopo"],
        assumptions: [],
        missingInformation: [],
        nodes: [{
          code: "2.3.1",
          name: "Concreto estrutural",
        }],
      }),
      "subtree",
      "2"
    );

    expect(result.nodes[0]).toMatchObject({
      operation: "create",
      code: "2.3.1",
      parentCode: "2.3",
      nodeType: "pacote",
    });
  });
});
