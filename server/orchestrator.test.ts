import { describe, expect, it } from "vitest";
import {
  runProjectOrchestrator,
  toOpenAiTools,
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
  it("executa a varredura de lacunas antes da conclusão de uma análise", async () => {
    const calls: string[] = [];
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Analise a obra e me diga o que eu não estou vendo." }],
      {
        mcpProjectId: "obra-externa-1",
        deps: {
          listTools: async () => ({
            eap: [
              { name: "validar_estrutura", description: "Valida EAP", inputSchema: { type: "object", properties: {} } },
              { name: "pacotes_sem_dono", description: "Pacotes sem dono", inputSchema: { type: "object", properties: {} } },
            ],
            cronograma: [
              { name: "validar_dependencias", description: "Valida dependências", inputSchema: { type: "object", properties: {} } },
            ],
            ganttLob: [],
          }),
          callTool: async (_domain, toolName, args) => {
            calls.push(toolName);
            expect(args).toEqual({ project_id: "obra-externa-1" });
            return { content: [{ type: "text", text: JSON.stringify({ toolName, issues: toolName === "validar_estrutura" ? ["múltiplas raízes"] : [] }) }] };
          },
          callLlm: async ({ messages, tools }) => {
            if (messages.length === 2) {
              expect(tools.some(tool => tool.function.name === "engineering_gap_analysis")).toBe(true);
              return {
                model: "test-model",
                choices: [{
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "gap-1",
                      type: "function",
                      function: { name: "engineering_gap_analysis", arguments: '{"focus":"geral"}' },
                    }],
                  },
                }],
              };
            }
            return {
              model: "test-model",
              choices: [{
                message: {
                  role: "assistant",
                  content: "Encontrei uma lacuna estrutural: a EAP possui múltiplas raízes. Não alterei a obra.",
                },
              }],
            };
          },
        },
      }
    );
    expect(result.status).toBe("respondido");
    expect(calls).toEqual(["validar_estrutura", "pacotes_sem_dono", "validar_dependencias"]);
    expect(result.audit.some(event => event.toolName === "engineering_gap_analysis")).toBe(true);
  });


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
    expect(result.content).toContain("EVIDÊNCIAS CONSULTADAS");
    expect(result.iterations).toBe(2);
    expect(result.audit[0]).toMatchObject({
      status: "success",
      toolName: "get_eap_tree",
      domain: "eap",
    });
    expect(llmCalls).toEqual([
      { messages: 2, tools: 18 },
      { messages: 4, tools: 18 },
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
    ).rejects.toThrow("sem conteúdo final textual");
  });

  it("inclui a fonte local e os erros de evidência no contexto do modelo", async () => {
    let systemMessage = "";
    const result = await runProjectOrchestrator(
      {
        ...context,
        evidence: {
          source: "local_db",
          eapNodeCount: 4,
          activityCount: 3,
          dependencyCount: null,
          warnings: ["Nenhuma dependência cadastrada para a obra."],
          errors: ["MCP Cronograma indisponível; fallback local utilizado."],
          validation: {
            status: "blocked",
            blockerCount: 1,
            issues: ["A rede possui ciclo."],
            projectDuration: null,
            criticalPath: [],
          },
        },
      },
      [{ role: "user", content: "Qual é a situação local?" }],
      {
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          callLlm: async ({ messages }) => {
            systemMessage = String(messages[0]?.content);
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content:
                      "MARCO ATUAL\nLeitura local.\n\nEVIDÊNCIAS CONSULTADAS\nBanco local.\n\nPROPOSTA\nManter leitura.\n\nEXEMPLOS/REFERÊNCIAS\nEAP local.\n\nDIVERGÊNCIAS E LACUNAS\nDependências ausentes.\n\nIMPACTO DE APROVAR\nNenhuma mutação.\n\nPRÓXIMA DECISÃO DO CLIENTE\nDeseja revisar?",
                  },
                },
              ],
            };
          },
        },
      }
    );

    expect(result.status).toBe("respondido");
    expect(systemMessage).toContain("Fonte de evidências: local_db");
    expect(systemMessage).toContain("Nós EAP locais: 4");
    expect(systemMessage).toContain("MCP Cronograma indisponível");
    expect(systemMessage).toContain("Validação determinística: blocked");
    expect(systemMessage).toContain("A rede possui ciclo.");
  });

  it("expõe a equipe de engenharia como ferramenta de análise", () => {
    const tools = toOpenAiTools({
      eap: [],
      cronograma: [],
      ganttLob: [],
    });
    const teamTool = tools.find(tool => tool.function.name === "engineering_team_analysis");
    expect(teamTool).toBeDefined();
    expect(teamTool?.function.parameters).toMatchObject({
      type: "object",
      properties: {
        focus: {
          enum: ["geral", "eap", "cronograma", "producao", "lob"],
        },
      },
    });
  });

  it("não expõe ferramentas de escrita ao modelo", () => {
    const tools = toOpenAiTools({
      eap: [{ name: "criar_eap_node" }, { name: "get_eap_tree" }],
      cronograma: [],
      ganttLob: [],
    });
    expect(tools.map(tool => tool.function.name)).toContain("get_eap_tree");
    expect(tools.map(tool => tool.function.name)).not.toContain("criar_eap_node");
  });

  it("expõe ferramentas de escrita somente quando o modo de mutação está autorizado", () => {
    const tools = toOpenAiTools({
      eap: [{ name: "criar_eap_node" }, { name: "get_eap_tree" }],
      cronograma: [],
      ganttLob: [],
    }, true);
    expect(tools.map(tool => tool.function.name)).toContain("get_eap_tree");
    expect(tools.map(tool => tool.function.name)).toContain("criar_eap_node");
  });

  it("expõe o contrato completo da EAP publicado pelo MCP", () => {
    const readOnly = toOpenAiTools({
      eap: [
        { name: "listar_projetos" },
        { name: "listar_escopo" },
        { name: "validar_regra_100_porcento" },
        { name: "buscar_eap_node" },
      ],
      cronograma: [],
      ganttLob: [],
    });
    const readNames = readOnly.map(tool => tool.function.name);
    expect(readNames).toEqual(expect.arrayContaining([
      "listar_projetos",
      "listar_escopo",
      "validar_regra_100_porcento",
      "buscar_eap_node",
    ]));

    const mutations = toOpenAiTools({
      eap: [
        { name: "atualizar_projeto" },
        { name: "definir_criterio" },
        { name: "criar_item_escopo" },
        { name: "vincular_escopo_eap" },
        { name: "desvincular_escopo_eap" },
        { name: "deletar_projeto" },
      ],
      cronograma: [],
      ganttLob: [],
    }, true);
    const mutationNames = mutations.map(tool => tool.function.name);
    expect(mutationNames).toEqual(expect.arrayContaining([
      "atualizar_projeto",
      "definir_criterio",
      "criar_item_escopo",
      "vincular_escopo_eap",
      "desvincular_escopo_eap",
      "deletar_projeto",
    ]));
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
    ).rejects.toThrow("Ferramenta não autorizada pelo runtime");
  });
});