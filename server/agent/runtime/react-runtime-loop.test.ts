import { describe, expect, it } from "vitest";
import { runReActAgent } from "./react-runtime";

describe("runReActAgent", () => {
  it("reserva a última iteração para síntese sem ferramentas", async () => {
    const tool = {
      type: "function" as const,
      function: {
        name: "consultar_eap",
        description: "Consulta a EAP.",
        parameters: { type: "object", properties: {} },
      },
    };

    const toolsSeen: number[] = [];
    const systemMessagesSeen: string[] = [];
    let modelCalls = 0;
    let executedTools = 0;

    const result = await runReActAgent({
      messages: [{ role: "user", content: "Analise a EAP." }],
      tools: [tool],
      maxIterations: 3,
      callModel: async ({ messages, tools }) => {
        modelCalls += 1;
        toolsSeen.push(tools.length);
        systemMessagesSeen.push(
          messages
            .filter(message => message.role === "system")
            .map(message => typeof message.content === "string" ? message.content : "")
            .join("\n")
        );

        if (modelCalls < 3) {
          return {
            model: "test-model",
            provider: "test-provider",
            choices: [{
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                  id: `call-${modelCalls}`,
                  type: "function",
                  function: {
                    name: "consultar_eap",
                    arguments: "{}",
                  },
                }],
              },
            }],
          };
        }

        return {
          model: "test-model",
          provider: "test-provider",
          choices: [{
            message: {
              role: "assistant",
              content: "Diagnóstico final com as evidências disponíveis.",
            },
          }],
        };
      },
      executeTool: async () => {
        executedTools += 1;
        return { ok: true, content: "EAP consultada com sucesso." };
      },
    });

    expect(result.text).toBe("Diagnóstico final com as evidências disponíveis.");
    expect(result.iterations).toBe(3);
    expect(modelCalls).toBe(3);
    expect(executedTools).toBe(2);
    expect(toolsSeen).toEqual([1, 1, 0]);
    expect(systemMessagesSeen[2]).toContain("ENCERRAMENTO OBRIGATÓRIO");
  });

  it("respeita o orçamento acumulado de resultados (contexto limitado)", async () => {
    const tool = {
      type: "function" as const,
      function: { name: "consultar_eap", parameters: { type: "object", properties: {} } },
    };
    const toolMessages: string[] = [];
    let modelCalls = 0;

    const result = await runReActAgent({
      messages: [{ role: "user", content: "Analise a EAP." }],
      tools: [tool],
      maxIterations: 3,
      maxToolResultChars: 8_000,
      maxToolResultBudget: 120,
      callModel: async ({ messages }) => {
        modelCalls += 1;
        // A conversa acumula; interessa o resultado desta chamada (o último).
        const lastTool = [...messages]
          .reverse()
          .find(message => message.role === "tool" && typeof message.content === "string");
        if (lastTool && typeof lastTool.content === "string") {
          toolMessages.push(lastTool.content);
        }
        if (modelCalls < 3) {
          return {
            model: "test-model",
            provider: "test-provider",
            choices: [{
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: `call-${modelCalls}`, type: "function", function: { name: "consultar_eap", arguments: "{}" } }],
              },
            }],
          };
        }
        return {
          model: "test-model",
          provider: "test-provider",
          choices: [{ message: { role: "assistant", content: "Final." } }],
        };
      },
      executeTool: async () => ({ ok: true, content: "X".repeat(200) }),
    });

    expect(result.text).toBe("Final.");
    expect(toolMessages).toHaveLength(2);
    // O primeiro resultado coube (limitado); o segundo já estourou o orçamento.
    expect(toolMessages[0]).toContain("X");
    expect(toolMessages[1]).toContain("orçamento de contexto");
  });

  it("retorna imediatamente quando o modelo conclui antes do limite", async () => {
    const calls: number[] = [];
    const result = await runReActAgent({
      messages: [{ role: "user", content: "Qual o status?" }],
      tools: [{
        type: "function",
        function: {
          name: "consultar_status",
          parameters: { type: "object", properties: {} },
        },
      }],
      maxIterations: 4,
      callModel: async ({ tools }) => {
        calls.push(tools.length);
        return {
          model: "test-model",
          provider: "test-provider",
          choices: [{
            message: {
              role: "assistant",
              content: "A obra está em andamento.",
            },
          }],
        };
      },
      executeTool: async () => ({ ok: true, content: "não deve ser chamado" }),
    });

    expect(result.text).toBe("A obra está em andamento.");
    expect(result.iterations).toBe(1);
    expect(calls).toEqual([1]);
  });

  it("continua uma resposta truncada sem ferramentas e concatena o trecho final", async () => {
    const calls: Array<{ toolCount: number; messages: Array<{ role: string; content: unknown }> }> = [];
    let toolExecutions = 0;
    const result = await runReActAgent({
      messages: [{ role: "user", content: "Audite a EAP." }],
      tools: [{
        type: "function",
        function: { name: "aplicar_proposta_eap_local", parameters: { type: "object" } },
      }],
      maxIterations: 1,
      callModel: async input => {
        calls.push({ toolCount: input.tools.length, messages: input.messages });
        if (calls.length === 1) {
          return {
            choices: [{
              finish_reason: "length",
              message: { role: "assistant", content: "O achado principal é" },
            }],
          };
        }
        return {
          choices: [{
            finish_reason: "stop",
            message: { role: "assistant", content: "a quantidade sem base comprovada." },
          }],
        };
      },
      executeTool: async () => {
        toolExecutions++;
        return { ok: true, content: "não deveria executar" };
      },
    });

    expect(result.text).toBe("O achado principal é\n\na quantidade sem base comprovada.");
    expect(result.iterations).toBe(2);
    expect(calls.map(call => call.toolCount)).toEqual([0, 0]);
    expect(calls[1]?.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: "O achado principal é",
    }));
    expect(calls[1]?.messages.at(-1)?.content).toContain("Continue exatamente");
    expect(toolExecutions).toBe(0);
  });

  it("marca a resposta como parcial quando o provedor continua cortando após duas tentativas", async () => {
    let modelCalls = 0;
    const result = await runReActAgent({
      messages: [{ role: "user", content: "Faça uma auditoria extensa." }],
      tools: [],
      maxIterations: 1,
      callModel: async () => {
        modelCalls++;
        return {
          choices: [{
            finish_reason: "length",
            message: { role: "assistant", content: `Trecho ${modelCalls}` },
          }],
        };
      },
      executeTool: async () => ({ ok: true, content: "sem ferramentas" }),
    });

    expect(modelCalls).toBe(3);
    expect(result.text).toContain("Resposta ainda interrompida");
    expect(result.text).toContain("Peça “continue”");
    expect(result.text.length).toBeLessThanOrEqual(11_000);
  });

  it("devolve argumentos malformados ao modelo para recuperação sem executar a ferramenta", async () => {
    const modelInputs: Array<{ messages: Array<{ role: string; tool_call_id?: string; content: unknown }> }> = [];
    let modelCalls = 0;
    let executions = 0;
    const result = await runReActAgent({
      messages: [{ role: "user", content: "Atualize a EAP." }],
      tools: [{
        type: "function",
        function: { name: "aplicar_proposta_eap_local", parameters: { type: "object" } },
      }],
      maxIterations: 3,
      callModel: async input => {
        modelInputs.push(input as typeof modelInputs[number]);
        modelCalls += 1;
        if (modelCalls === 1) {
          return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{
            id: "call-invalid",
            type: "function",
            function: { name: "aplicar_proposta_eap_local", arguments: "{proposal:" },
          }] } }] };
        }
        return { choices: [{ message: { role: "assistant", content: "A chamada estava malformada; não alterei a EAP." } }] };
      },
      executeTool: async () => {
        executions += 1;
        return { ok: true, content: "alterado" };
      },
    });

    expect(result.text).toContain("não alterei a EAP");
    expect(modelCalls).toBe(2);
    expect(executions).toBe(0);
    expect(modelInputs[1]?.messages).toContainEqual(expect.objectContaining({
      role: "tool",
      tool_call_id: "call-invalid",
      content: expect.stringContaining("Argumentos inválidos"),
    }));
  });
});
