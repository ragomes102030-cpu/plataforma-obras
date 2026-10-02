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
});
