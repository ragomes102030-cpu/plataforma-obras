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
): PersistedAgentMessage[] {
  let messages: PersistedAgentMessage[] = [];