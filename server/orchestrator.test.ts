import { describe, expect, it, vi } from "vitest";
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
  it("separa a validação estrutural da EAP da prontidão do cronograma no contexto do chat", async () => {
    const sentMessages: any[] = [];
    const nodes = [
      { id: 1, code: "1", name: "Edifício", parentId: null, level: 1, nodeType: "grupo", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
      { id: 2, code: "1.1", name: "Estrutura", parentId: 1, level: 2, nodeType: "grupo", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
      { id: 3, code: "1.1.1", name: "Fundação", parentId: 2, level: 3, nodeType: "pacote", location: "Bloco A", responsible: "Engenharia", unit: "m³", plannedQuantity: 12, description: "Execução de fundações", inclusions: "Blocos e baldrames", exclusions: "Estacas", acceptanceCriteria: "Conforme projeto", scopeStatus: "rascunho", decompositionBasis: null },
    ];
    const localContext: AgentProjectContext = {
      ...context,
      evidence: {
        source: "local_db",
        eapNodeCount: nodes.length,
        activityCount: 0,
        dependencyCount: 0,
        warnings: [],
        errors: [],
        eapSnapshot: nodes,
        localEap: {
          nodeCount: 3,
          leafCount: 1,
          leavesWithDictionary: 1,
          leavesWithoutDictionary: 0,
          leavesWithQuantity: 1,
          leavesWithoutQuantity: 0,
          structureValidation: { status: "valid", issueCount: 0 },
        },
        eapDictionaryStandard: {
          status: "approved",
          requiredFields: ["description", "inclusions", "exclusions", "responsible", "acceptanceCriteria"],
          conditionalFields: ["unit", "plannedQuantity"],
          compliantLeafCount: 1,
          totalLeafCount: 1,
          leavesMissingRequiredFields: [],
        },
        eapStructuralValidation: {
          status: "valid",
          nodeCount: nodes.length,
          rootCount: 1,
          leafCount: 1,
          blockerCount: 0,
          warningCount: 0,
          issues: [],
        },
        validation: {
          status: "insufficient",
          blockerCount: 0,
          issues: [],
          projectDuration: null,
          criticalPath: [],
        },
      },
    };

    const result = await runProjectOrchestrator(
      localContext,
      [{ role: "user", content: "Audite a EAP atual, somente leitura." }],
      {
        mcpProjectIds: {},
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          callTool: async () => { throw new Error("não deveria chamar MCP"); },
          callLlm: async input => {
            sentMessages.push(...input.messages);
            return {
              model: "test-model",
              choices: [{ message: { role: "assistant", content: "Auditoria concluída." } }],
            };
          },
        },
      }
    );

    const systemPrompt = sentMessages
      .filter(message => message.role === "system")
      .map(message => String(message.content))
      .join("\n");
    expect(result.status).toBe("respondido");
    expect(systemPrompt).toContain("Validação estrutural local da EAP: válida");
    expect(systemPrompt).toContain("3 nós; raízes=1; folhas=1; bloqueadores=0; avisos=0");
    expect(systemPrompt).toContain("1.1.1 | Fundação | pacote | pai=2 | nível=3");
    expect(systemPrompt).toContain("1.1.1 | Fundação | pacote | pai=2 | nível=3 | unidade=m³ | quantidade=12");
    expect(systemPrompt).toContain("folhas com unidade e quantidade positiva=1; folhas sem ambos=0");
    expect(systemPrompt).toContain("1.1.1 (m³ 12)");
    expect(systemPrompt).toContain("preenchimento, não conformidade");
    expect(systemPrompt).toContain("origem não verificada nesta consulta");
    expect(systemPrompt).toContain("Dicionário de escopo: padrão aprovado; folhas conformes=1/1 segundo a regra registrada");
    expect(systemPrompt).toContain("campos condicionais=unit, plannedQuantity");
    expect(systemPrompt).toContain("Prontidão do cronograma (EAP + atividades/CPM): insufficient");
    expect(systemPrompt).not.toContain("Validação estrutural da EAP: não executada");
  });

  it("injeta automaticamente no contexto os avisos de escopo vistos na EAP", async () => {
    const nodes = [
      { id: 1, code: "1", name: "Obra", parentId: null, level: 1, nodeType: "grupo", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
      { id: 2, code: "1.1", name: "Fundação A", parentId: 1, level: 2, nodeType: "entrega", location: null, responsible: null, unit: null, plannedQuantity: null, description: "Formas, armaduras, concretagem e cura.", inclusions: "Formas, armaduras, concretagem e cura.", exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
      { id: 3, code: "1.2", name: "Fundação B", parentId: 1, level: 2, nodeType: "entrega", location: null, responsible: null, unit: null, plannedQuantity: null, description: "Formas, armaduras, concretagem e cura.", inclusions: "Formas, armaduras, concretagem e cura.", exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
    ];
    const sentMessages: any[] = [];
    const localContext: AgentProjectContext = {
      ...context,
      evidence: { source: "local_db", eapNodeCount: nodes.length, activityCount: 0, dependencyCount: 0, warnings: [], errors: [], eapSnapshot: nodes },
    };

    await runProjectOrchestrator(localContext, [{ role: "user", content: "Revise a EAP." }], {
      mcpProjectIds: {},
      deps: {
        listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
        callTool: async () => { throw new Error("não deveria chamar MCP"); },
        callLlm: async input => {
          sentMessages.push(...input.messages);
          return { model: "test-model", choices: [{ message: { role: "assistant", content: "Revisão concluída." } }] };
        },
      },
    });

    const systemPrompt = sentMessages.filter(message => message.role === "system").map(message => String(message.content)).join("\n");
    expect(systemPrompt).toContain("Diagnóstico determinístico local da EAP: snapshot completo; analisados=3; avisos=6");
    expect(systemPrompt).toContain("eap_scope_overlap_evidence");
    expect(systemPrompt).toContain("Fundação A");
    expect(systemPrompt).toContain("Fundação B");
    expect(systemPrompt).toContain("não significa aprovação");
    expect(systemPrompt.trimEnd()).toMatch(/Folha 1\.2 \(Fundação B\).*critério de aceitação\.$/);
  });

  it("uses local EAP validation when the project has no external MCP mapping", async () => {
    const localContext: AgentProjectContext = {
      ...context,
      evidence: {
        source: "local_db",
        eapNodeCount: 2,
        activityCount: 0,
        dependencyCount: 0,
        warnings: [],
        errors: [],
        eapSnapshot: [
          { id: 1, code: "1", name: "Edifício", parentId: null, level: 1, nodeType: "grupo", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
          { id: 2, code: "1.1", name: "Estrutura", parentId: 1, level: 2, nodeType: "pacote", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: "phase" },
        ],
      },
    };
    const result = await runProjectOrchestrator(
      localContext,
      [{ role: "user", content: "Valide a estrutura da EAP." }],
      {
        mcpProjectIds: {},
        deps: {
          listTools: async () => ({
            eap: [{ name: "validar_estrutura", description: "Valida a EAP", inputSchema: { type: "object", properties: {} } }],
            cronograma: [],
            ganttLob: [],
          }),
          callTool: async () => {
            throw new Error("não deveria chamar o MCP sem mapeamento");
          },
          callLlm: async ({ messages }) => {
            if (messages.length === 2) {
              return {
                model: "test-model",
                choices: [{
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "local-eap-validation",
                      type: "function",
                      function: { name: "validar_estrutura", arguments: "{}" },
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
                  content: "A validação estrutural local foi executada; o dicionário e a regra dos 100% continuam pendentes.",
                },
              }],
            };
          },
        },
      }
    );

    expect(result.status).toBe("respondido");
    const validationEvent = result.audit.find(event => event.toolName === "validar_estrutura");
    expect(validationEvent?.status).toBe("success");
    expect(validationEvent?.domain).toBe("runtime");
  });


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
      { messages: 2, tools: 24 },
      { messages: 4, tools: 24 },
    ]);
    // A evidência estruturada sai do rastro, não do texto do modelo.
    expect(result.evidence).toContainEqual({ source: "mcp_eap", toolName: "get_eap_tree" });
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

  it("preserva o resultado da EAP quando a síntese vem vazia, sem MCP", async () => {
    const proposal = {
      action: "propose_eap",
      basis: ["escopo declarado"],
      assumptions: [],
      missingInformation: ["quantitativos dependem dos projetos executivos"],
      nodes: [{ operation: "create", parentCode: "1", name: "Estrutura", nodeType: "grupo", rationale: "Organiza o escopo estrutural." }],
    } as const;
    const applyLocalEapProposal = vi.fn(async () => ({
      applied: true as const,
      created: 1,
      updated: 0,
      versionId: 12,
      versionNumber: 1,
      baselineCreated: false as const,
      approved: false as const,
      validation: { valid: true, issues: [] },
      verification: { persistenceVerified: true, nodeCount: 2, leafCount: 1, structuralErrors: 0, structuralWarnings: 0 },
    }));
    let llmCallCount = 0;
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Execute agora apenas a atualização reversível do pacote folha 1.6.1 na EAP local, preservando o rascunho sem aprovar a EAP ou criar baseline." }],
      {
        localProjectId: 25,
        userId: 42,
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          applyLocalEapProposal,
          callLlm: async ({ tools }) => {
            llmCallCount++;
            if (llmCallCount === 1) {
              expect(tools.some(tool => tool.function.name === "aplicar_proposta_eap_local")).toBe(true);
              return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "local-eap-1", type: "function", function: { name: "aplicar_proposta_eap_local", arguments: JSON.stringify({ proposal }) } }] } }] };
            }
            return { choices: [{ message: { role: "assistant", content: null } }] };
          },
        },
      },
    );

    expect(applyLocalEapProposal).toHaveBeenCalledWith({ projectId: 25, userId: 42, proposal });
    expect(result.readOnly).toBe(false);
    expect(result.audit).toContainEqual(expect.objectContaining({ toolName: "aplicar_proposta_eap_local", status: "success" }));
    expect(result.content).toContain("A EAP foi atualizada na versão de trabalho 1");
    expect(result.content).toContain("releitura confirmou 2 nós e 1 folhas");
    expect(result.content).toContain("nenhuma aprovação nem baseline foi criada");
    expect(applyLocalEapProposal).toHaveBeenCalledTimes(1);
    expect(llmCallCount).toBe(3);
  });

  it("permite ao Arquimedes atualizar somente os campos de escopo autorizados no banco local", async () => {
    const updateLocalProjectScope = vi.fn(async () => ({
      status: "updated_and_verified",
      updatedFields: ["descricao"],
      after: { name: "PROJETO ESCOLA ARQUIMEDES", descricao: "Escopo escolar didático." },
      verified: true,
    }));
    let llmCallCount = 0;
    const patch = { descricao: "Escopo escolar didático." };
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Atualize o escopo da obra para: Escopo escolar didático. Preserve nome, local, datas, orçamento, EAP e governança." }],
      {
        localProjectId: 25,
        userId: 42,
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          updateLocalProjectScope,
          callLlm: async ({ tools }) => {
            llmCallCount++;
            if (llmCallCount === 1) {
              expect(tools.some(tool => tool.function.name === "atualizar_escopo_obra_local")).toBe(true);
              return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "scope-update-1", type: "function", function: { name: "atualizar_escopo_obra_local", arguments: JSON.stringify(patch) } }] } }] };
            }
            return { choices: [{ message: { role: "assistant", content: "Escopo atualizado e conferido no registro da obra." } }] };
          },
        },
      },
    );

    expect(updateLocalProjectScope).toHaveBeenCalledWith({ projectId: 25, userId: 42, rawArgs: patch });
    expect(result.readOnly).toBe(false);
    expect(result.audit).toContainEqual(expect.objectContaining({ toolName: "atualizar_escopo_obra_local", status: "success" }));
    expect(result.content).toContain("Escopo atualizado e conferido");
  });

  it("não expõe a ferramenta local de atualização de escopo durante uma consulta", async () => {
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "O que consta no escopo desta obra?" }],
      {
        localProjectId: 25,
        userId: 42,
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          callLlm: async ({ tools }) => {
            expect(tools.some(tool => tool.function.name === "atualizar_escopo_obra_local")).toBe(false);
            return { choices: [{ message: { role: "assistant", content: "O registro contém o escopo atual." } }] };
          },
        },
      },
    );

    expect(result.readOnly).toBe(true);
  });

  it("aceita ordem direta para criar atividade local sem exigir confirmação em duas mensagens", async () => {
    const createLocalActivity = vi.fn(async () => ({ id: 9, name: "Execução de alvenaria", versionNumber: 2 }));
    let llmCallCount = 0;
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Crie a atividade de alvenaria para a EAP aprovada" }],
      {
        localProjectId: 25,
        userId: 42,
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          createLocalActivity,
          callLlm: async () => {
            llmCallCount++;
            if (llmCallCount === 1) {
              return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "activity-1", type: "function", function: { name: "criar_atividade_local", arguments: JSON.stringify({ eapRef: "1.1", name: "Execução de alvenaria", durationDays: 5 }) } }] } }] };
            }
            return { choices: [{ message: { role: "assistant", content: "Atividade registrada na versão de trabalho." } }] };
          },
        },
      },
    );

    expect(createLocalActivity).toHaveBeenCalledWith({
      projectId: 25,
      userId: 42,
      rawArgs: { eap_ref: "1.1", name: "Execução de alvenaria", durationDays: 5, plannedQuantity: undefined, unit: undefined, productivity: undefined, productivityUnit: undefined, source: undefined },
    });
    expect(result.audit).toContainEqual(expect.objectContaining({ toolName: "criar_atividade_local", status: "success" }));
  });

  it("consulta atividades locais sem MCP e fornece IDs para o agente montar dependências", async () => {
    const listLocalActivities = vi.fn(async () => ({
      versionId: 18,
      status: "draft",
      activities: [{ id: 41, wbsCode: "1.1", name: "Fundação", durationDays: 5 }],
    }));
    let llmCallCount = 0;
    const result = await runProjectOrchestrator(context, [{ role: "user", content: "Mostre as atividades cadastradas nesta obra" }], {
      localProjectId: 25,
      userId: 42,
      deps: {
        listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
        listLocalActivities,
        callLlm: async ({ tools }) => {
          llmCallCount++;
          expect(tools.some(tool => tool.function.name === "consultar_atividades_locais")).toBe(true);
          expect(tools.some(tool => tool.function.name === "criar_dependencias_locais")).toBe(false);
          if (llmCallCount === 1) return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "list-activities", type: "function", function: { name: "consultar_atividades_locais", arguments: JSON.stringify({}) } }] } }] };
          return { choices: [{ message: { role: "assistant", content: "Atividade 41: Fundação." } }] };
        },
      },
    });

    expect(listLocalActivities).toHaveBeenCalledWith({ projectId: 25, limit: undefined });
    expect(result.audit).toContainEqual(expect.objectContaining({ toolName: "consultar_atividades_locais", status: "success" }));
    expect(result.content).toContain("Atividade 41");
  });

  it("grava dependências locais somente após ordem operacional explícita", async () => {
    const createLocalDependencies = vi.fn(async () => ({ created: 1, skipped: 0, verified: true, warning: null }));
    let llmCallCount = 0;
    const result = await runProjectOrchestrator(context, [{ role: "user", content: "Crie a dependência FS da atividade 41 para a 42" }], {
      localProjectId: 25,
      userId: 42,
      deps: {
        listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
        createLocalDependencies,
        callLlm: async ({ tools }) => {
          llmCallCount++;
          expect(tools.some(tool => tool.function.name === "criar_dependencias_locais")).toBe(true);
          if (llmCallCount === 1) return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "create-dependencies", type: "function", function: { name: "criar_dependencias_locais", arguments: JSON.stringify({ dependencies: [{ predecessorId: 41, successorId: 42, type: "FS", lag: 0 }] }) } }] } }] };
          return { choices: [{ message: { role: "assistant", content: "Dependência gravada e conferida." } }] };
        },
      },
    });

    expect(createLocalDependencies).toHaveBeenCalledWith({
      projectId: 25,
      userId: 42,
      dependencies: [{ predecessorId: 41, successorId: 42, type: "FS", lag: 0 }],
    });
    expect(result.audit).toContainEqual(expect.objectContaining({ toolName: "criar_dependencias_locais", status: "success" }));
    expect(result.readOnly).toBe(false);
  });

  it("preserva o resultado da EAP quando a síntese vem vazia, sem MCP", async () => {
    const proposal = {
      action: "propose_eap",
      basis: ["escopo declarado"],
      assumptions: [],
      missingInformation: ["quantitativos dependem dos projetos executivos"],
      nodes: [{ operation: "create", parentCode: "1", name: "Estrutura", nodeType: "grupo", rationale: "Organiza o escopo estrutural." }],
    } as const;
    const applyLocalEapProposal = vi.fn(async () => ({
      applied: true as const,
      created: 1,
      updated: 0,
      versionId: 12,
      versionNumber: 1,
      baselineCreated: false as const,
      approved: false as const,
      validation: { valid: true, issues: [] },
      verification: { persistenceVerified: true, nodeCount: 2, leafCount: 1, structuralErrors: 0, structuralWarnings: 0 },
    }));
    let llmCallCount = 0;
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Preencha a EAP local com a estrutura suportada pelo escopo" }],
      {
        localProjectId: 25,
        userId: 42,
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          applyLocalEapProposal,
          callLlm: async ({ tools }) => {
            llmCallCount++;
            if (llmCallCount === 1) {
              expect(tools.some(tool => tool.function.name === "aplicar_proposta_eap_local")).toBe(true);
              return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "local-eap-1", type: "function", function: { name: "aplicar_proposta_eap_local", arguments: JSON.stringify({ proposal }) } }] } }] };
            }
            return { choices: [{ message: { role: "assistant", content: null } }] };
          },
        },
      },
    );

    expect(applyLocalEapProposal).toHaveBeenCalledWith({ projectId: 25, userId: 42, proposal });
    expect(result.readOnly).toBe(false);
    expect(result.audit).toContainEqual(expect.objectContaining({ toolName: "aplicar_proposta_eap_local", status: "success" }));
    expect(result.content).toContain("A EAP foi atualizada na versão de trabalho 1");
    expect(result.content).toContain("releitura confirmou 2 nós e 1 folhas");
    expect(result.content).toContain("nenhuma aprovação nem baseline foi criada");
    expect(applyLocalEapProposal).toHaveBeenCalledTimes(1);
    expect(llmCallCount).toBe(3);
  });

  it("inclui a fonte local e os avisos de integração no contexto do modelo", async () => {
    let systemMessage = "";
    const result = await runProjectOrchestrator(
      {
        ...context,
        evidence: {
          source: "local_db",
          eapNodeCount: 4,
          activityCount: 3,
          dependencyCount: null,
          warnings: ["Nenhuma dependência cadastrada para a obra.", "MCP Cronograma indisponível; fallback local utilizado."],
          errors: [],
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
          listTools: async () => ({
            eap: [],
            cronograma: [],
            ganttLob: [],
            errors: { cronograma: "URL do MCP não configurada" },
          }),
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
    expect(systemMessage).toContain(
      "FONTES EXTERNAS OPCIONAIS INDISPONÍVEIS NESTA EXECUÇÃO"
    );
    expect(systemMessage).toContain(
      "consulta externa de atividades e cronograma"
    );
    expect(systemMessage).not.toContain("URL do MCP não configurada");
    expect(systemMessage).toContain("Nós EAP locais: 4");
    expect(systemMessage).toContain("MCP Cronograma indisponível");
    expect(systemMessage).toContain("Planejamento de cronograma local não depende de vínculo MCP externo");
    expect(systemMessage).toContain("Prontidão do cronograma (EAP + atividades/CPM): blocked");
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

  it("oferece ferramenta de proposta da EAP local somente em operação explícita", () => {
    const readOnly = toOpenAiTools({ eap: [], cronograma: [], ganttLob: [] });
    const operational = toOpenAiTools({ eap: [], cronograma: [], ganttLob: [] }, true);

    expect(readOnly.map(tool => tool.function.name)).not.toContain("aplicar_proposta_eap_local");
    const localEapTool = operational.find(tool => tool.function.name === "aplicar_proposta_eap_local");
    expect(localEapTool).toBeDefined();
    expect(localEapTool?.function.parameters).toMatchObject({
      type: "object",
      required: ["proposal"],
    });
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

  it("bloqueia a escrita no repositório para quem não é administrador", async () => {
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Atualize o arquivo server/orchestrator.ts" }],
      {
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          callLlm: async ({ messages }) => {
            if (messages.length === 2) {
              return {
                model: "test-model",
                choices: [{
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "repo-1",
                      type: "function",
                      function: {
                        name: "repository_update_file",
                        arguments: "{\"path\":\"server/orchestrator.ts\",\"content\":\"x\",\"message\":\"m\",\"expectedSha\":\"abc\"}",
                      },
                    }],
                  },
                }],
              };
            }
            return {
              model: "test-model",
              choices: [{ message: { role: "assistant", content: "Não alterei o repositório." } }],
            };
          },
        },
      }
    );

    const event = result.audit.find(item => item.toolName === "repository_update_file");
    expect(event?.status).toBe("error");
    expect(event?.error).toContain("restrita a administradores");
  });

  it("não bloqueia a escrita no repositório para administrador (falha na configuração, não no gate)", async () => {
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Atualize o arquivo server/orchestrator.ts" }],
      {
        userIsAdmin: true,
        deps: {
          listTools: async () => ({ eap: [], cronograma: [], ganttLob: [] }),
          callLlm: async ({ messages }) => {
            if (messages.length === 2) {
              return {
                model: "test-model",
                choices: [{
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "repo-2",
                      type: "function",
                      function: {
                        name: "repository_update_file",
                        arguments: "{\"path\":\"server/orchestrator.ts\",\"content\":\"x\",\"message\":\"m\",\"expectedSha\":\"abc\"}",
                      },
                    }],
                  },
                }],
              };
            }
            return {
              model: "test-model",
              choices: [{ message: { role: "assistant", content: "Não alterei o repositório." } }],
            };
          },
        },
      }
    );

    const event = result.audit.find(item => item.toolName === "repository_update_file");
    expect(event?.status).toBe("error");
    expect(event?.error ?? "").not.toContain("restrita a administradores");
  });

  it("bloqueia mutação pedida sem confirmação explícita", async () => {
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "Crie uma atividade para a fundação" }],
      {
        deps: {
          listTools: async () => ({
            eap: [{ name: "criar_eap_node", description: "Cria nó", inputSchema: { type: "object", properties: {} } }],
            cronograma: [],
            ganttLob: [],
          }),
          callLlm: async ({ messages }) => {
            if (messages.length === 2) {
              return {
                model: "test-model",
                choices: [{
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "mut-1",
                      type: "function",
                      function: { name: "criar_eap_node", arguments: "{}" },
                    }],
                  },
                }],
              };
            }
            return {
              model: "test-model",
              choices: [{ message: { role: "assistant", content: "Proposta apresentada; aguardando confirmação." } }],
            };
          },
        },
      }
    );

    const event = result.audit.find(item => item.toolName === "criar_eap_node");
    expect(event?.status).toBe("error");
    expect(event?.error).toContain("confirmação explícita");
  });

  it("permite mutação quando há confirmação explícita", async () => {
    const result = await runProjectOrchestrator(
      context,
      [{ role: "user", content: "confirmo, pode aplicar" }],
      {
        deps: {
          listTools: async () => ({
            eap: [{ name: "criar_eap_node", description: "Cria nó", inputSchema: { type: "object", properties: {} } }],
            cronograma: [],
            ganttLob: [],
          }),
          callLlm: async ({ messages }) => {
            if (messages.length === 2) {
              return {
                model: "test-model",
                choices: [{
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [{
                      id: "mut-2",
                      type: "function",
                      function: { name: "criar_eap_node", arguments: "{}" },
                    }],
                  },
                }],
              };
            }
            return {
              model: "test-model",
              choices: [{ message: { role: "assistant", content: "Aplicado." } }],
            };
          },
        },
      }
    );

    const event = result.audit.find(item => item.toolName === "criar_eap_node");
    expect(event?.status).toBe("error");
    expect(event?.error ?? "").not.toContain("confirmação explícita");
  });
});

