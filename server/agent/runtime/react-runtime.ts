export type AgentRuntimeMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | Array<{ type?: string; text?: string; [key: string]: unknown }>;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type AgentRuntimeTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type AgentRuntimeResponse = {
  choices?: Array<{
    message?: {
      role?: "assistant";
      content?: string | null | Array<{ type?: string; text?: string }>;
      tool_calls?: AgentRuntimeMessage["tool_calls"];
    };
  }>;
  model?: string;
  provider?: string;
};

export type AgentRuntimeToolResult = {
  content: string;
  ok: boolean;
  error?: string;
};

export type AgentRuntimeEvent =
  | { type: "model_started"; iteration: number }
  | { type: "model_finished"; iteration: number; toolCallCount: number; provider?: string }
  | { type: "tool_started"; iteration: number; toolName: string }
  | { type: "tool_finished"; iteration: number; toolName: string; ok: boolean };

export type AgentRuntimeOptions = {
  messages: AgentRuntimeMessage[];
  tools: AgentRuntimeTool[];
  maxIterations: number;
  callModel: (input: {
    messages: AgentRuntimeMessage[];
    tools: AgentRuntimeTool[];
  }) => Promise<AgentRuntimeResponse>;
  executeTool: (toolName: string, args: Record<string, unknown>, iteration: number) => Promise<AgentRuntimeToolResult>;
  allowedTools?: ReadonlySet<string>;
  maxToolResultChars?: number;
  onEvent?: (event: AgentRuntimeEvent) => void | Promise<void>;
};

function extractText(response: AgentRuntimeResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return null;
}

export async function runReActAgent(options: AgentRuntimeOptions) {
  const conversation = [...options.messages];
  const maxToolResultChars = options.maxToolResultChars ?? 12_000;

  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    await options.onEvent?.({ type: "model_started", iteration });

    const response = await options.callModel({
      messages: conversation,
      tools: options.tools,
    });
    const assistant = response.choices?.[0]?.message;
    if (!assistant) throw new Error("O runtime do agente não recebeu uma mensagem válida do modelo.");

    const toolCalls = assistant.tool_calls ?? [];
    await options.onEvent?.({
      type: "model_finished",
      iteration,
      toolCallCount: toolCalls.length,
      provider: response.provider,
    });

    if (!toolCalls.length) {
      const text = extractText(response);
      if (!text) {
        throw new Error("O runtime do agente recebeu uma resposta sem conteúdo final textual.");
      }
      return {
        text,
        response,
        iterations: iteration,
      };
    }

    conversation.push({
      role: "assistant",
      content: assistant.content ?? null,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      if (options.allowedTools && !options.allowedTools.has(toolName)) {
        throw new Error(`Ferramenta não autorizada pelo runtime: ${toolName}`);
      }

      let args: Record<string, unknown>;
      try {
        const parsed = JSON.parse(toolCall.function.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Os argumentos devem ser um objeto JSON.");
        }
        args = parsed as Record<string, unknown>;
      } catch {
        throw new Error(`Argumentos inválidos para a ferramenta ${toolName}.`);
      }

      await options.onEvent?.({ type: "tool_started", iteration, toolName });
      let result: AgentRuntimeToolResult;
      try {
        result = await options.executeTool(toolName, args, iteration);
      } catch (error) {
        result = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          content: "",
        };
      }
      await options.onEvent?.({
        type: "tool_finished",
        iteration,
        toolName,
        ok: result.ok,
      });

      const content = JSON.stringify(
        result.ok ? { ok: true, result: result.content } : { ok: false, error: result.error }
      ).slice(0, maxToolResultChars);

      conversation.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content,
      });
    }
  }

  throw new Error(
    `O runtime do agente atingiu o limite seguro de ${options.maxIterations} iterações.`
  );
}
