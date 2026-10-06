import { describe, expect, it } from "vitest";
import { mergeAgentConversations, restoreAgentConversation } from "./agent-history";

describe("restoreAgentConversation", () => {
  it("recupera a conversa persistida e a resposta final sem alterar o estado da obra", () => {
    const messages = restoreAgentConversation(
      JSON.stringify({
        context: { project: { code: "OB-SYAE5F" } },
        messages: [
          { role: "user", content: "Faça o diagnóstico da EAP sem alterar nada." },
          { role: "assistant", content: "A EAP está vazia; vou propor uma estrutura." },
          { role: "user", content: "Apresente a proposta completa." },
        ],
      }),
      JSON.stringify({
        status: "respondido",
        content: "PROPOSTA EAP — nada foi gravado na obra.",
      }),
      "respondido",
    );

    expect(messages).toEqual([
      { role: "user", content: "Faça o diagnóstico da EAP sem alterar nada." },
      { role: "assistant", content: "A EAP está vazia; vou propor uma estrutura." },
      { role: "user", content: "Apresente a proposta completa." },
      { role: "assistant", content: "PROPOSTA EAP — nada foi gravado na obra." },
    ]);
  });

  it("não inventa mensagens quando o contexto persistido está inválido", () => {
    expect(restoreAgentConversation("não é json", null, "falhou")).toEqual([]);
  });

  it("recupera também uma resposta que aguarda confirmação", () => {
    const messages = restoreAgentConversation(
      JSON.stringify({
        messages: [{ role: "user", content: "Pode aplicar?" }],
      }),
      JSON.stringify({ content: "A proposta está pronta. Aguardo confirmação explícita." }),
      "aguardando_confirmacao",
    );

    expect(messages.at(-1)).toEqual({
      role: "assistant",
      content: "A proposta está pronta. Aguardo confirmação explícita.",
    });
  });
});


describe("mergePersistedWithIncoming", () => {
  it("recupera o histórico no backend quando a UI envia somente a nova pergunta", async () => {
    const { mergePersistedWithIncoming } = await import("./agent-history");
    const persisted = [
      { role: "user" as const, content: "Qual é o diagnóstico?" },
      { role: "assistant" as const, content: "A EAP está vazia." },
    ];
    const result = mergePersistedWithIncoming(persisted, [
      { role: "user", content: "E qual é a proposta?" },
    ]);
    expect(result).toEqual([
      ...persisted,
      { role: "user", content: "E qual é a proposta?" },
    ]);
  });

  it("compacta mensagens históricas longas antes de reenviar ao provider", async () => {
    const { mergePersistedWithIncoming } = await import("./agent-history");
    const longMessage = "x".repeat(12_500);
    const result = mergePersistedWithIncoming(
      [{ role: "assistant", content: longMessage }],
      [{ role: "user", content: "nova pergunta" }],
    );
    expect(result[0]?.content.length).toBeLessThanOrEqual(9_000);
    expect(result.at(-1)).toEqual({ role: "user", content: "nova pergunta" });
    expect(result[0]?.content).toContain("compactado");
  });

  it("não duplica o histórico quando a UI já envia mensagens persistidas", async () => {
    const { mergePersistedWithIncoming } = await import("./agent-history");
    const persisted = [
      { role: "user" as const, content: "Pergunta 1" },
      { role: "assistant" as const, content: "Resposta 1" },
    ];
    const result = mergePersistedWithIncoming(persisted, [
      ...persisted,
      { role: "user", content: "Pergunta 2" },
    ]);
    expect(result).toEqual([
      ...persisted,
      { role: "user", content: "Pergunta 2" },
    ]);
  });
});
