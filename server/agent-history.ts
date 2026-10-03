export type PersistedAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export function restoreAgentConversation(
  contextJson: string,
  resultJson: string | null,
  status: string,
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

  if (status !== "executando" && resultJson) {
    try {
      const result = JSON.parse(resultJson) as { content?: unknown };
      if (typeof result.content === "string" && result.content.trim()) {
        messages = [
          ...messages,
          { role: "assistant", content: result.content },
        ];
      }
    } catch {
      // A conversa anterior continua recuperável mesmo com resultado inválido.
    }
  }

  return messages;
}


export type PersistedAgentRun = {
  requestId: string;
  status: string;
  contextJson: string;
  resultJson: string | null;
};

export function mergeAgentConversations(
  runs: PersistedAgentRun[],
): PersistedAgentMessage[] {
  const messages: PersistedAgentMessage[] = [];
  for (const run of [...runs].reverse()) {
    const restored = restoreAgentConversation(run.contextJson, run.resultJson, run.status);
    for (const message of restored) {
      const previous = messages[messages.length - 1];
      if (previous?.role === message.role && previous.content === message.content) continue;
      messages.push(message);
    }
  }
  return messages;
}
