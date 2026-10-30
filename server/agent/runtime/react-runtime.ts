export type AgentRuntimeMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null | Array<{ type?: string; text?: string; [key: string]: unknown }>;
  tool_call_id?: string;
  reasoning?: string;
  reasoning_content?: string;
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
      reasoning?: string;
      reasoning_content?: string;
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
  /** A mensagem atual contém uma ordem explícita para mutações reversíveis. */
  mutationAuthorized?: boolean;
  callModel: (input: {
    messages: AgentRuntimeMessage[];
    tools: AgentRuntimeTool[];
  }) => Promise<AgentRuntimeResponse>;
  executeTool: (toolName: string, args: Record<string, unknown>, iteration: number) => Promise<AgentRuntimeToolResult>;
  allowedTools?: ReadonlySet<string>;
  /** Teto por resultado de ferramenta (caracteres). */
  maxToolResultChars?: number;
  /**
   * Teto ACUMULADO de caracteres de resultados por execução. Sem ele, uma
   * sequência longa de consultas cresce o contexto sem limite — e o custo e a
   * latência junto. Esgotado o orçamento, os resultados seguintes vêm vazios
   * (com aviso), e a síntese final usa o que já foi reunido.
   */
  maxToolResultBudget?: number;
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

type CompletedToolCall = {
  name: string;
  ok: boolean;
  content: string;
  error?: string;
};

function fallbackAfterEmptyFinal(completedTools: CompletedToolCall[]) {
  const eapApplication = [...completedTools]
    .reverse()
    .find(tool => tool.name === "aplicar_proposta_eap_local");

  if (eapApplication?.ok) {
    try {
      const payload = JSON.parse(eapApplication.content) as {
        status?: string;
        resultado?: {
          applied?: boolean;
          created?: number;
          updated?: number;
          versionNumber?: number;
          approved?: boolean;
          baselineCreated?: boolean;
          verification?: {
            persistenceVerified?: boolean;
            nodeCount?: number;
            leafCount?: number;
            structuralErrors?: number;
            structuralWarnings?: number;
          };
        };
      };
      const result = payload.resultado;
      const verification = result?.verification;
      if (
        result?.applied &&
        verification?.persistenceVerified &&
        result.approved === false &&
        result.baselineCreated === false
      ) {
        return [
          "O modelo não conseguiu redigir a resposta final; este resumo vem da gravação e releitura confirmadas pelo sistema.",
          `A EAP foi atualizada na versão de trabalho ${result.versionNumber ?? "atual"}: ${result.created ?? 0} nós criados e ${result.updated ?? 0} atualizados.`,
          `A releitura confirmou ${verification.nodeCount ?? "—"} nós e ${verification.leafCount ?? "—"} folhas; erros estruturais: ${verification.structuralErrors ?? "não informado"}; avisos: ${verification.structuralWarnings ?? "não informado"}.`,
          "A EAP continua em elaboração; nenhuma aprovação nem baseline foi criada.",
        ].join("\n\n");
      }
      if (result?.applied) {
        return [
          "A ferramenta informou que aplicou a proposta, mas a releitura não confirmou a persistência integral.",
          "Não considere a EAP validada nem repita a operação antes de recarregar e conferir a árvore.",
          "Nenhuma aprovação ou baseline foi criada.",
        ].join("\n\n");
      }
    } catch {
      // Resultado fora do formato esperado: não inferir que a EAP foi gravada.
    }
  }

  if (eapApplication && !eapApplication.ok) {
    return [
      "O Arquimedes não conseguiu confirmar a aplicação da proposta à EAP.",
      `Retorno da operação: ${eapApplication.error || "sem detalhe de erro"}`,
      "Recarregue a árvore para verificar o estado antes de repetir a operação. Nenhuma aprovação ou baseline foi solicitada por este fluxo.",
    ].join("\n\n");
  }

  if (completedTools.length) {
    const failedCount = completedTools.filter(tool => !tool.ok).length;
    return [
      "O modelo não conseguiu produzir uma resposta final nesta tentativa.",
      `O runtime concluiu ${completedTools.length} chamada(s) de ferramenta${failedCount ? `, com ${failedCount} retorno(s) de erro` : ""}, mas não há confirmação suficiente para declarar que a EAP foi construída ou atualizada.`,
      "Confira o resultado no módulo antes de repetir qualquer operação.",
    ].join("\n\n");
  }

  return "O Arquimedes não conseguiu produzir uma resposta textual e nenhuma alteração de EAP foi confirmada. Tente novamente; se persistir, o registro técnico da execução precisa ser consultado.";
}

export async function runReActAgent(options: AgentRuntimeOptions) {
  const conversation = [...options.messages];
  const maxToolResultChars = options.maxToolResultChars ?? 12_000;
  const maxToolResultBudget = options.maxToolResultBudget ?? Number.POSITIVE_INFINITY;
  let usedToolResultChars = 0;
  const completedTools: CompletedToolCall[] = [];
  let latestResponse: AgentRuntimeResponse | undefined;

  const recoverEmptyFinal = async (iteration: number, response?: AgentRuntimeResponse) => {
    const recoveryIteration = iteration + 1;
    await options.onEvent?.({ type: "model_started", iteration: recoveryIteration });
    let recoveryResponse: AgentRuntimeResponse;
    try {
      recoveryResponse = await options.callModel({
        messages: [
          ...conversation,
          {
            role: "system",
            content:
              "A resposta anterior veio sem texto final. Produza agora uma resposta curta e clara em português brasileiro, usando apenas as evidências e resultados de ferramentas já presentes na conversa. Não chame ferramentas, não repita mutações e não peça nova confirmação para uma ordem reversível que o usuário já deu. Nunca afirme que uma alteração foi gravada sem resultado de persistência confirmado; aprovação e baseline continuam fora do escopo.",
          },
        ],
        tools: [],
      });
    } catch {
      return {
        text: fallbackAfterEmptyFinal(completedTools),
        response: response ?? latestResponse ?? {},
        iterations: recoveryIteration,
      };
    }
    const recoveryText = extractText(recoveryResponse);
    await options.onEvent?.({
      type: "model_finished",
      iteration: recoveryIteration,
      toolCallCount: recoveryResponse.choices?.[0]?.message?.tool_calls?.length ?? 0,
      provider: recoveryResponse.provider,
    });
    if (recoveryText) {
      return { text: recoveryText, response: recoveryResponse, iterations: recoveryIteration };
    }
    return {
      text: fallbackAfterEmptyFinal(completedTools),
      response: recoveryResponse.choices?.[0]?.message ? recoveryResponse : response ?? latestResponse ?? recoveryResponse,
      iterations: recoveryIteration,
    };
  };

  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    await options.onEvent?.({ type: "model_started", iteration });

    // Reserve a última rodada para síntese. Isso evita que uma sequência legítima
    // de consultas termine em erro só porque a última resposta ainda trouxe
    // tool_calls. As rodadas anteriores continuam livres para usar ferramentas.
    const isFinalTurn = iteration === options.maxIterations;
    const turnTools = isFinalTurn ? [] : options.tools;

    if (isFinalTurn) {
      conversation.push({
        role: "system",
        content:
          "ENCERRAMENTO OBRIGATÓRIO: você já recebeu as evidências disponíveis nesta execução. " +
          "Não faça novas consultas, não solicite ferramentas e não execute alterações. " +
          "Consolide agora uma resposta final objetiva, separando fatos confirmados, " +
          "inferências e próximos passos. " +
          (options.mutationAuthorized
            ? "A ordem operacional reversível do usuário já foi dada: relate com precisão o que foi aplicado e conferido; não peça confirmação adicional. Não aprove EAP nem crie baseline."
            : "Se uma alteração apenas foi proposta e não aplicada, apresente-a e aguarde confirmação explícita do engenheiro."),
      });
    }

    const response = await options.callModel({
      messages: conversation,
      tools: turnTools,
    });
    latestResponse = response;
    const assistant = response.choices?.[0]?.message;
    if (!assistant) return recoverEmptyFinal(iteration, response);

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
        return recoverEmptyFinal(iteration, response);
      }
      return {
        text,
        response,
        iterations: iteration,
      };
    }

    // Um provedor compatível não deveria devolver tool_calls quando tools=[].
    // Se isso acontecer na rodada reservada para síntese, falhamos com uma
    // mensagem específica em vez de executar uma ferramenta além do orçamento.
    if (isFinalTurn) {
      return recoverEmptyFinal(iteration, response);
    }

    conversation.push({
      role: "assistant",
      content: assistant.content ?? null,
      ...(assistant.reasoning ? { reasoning: assistant.reasoning } : {}),
      ...(assistant.reasoning_content ? { reasoning_content: assistant.reasoning_content } : {}),
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      if (options.allowedTools && !options.allowedTools.has(toolName)) {
        throw new Error(`Ferramenta não autorizada pelo runtime: ${toolName}`);
      }

      await options.onEvent?.({ type: "tool_started", iteration, toolName });
      let args: Record<string, unknown>;
      let result: AgentRuntimeToolResult | undefined;
      try {
        const parsed = JSON.parse(toolCall.function.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Os argumentos devem ser um objeto JSON.");
        }
        args = parsed as Record<string, unknown>;
      } catch {
        // Responde ao tool_call inválido sem executar a ferramenta. Assim o
        // modelo pode corrigir a chamada ou explicar o bloqueio ao usuário.
        // O conteúdo bruto não é ecoado, pois pode conter dados sensíveis.
        args = {};
        result = {
          ok: false,
          error: `Argumentos inválidos para a ferramenta ${toolName}; envie um objeto JSON válido.`,
          content: "",
        };
      }

      if (!result) {
        try {
          result = await options.executeTool(toolName, args, iteration);
        } catch (error) {
          result = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            content: "",
          };
        }
      }
      completedTools.push({
        name: toolName,
        ok: result.ok,
        content: result.content,
        error: result.error,
      });
      await options.onEvent?.({
        type: "tool_finished",
        iteration,
        toolName,
        ok: result.ok,
      });

      const raw = JSON.stringify(
        result.ok ? { ok: true, result: result.content } : { ok: false, error: result.error }
      );
      const remaining = Math.max(0, maxToolResultBudget - usedToolResultChars);
      const budgeted = raw.slice(0, Math.min(maxToolResultChars, remaining));
      const omitted = budgeted.length < raw.length;
      const content = omitted
        ? `${budgeted}\n[... resultado omitido: orçamento de contexto da execução esgotado ...]`
        : budgeted;
      usedToolResultChars += content.length;

      conversation.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content,
      });
    }
  }

  return recoverEmptyFinal(options.maxIterations, latestResponse);
}
