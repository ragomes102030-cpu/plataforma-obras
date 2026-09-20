import { describe, expect, it } from "vitest";
import {
  runProjectOrchestrator,
  toOpenAiTools,
  validateReadonlyResponse,
} from "./orchestrator";
import type { AgentProjectContext } from "./agent";

const context: AgentProjectContext = {
  project: {
    code: "TEST-01",
    name: "Obra de teste",
    location: "São Paulo, SP",
    status: "Planejamento",
    progress: 0,
    plannedStart: "2026-01-01",
    plannedFinish: "2026-12-31",
  },
  activities: [],
};

const catalog = {
  eap: [
    {
      name: "get_eap_tree",
      description: "Consulta a EAP",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  cronograma: [
    {
      name: "calcular_caminho_critico",
      description: "Calcula CPM",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  ganttLob: [],
};

describe("runProjectOrchestrator", () => {
  it("executa uma consulta MCP, registra auditoria e retorna resposta final", async () => {
    const llmCalls: Array<{ tools: number; messages: number }> = [];
    const events: string[] = [];
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Qual é a estrutura da EAP?" }],
      {
        mcpProjectId: "obra-externa-1",
        deps: {
          listTools: async () => catalog,
          callTool: async (domain, toolName, args) => {
            expect(domain).toBe("eap");
            expect(toolName).toBe("get_eap_tree");
            expect(args).toEqual({ project_id: "obra-externa-1" });
            return { content: [{ type: "text", text: "EAP vazia" }] };
          },
          callLlm: async ({ messages, tools }) => {
            llmCalls.push({ messages: messages.length, tools: tools.length });
            if (llmCalls.length === 1) {
              return {
                model: "test-model",
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call-1",
                          type: "function",
                          function: { name: "get_eap_tree", arguments: "{}" },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              model: "test-model",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content:
                      "MARCO ATUAL\nMARCO 2 — EAP em revisão.\n\nEVIDÊNCIAS CONSULTADAS\nMCP EAP: EAP_ID=1.\n\nPROPOSTA\nManter a estrutura consultada.\n\nEXEMPLOS/REFERÊNCIAS\nDados do MCP EAP.\n\nDIVERGÊNCIAS E LACUNAS\nA EAP está vazia.\n\nIMPACTO DE APROVAR\nNenhuma atividade será criada nesta fase.\n\nPRÓXIMA DECISÃO DO CLIENTE\nVocê deseja revisar ou aprovar esta leitura?",
                  },
                },
              ],
            };
          },
        },
        onEvent: event => {
          events.push(event.type);
        },
      }
    );

    expect(result.readOnly).toBe(true);
    expect(result.status).toBe("respondido");
    expect(result.content).toContain("A EAP está vazia.");
    expect(result.content).toContain(
      "Fontes: dados locais da obra; MCPs consultados (eap)."
    );
    expect(result.iterations).toBe(2);
    expect(result.audit[0]).toMatchObject({
      status: "success",
      toolName: "get_eap_tree",
      domain: "eap",
    });
    expect(llmCalls).toEqual([
      { messages: 2, tools: 2 },
      { messages: 4, tools: 2 },
    ]);
    expect(events).toEqual([
      "catalog_started",
      "catalog_loaded",
      "llm_started",
      "llm_response",
      "tool_started",
      "tool_finished",
      "llm_started",
      "llm_response",
      "response_parsed",
    ]);
  });

  it("recusa uma resposta final sem conteúdo textual", async () => {
    await expect(
      runProjectOrchestrator(
        context,
        [{ role: "user", content: "Resuma a situação." }],
        {
          deps: {
            listTools: async () => catalog,
            callLlm: async () => ({
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    reasoning:
                      "Analisei os dados, mas não gerei uma conclusão.",
                  },
                },
              ],
            }),
          },
        }
      )
    ).rejects.toThrow("não retornou conteúdo final textual");
  });

  it("recusa uma resposta que não separa evidências, lacunas e decisão", () => {
    expect(() =>
      validateReadonlyResponse("MARCO ATUAL\nResposta curta.")
    ).toThrow("faltam seções");
  });

  it("não expõe ferramentas de escrita ao modelo", () => {
    const tools = toOpenAiTools({
      eap: [{ name: "criar_eap_node" }, { name: "get_eap_tree" }],
      cronograma: [],
      ganttLob: [],
    });
    expect(tools.map(tool => tool.function.name)).toEqual(["get_eap_tree"]);
  });

  it("recusa uma ferramenta de escrita mesmo que o modelo tente chamá-la", async () => {
    await expect(
      runProjectOrchestrator(
        context,
        [{ role: "user", content: "Crie uma EAP" }],
        {
          deps: {
            listTools: async () => ({
              eap: [{ name: "get_eap_tree" }],
              cronograma: [],
              ganttLob: [],
            }),
            callLlm: async () => ({
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "call-1",
                        type: "function",
                        function: { name: "criar_eap_node", arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
            }),
          },
        }
      )
    ).rejects.toThrow("Ferramenta não permitida");
  });
});
