export type ReActMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type ReActTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type ReActAgentResult = {
  text: string;
  iterations: number;
  provider?: string;
  model?: string;
};

export async function runReActAgent(input: {
  messages: ReActMessage[];
  tools: ReActTool[];
  maxIterations?: number;
  callModel: (input: {
    messages: ReActMessage[];
    tools: ReActTool[];
  }) => Promise<{
    provider?: string;
    model?: string;
    choices?: Array<{
      message?: {
        role?: "assistant";
        content?: string | null;
        reasoning_content?: string;
        tool_calls?: ReActMessage["tool_calls"];
      };
    }>;
  }>;
  executeTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ ok?: boolean; content?: string; [key: string]: unknown }>;
}): Promise<ReActAgentResult> {
  const maxIterations =
    Number.isFinite(input.maxIterations) && (input.maxIterations ?? 0) > 0
      ? Math.floor(input.maxIterations!)
      : 8;

  const conversation = [...input.messages];
  let lastProvider: string | undefined;
  let lastModel: string | undefined;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const response = await input.callModel({
      messages: conversation,
      tools: input.tools,
    });
    lastProvider = response.provider;
    lastModel = response.model;

    const assistant = response.choices?.[0]?.message;
    if (!assistant) throw new Error("O modelo não retornou uma mensagem válida.");

    conversation.push({
      role: "assistant",
      content: assistant.content ?? null,
      reasoning_content: assistant.reasoning_content,
      tool_calls: assistant.tool_calls,
    });

    const toolCalls = assistant.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const text =
        typeof assistant.content === "string" ? assistant.content.trim() : "";
      if (!text) {
        throw new Error("O modelo não retornou conteúdo final textual.");
      }
      return {
        text,
        iterations: iteration,
        provider: lastProvider,
        model: lastModel,
      };
    }

    for (const toolCall of toolCalls) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        throw new Error(
          `Argumentos inválidos para a ferramenta ${toolCall.function.name}.`
        );
      }

      try {
        const result = await input.executeTool(toolCall.function.name, args);
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: typeof result.content === "string"
            ? result.content
            : JSON.stringify(result),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ok: false, error: message }),
        });
      }
    }
  }

  throw new Error(
    `O agente atingiu o limite seguro de ${maxIterations} iterações.`
  );
}

// Runtime validado pela suíte de regressão do Arquimedes.
