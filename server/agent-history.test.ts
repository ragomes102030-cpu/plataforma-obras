import { describe, expect, it } from "vitest";
import {
  filterAgentRunsByConversation,
  LEGACY_AGENT_CONVERSATION_ID,
  mergeAgentConversations,
  restoreAgentConversation,
} from "./agent-history";

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

  it("mantém visível a causa de uma execução terminal que falhou", () => {
    expect(restoreAgentConversation(
      JSON.stringify({ messages: [{ role: "user", content: "Aplique a EAP." }] }),
      null,
      "falhou",
      "Argumentos inválidos para a ferramenta aplicar_proposta_eap_local.",
    )).toEqual([
      { role: "user", content: "Aplique a EAP." },
      { role: "assistant", content: "A execução falhou: Argumentos inválidos para a ferramenta aplicar_proposta_eap_local." },
    ]);
  });

  it("não repete a falha quando já existe resposta final persistida", () => {
    expect(restoreAgentConversation(
      JSON.stringify({ messages: [{ role: "user", content: "Aplique a EAP." }] }),
      JSON.stringify({ content: "A operação não foi concluída." }),
      "falhou",
      "Erro interno bruto",
    )).toEqual([
      { role: "user", content: "Aplique a EAP." },
      { role: "assistant", content: "A operação não foi concluída." },
    ]);
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

  it("reconstrói snapshots sucessivos sem repetir todo o histórico anterior", () => {
    const firstContext = JSON.stringify({
      messages: [{ role: "user", content: "Diagnostique a EAP." }],
    });
    const secondContext = JSON.stringify({
      messages: [
        { role: "user", content: "Diagnostique a EAP." },
        { role: "assistant", content: "Há 17 nós e 14 folhas." },
        { role: "user", content: "Agora preencha o rascunho." },
      ],
    });
    const result = mergeAgentConversations([
      {
        requestId: "run-2",
        status: "respondido",
        contextJson: secondContext,
        resultJson: JSON.stringify({ content: "Vou propor alterações." }),
      },
      {
        requestId: "run-1",
        status: "respondido",
        contextJson: firstContext,
        resultJson: JSON.stringify({ content: "Há 17 nós e 14 folhas." }),
      },
    ]);

    expect(result).toEqual([
      { role: "user", content: "Diagnostique a EAP." },
      { role: "assistant", content: "Há 17 nós e 14 folhas." },
      { role: "user", content: "Agora preencha o rascunho." },
      { role: "assistant", content: "Vou propor alterações." },
    ]);
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

describe("isolamento das conversas do Arquimedes", () => {
  const runs = [
    {
      requestId: "newer",
      status: "respondido",
      contextJson: JSON.stringify({ conversationId: "sessao-nova", messages: [] }),
      resultJson: JSON.stringify({ content: "Resposta nova" }),
    },
    {
      requestId: "older",
      status: "respondido",
      contextJson: JSON.stringify({ messages: [{ role: "user", content: "Histórico antigo" }] }),
      resultJson: JSON.stringify({ content: "Resposta antiga" }),
    },
  ];

  it("mantém o histórico de sessões novas isolado das execuções antigas", () => {
    expect(filterAgentRunsByConversation(runs, "sessao-nova").map(run => run.requestId)).toEqual(["newer"]);
    expect(filterAgentRunsByConversation(runs, LEGACY_AGENT_CONVERSATION_ID).map(run => run.requestId)).toEqual(["older"]);
  });

  it("mantém contexto inválido na sessão legada sem contaminar sessões novas", () => {
    const malformed = [{ requestId: "broken", status: "falhou", contextJson: "não é json", resultJson: null }];
    expect(filterAgentRunsByConversation(malformed, LEGACY_AGENT_CONVERSATION_ID)).toEqual(malformed);
    expect(filterAgentRunsByConversation(malformed, "sessao-nova")).toEqual([]);
  });
});
