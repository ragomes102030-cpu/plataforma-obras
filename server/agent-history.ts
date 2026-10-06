export type PersistedAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY_MESSAGE_CHARS = 9_000;

function compactHistoryMessage(message: PersistedAgentMessage): PersistedAgentMessage {
  if (message.content.length <= MAX_HISTORY_MESSAGE_CHARS) return message;
  const marker = "\n\n[...trecho intermediário compactado do histórico do Arquimedes...]\n\n";
  const available = MAX_HISTORY_MESSAGE_CHARS - marker.length;
  const head = Math.floor(available * 0.7);
  const tail = available - head;
  return {
    role: message.role,
    content: [
      message.content.slice(0, head),
      marker.trim(),
      message.content.slice(-tail),
    ].join("\n\n"),
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
): PersistedAgentMessage[] {
  let messages: PersistedAgentMessage[] = [];