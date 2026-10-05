import { describe, expect, it } from "vitest";
import { runProjectOrchestrator } from "../orchestrator";
import type { AgentProjectContext } from "../agent";
import type { ConstructionMcpToolCatalog } from "../integrations/construction-mcps";

const context: AgentProjectContext = {
  project: {
    code: "QA-001",
    name: "Obra QA",
    location: "Juazeiro do Norte, CE",
    status: "Planejamento",
    progress: 0,
    plannedStart: "2026-10-05",
    plannedFinish: "2027-10-05",
  },
  activities: [],
};

const finalResponse = [
  "MARCO ATUAL",
  "EAP em revisão.",
  "",
  "EVIDÊNCIAS CONSULTADAS",
  "Dados locais.",
  "",
  "PROPOSTA",
  "Manter a análise.",
  "",
  "EXEMPLOS/REFERÊNCIAS",
  "Nó 1.",
  "",
  "DIVERGÊNCIAS E LACUNAS",
  "Nenhuma.",
  "",
  "IMPACTO DE APROVAR",
  "Nenhuma alteração será gravada.",
  "",
  "PRÓXIMA DECISÃO DO CLIENTE",
  "Você deseja aprovar ou revisar?",
].join("\n");

function catalog(): ConstructionMcpToolCatalog {
  return {
    eap: [
      {
        name: "get_eap_tree",
        description: "Consulta a EAP",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    cronograma: [],
    ganttLob: [],
    errors: {},
  };
}

describe("regressões do orquestrador", () => {
  it("aceita conteúdo textual em partes e normaliza a resposta final", async () => {
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Leia a obra." }],
      {
        deps: {
          listTools: async () => catalog(),
          callLlm: async () => ({
            model: "parts-model",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: finalResponse.split("\n").map(text => ({
                    type: "text",
                    text,
                  })),
                },
              },
            ],
          }),
        },
      }
    );

    expect(result.content).toContain("MARCO ATUAL");
    expect(result.content).toContain("PRÓXIMA DECISÃO DO CLIENTE");
    expect(result.status).toBe("respondido");
  });

  it("não deixa reasoning sozinho virar uma aprovação fictícia", async () => {
    await expect(
      runProjectOrchestrator(
        context,
        [{ role: "user", content: "Aprove a EAP." }],
        {
          deps: {
            listTools: async () => catalog(),
            callLlm: async () => ({
              model: "reasoning-only",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    reasoning:
                      "Analisei, mas não existe conteúdo final verificável.",
                  },
                },
              ],
            }),
          },
        }
      )
    ).rejects.toThrow("conteúdo final textual");
  });

  it("continua depois de um erro de ferramenta e inclui a falha na auditoria", async () => {
    let calls = 0;
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Analise a EAP." }],
      {
        mcpProjectIds: { eap: "ext-qa-001" },
        deps: {
          listTools: async () => catalog(),
          callTool: async () => {
            throw new Error("429 Too Many Requests");
          },
          callLlm: async ({ messages }) => {
            calls += 1;
            if (calls === 1) {
              return {
                model: "qa",
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "tool-429",
                          type: "function",
                          function: {
                            name: "get_eap_tree",
                            arguments: "{}",
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            expect(String(messages.at(-1)?.content)).toContain(
              "429 Too Many Requests"
            );
            return {
              model: "qa",
              choices: [{ message: { role: "assistant", content: finalResponse } }],
            };
          },
        },
      }
    );

    expect(result.audit).toHaveLength(1);
    expect(result.audit[0]).toMatchObject({
      status: "error",
      error: "429 Too Many Requests",
    });
    expect(result.content).toContain("MCPs com falha controlada: eap");
  });

  it("não permite ferramenta conhecida mas não liberada pela política somente leitura", async () => {
    await expect(
      runProjectOrchestrator(
        context,
        [{ role: "user", content: "Altere a EAP." }],
        {
          deps: {
            listTools: async () => catalog(),
            callLlm: async () => ({
              model: "qa",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "write-attempt",
                        type: "function",
                        function: {
                          name: "criar_eap_node",
                          arguments: "{}",
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          },
        }
      )
    ).rejects.toThrow("Ferramenta não permitida no Marco 2");
  });

  it("preserva os IDs por domínio, sem reutilizar o ID de outro MCP", async () => {
    let llmCalls = 0;
    const seen: Record<string, unknown> = {};

    const twoDomainCatalog: ConstructionMcpToolCatalog = {
      eap: [
        {
          name: "get_eap_tree",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      cronograma: [
        {
          name: "listar_atividades",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      ganttLob: [],
      errors: {},
    };

    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Cruze EAP e cronograma." }],
      {
        mcpProjectIds: {
          eap: "external-eap",
          cronograma: "external-schedule",
        },
        deps: {
          listTools: async () => twoDomainCatalog,
          callTool: async (domain, tool, args) => {
            seen[domain] = args;
            return { structuredContent: { tool } };
          },
          callLlm: async () => {
            llmCalls += 1;
            if (llmCalls === 1) {
              return {
                model: "qa",
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "eap-1",
                          type: "function",
                          function: {
                            name: "get_eap_tree",
                            arguments: "{}",
                          },
                        },
                        {
                          id: "schedule-1",
                          type: "function",
                          function: {
                            name: "listar_atividades",
                            arguments: "{}",
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              model: "qa",
              choices: [{ message: { role: "assistant", content: finalResponse } }],
            };
          },
        },
      }
    );

    expect(result.status).toBe("respondido");
    expect(seen).toEqual({
      eap: { project_id: "external-eap" },
      cronograma: { project_id: "external-schedule" },
    });
  });
});
