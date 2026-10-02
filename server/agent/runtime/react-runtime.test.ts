import { describe, expect, it } from "vitest";
import { runReActAgent } from "./react-runtime";

describe("ReAct runtime", () => {
  it("preserva reasoning_content ao continuar após tool call", async () => {
    const seen: any[] = [];
    let calls = 0;
    const result = await runReActAgent({
      messages: [{ role: "user", content: "Analise a EAP." }],
      tools: [{
        type: "function",
        function: { name: "consultar", parameters: { type: "object", properties: {} } },
      }],
      maxIterations: 3,
      callModel: async ({ messages }) => {
        seen.push(messages);
        calls += 1;
        if (calls === 1) {
          return {
            provider: "deepseek",
            model: "deepseek-reasoner",
            choices: [{
              message: {
                role: "assistant",
                content: null,
                reasoning_content: "preciso consultar a EAP antes de concluir",
                tool_calls: [{
                  id: "call-1",
                  type: "function",
                  function: { name: "consultar", arguments: "{}" },
                }],
              },
            }],
          };
        }
        return {
          provider: "deepseek",
          model: "deepseek-reasoner",
          choices: [{ message: { role: "assistant", content: "Diagnóstico final." } }],
        };
      },
      executeTool: async () => ({ ok: true, content: "{\"ok\":true}" }),
    });

    expect(result.text).toBe("Diagnóstico final.");
    expect(seen).toHaveLength(2);
    expect(seen[1].find((m: any) => m.role === "assistant")).toMatchObject({
      reasoning_content: "preciso consultar a EAP antes de concluir",
    });
  });

  it("permite mais de quatro ciclos quando o modelo precisa cruzar evidências", async () => {
    let calls = 0;
    const result = await runReActAgent({
      messages: [{ role: "user", content: "Faça uma análise cruzada." }],
      tools: [{
        type: "function",
        function: { name: "consultar", parameters: { type: "object", properties: {} } },
      }],
      maxIterations: 8,
      callModel: async () => {
        calls += 1;
        if (calls < 6) {
          return {
            choices: [{
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{
                  id: `call-${calls}`,
                  type: "function",
                  function: { name: "consultar", arguments: "{}" },
                }],
              },
            }],
          };
        }
        return { choices: [{ message: { role: "assistant", content: "Concluído após cruzamento." } }] };
      },
      executeTool: async () => ({ ok: true, content: "{}" }),
    });

    expect(result.iterations).toBe(6);
    expect(calls).toBe(6);
  });
});
