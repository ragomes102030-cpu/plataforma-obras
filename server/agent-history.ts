export type PersistedAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY_MESSAGE_CHARS = 9_000;

function compactHistoryMessage(message: PersistedAgentMessage): PersistedAgentMessage {
  if (message.content.length <= MAX_HISTORY_MESSAGE_CHARS) return message;
  const budget = MAX_HISTORY_MESSAGE_CHARS - 80;
  const head = Math.floor(budget * 0.7);
  const tail = budget - head;
  return {
    role: message.role,
    content: [
      message.content.slice(0, head),
      "",
      "[...trecho intermediário compactado do histórico do Arquimedes...]",
      "",
      message.content.slice(-tail),
    ].join("\n"),
  };
}

function compactHistory(messages: PersistedAgentMessage[], maxMessages: number) {
  return messages
    .slice(-maxMessages)
    .map(compactHistoryMessage);
}

export function restoreAgentConversation(
  contextJson: string,
  resultJson: string | null,
  status: string,
  errorMessage: string | null = null,
): PersistedAgentMessage[] {
  let messages: PersistedAgentMessage[] = [];
  try {
    const context = JSON.parse(contextJson) as { messages?: unknown };
    if (Array.isArray(context.messages)) {
      messages = context.messages.filter(
        (message): message is PersistedAgentMessage =>
          Boolean(message) &&
          typeof message === "object" &&
          (((message as { role?: unknown }).role === "user") ||
            ((message as { role?: unknown }).role === "assistant")) &&
          typeof (message as { content?: unknown }).content === "string"
      );
    }
  } catch {
    messages = [];
  }

  let restoredResult = false;
  if (status !== "executando" && resultJson) {
    try {
      const result = JSON.parse(resultJson) as { content?: unknown };
      if (typeof result.content === "string" && result.content.trim()) {
        messages = [
          ...messages,
          { role: "assistant", content: result.content },
        ];
        restoredResult = true;
      }
    } catch {
      // A conversa anterior continua recuperável mesmo com resultado inválido.
    }
  }

  if (status !== "executando" && !restoredResult && errorMessage?.trim()) {
    messages = [
      ...messages,
      { role: "assistant", content: `A execução falhou: ${errorMessage.trim().slice(0, 1_000)}` },
    ];
  }

  return messages;
}


export type PersistedAgentRun = {
  requestId: string;
  status: string;
  contextJson: string;
  resultJson: string | null;
  errorMessage?: string | null;
};

export function mergeAgentConversations(
  runs: PersistedAgentRun[],
): PersistedAgentMessage[] {
  const messages: PersistedAgentMessage[] = [];
  for (const run of [...runs].reverse()) {
    const restored = restoreAgentConversation(run.contextJson, run.resultJson, run.status, run.errorMessage);
    // `contextJson.messages` é um snapshot da conversa até o envio, não um
    // delta. Mesclar mensagem por mensagem duplica todo o histórico em cada
    // execução e faz instruções antigas dominarem os próximos pedidos.
    // Sobreponha o sufixo já reconstruído ao prefixo do snapshot seguinte.
    const merged = mergePersistedWithIncoming(messages, restored, 20);
    messages.splice(0, messages.length, ...merged);
  }
  return messages;
}

export function mergePersistedWithIncoming(
  persisted: PersistedAgentMessage[],
  incoming: PersistedAgentMessage[],
  maxMessages = 20,
): PersistedAgentMessage[] {
  if (incoming.length === 0) return compactHistory(persisted, maxMessages);
  if (persisted.length === 0) return compactHistory(incoming, maxMessages);

  const maxOverlap = Math.min(persisted.length, incoming.length);
  let overlap = 0;
  for (let size = maxOverlap; size > 0; size -= 1) {
    const persistedTail = persisted.slice(-size);
    const incomingHead = incoming.slice(0, size);
    if (
      persistedTail.every(
        (message, index) =>
          message.role === incomingHead[index]?.role &&
          message.content === incomingHead[index]?.content,
      )
    ) {
      overlap = size;
      break;
    }
  }

  return compactHistory([...persisted, ...incoming.slice(overlap)], maxMessages);
}
