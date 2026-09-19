import { ENV } from "./_core/env";
import type { AgentMessage, AgentProjectContext } from "./agent";
import {
  MCP_TOOL_POLICY,
  callReadOnlyMcpTool,
  listConstructionMcpTools,
} from "./integrations/construction-mcps";
import type { McpCallResult, McpTool } from "./integrations/mcp-client";
import {
  invokeLlmGateway,
  type LlmMessage,
  type LlmResponse,
  type LlmTool,
} from "./llm-provider-gateway";

const MAX_ITERATIONS = 4;
const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 6_000;

const TOOL_DOMAINS = {
  get_eap_tree: "eap",
  get_eap_node: "eap",
  listar_por_tipo_frente: "eap",
  buscar_eap_node: "eap",
  pacotes_sem_dono: "eap",
  resumo_quantitativos: "eap",
  listar_templates: "eap",
  listar_atividades: "cronograma",
  listar_dependencias: "cronograma",
  validar_dependencias: "cronograma",
  calcular_caminho_critico: "cronograma",
  listar_baselines: "cronograma",
  comparar_baseline: "cronograma",
  curva_s: "cronograma",
  listar_temas: "ganttLob",
  calcular_linha_balanco: "ganttLob",
  balancear_ritmos_lob: "ganttLob",
  dimensionar_equipes_lob: "ganttLob",
} as const;

const PROJECT_SCOPED_TOOLS = new Set([
  "get_eap_tree",
  "get_eap_node",
  "listar_por_tipo_frente",
  "buscar_eap_node",
  "pacotes_sem_dono",
  "resumo_quantitativos",
  "listar_atividades",
  "listar_dependencias",
  "validar_dependencias",
  "calcular_caminho_critico",
  "listar_baselines",
  "comparar_baseline",
  "curva_s",
  "calcular_linha_balanco",
]);

type ToolDomain = keyof ReturnType<
  typeof import("./integrations/construction-mcps").createConstructionMcpClients
>;

type AuditEvent = {
  taskId: string;
  iteration: number;
  event: "tool_call";
  domain: ToolDomain;
  toolName: string;
  status: "success" | "error";
  durationMs: number;
  error?: string;
};

export type OrchestratorResult = {
  taskId: string;
  content: string;
  model: string;
  iterations: number;
  audit: AuditEvent[];
  readOnly: true;
};

type OrchestratorDeps = {
  listTools?: () => Promise<Record<string, McpTool[]>>;
  callTool?: (
    domain: ToolDomain,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<McpCallResult>;
  callLlm?: (params: {
    messages: LlmMessage[];
    tools: LlmTool[];
  }) => Promise<LlmResponse>;
};

function createTaskId() {
  return `obra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseContent(response: LlmResponse) {
  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim()
    ? content
    : "O agente concluiu sem produzir uma resposta textual.";
}

function formatContext(context: AgentProjectContext) {
  const activityLines = context.activities
    .slice(0, 80)
    .map(activity =>
      [
        activity.wbsCode,
        activity.name,
        activity.phase,
        activity.status,
        `${activity.progress}%`,
        `${activity.durationDays} dias`,
        activity.critical ? "crítica" : "não crítica",
      ].join(" | ")
    )
    .join("\n");

  return [
    `Obra: ${context.project.code} — ${context.project.name}`,
    `Local: ${context.project.location}`,
    `Status: ${context.project.status}`,
    `Avanço local: ${context.project.progress}%`,
    `Início planejado: ${new Date(context.project.plannedStart).toISOString().slice(0, 10)}`,
    `Término planejado: ${new Date(context.project.plannedFinish).toISOString().slice(0, 10)}`,
    "Atividades locais (WBS | nome | fase | status | avanço | duração | criticidade):",
    activityLines || "Nenhuma atividade local cadastrada.",
  ].join("\n");
}

function toOpenAiTools(catalog: Record<string, McpTool[]>): LlmTool[] {
  const tools: LlmTool[] = [];
  for (const entries of Object.values(catalog)) {
    for (const tool of entries) {
      if (!MCP_TOOL_POLICY.readOnly.has(tool.name)) continue;
      const domain = TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS];
      if (!domain) continue;
      tools.push({
        type: "function",
        function: {
          name: tool.name,
          description: `${tool.description ?? "Consulta MCP"} Domínio: ${domain}. Somente leitura.`,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      });
    }
  }
  return tools;
}

function buildSystem(context: AgentProjectContext, mcpProjectId?: string) {
  return [
    "Você é o Agent Orchestrator da Plataforma Obras, especialista em planejamento e controle de obras no Brasil.",
    "Responda em português do Brasil, com objetividade e linguagem operacional.",
    "Use EAP, PERT/CPM, dependências, caminho crítico, baseline, curva S, produtividade e Linha de Balanço.",
    "Você pode consultar MCPs, mas nesta versão todas as ferramentas são SOMENTE LEITURA.",
    "Nunca crie, atualize, exclua, salve baseline ou registre medição. Se o usuário pedir escrita, explique que será habilitada em fase posterior.",
    "Não invente datas, custos, medições ou restrições. Diferencie dado local, dado MCP e inferência.",
    "Use uma ferramenta somente quando ela ajudar a responder. Se faltar project_id externo, informe que o vínculo da obra ainda não foi configurado.",
    mcpProjectId
      ? `project_id externo autorizado para consultas: ${mcpProjectId}`
      : "Nenhum project_id externo foi autorizado nesta execução.",
    "Contexto local da obra:\n" + formatContext(context),
  ].join("\n\n");
}

function validateMessages(messages: AgentMessage[]) {
  if (messages.length < 1 || messages.length > MAX_MESSAGES)
    throw new Error(`A conversa deve ter entre 1 e ${MAX_MESSAGES} mensagens.`);
  if (
    messages.some(
      message =>
        message.content.trim().length === 0 ||
        message.content.length > MAX_MESSAGE_CHARS
    )
  ) {
    throw new Error(
      `Cada mensagem deve ter entre 1 e ${MAX_MESSAGE_CHARS} caracteres.`
    );
  }
}

export async function runProjectOrchestrator(
  context: AgentProjectContext,
  messages: AgentMessage[],
  options: {
    mcpProjectId?: string;
    taskId?: string;
    deps?: OrchestratorDeps;
  } = {}
): Promise<OrchestratorResult> {
  validateMessages(messages);
  const taskId = options.taskId ?? createTaskId();
  const deps = options.deps ?? {};
  const catalog = await (deps.listTools ?? listConstructionMcpTools)();
  const tools = toOpenAiTools(catalog);
  const audit: AuditEvent[] = [];
  const conversation: LlmMessage[] = [
    { role: "system", content: buildSystem(context, options.mcpProjectId) },
    ...messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const response = await (deps.callLlm ?? invokeLlmGateway)({
      messages: conversation,
      tools,
    });
    const assistant = response.choices?.[0]?.message;
    if (!assistant) throw new Error("LLM não retornou uma mensagem válida.");
    if (!assistant.tool_calls?.length) {
      return {
        taskId,
        content: parseContent(response),
        model: response.model || ENV.aiModel || "gpt-5-mini",
        iterations: iteration,
        audit,
        readOnly: true,
      };
    }

    conversation.push({
      role: "assistant",
      content: assistant.content ?? null,
      tool_calls: assistant.tool_calls,
    });
    for (const toolCall of assistant.tool_calls) {
      const toolName = toolCall.function.name;
      const domain = TOOL_DOMAINS[toolName as keyof typeof TOOL_DOMAINS];
      const startedAt = Date.now();
      if (!domain || !MCP_TOOL_POLICY.readOnly.has(toolName)) {
        throw new Error(`Ferramenta não permitida no Marco 2: ${toolName}`);
      }
      if (PROJECT_SCOPED_TOOLS.has(toolName) && !options.mcpProjectId) {
        const message =
          "A obra ainda não possui project_id externo autorizado para consulta MCP.";
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: message }),
        });
        audit.push({
          taskId,
          iteration,
          event: "tool_call",
          domain,
          toolName,
          status: "error",
          durationMs: Date.now() - startedAt,
          error: message,
        });
        continue;
      }
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        throw new Error(`Argumentos inválidos para a ferramenta ${toolName}.`);
      }
      if (options.mcpProjectId) args.project_id = options.mcpProjectId;
      try {
        const result = await (deps.callTool ?? callReadOnlyMcpTool)(
          domain,
          toolName,
          args
        );
        const serialized = JSON.stringify(result).slice(
          0,
          MAX_TOOL_RESULT_CHARS
        );
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: serialized,
        });
        audit.push({
          taskId,
          iteration,
          event: "tool_call",
          domain,
          toolName,
          status: "success",
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Falha desconhecida na ferramenta MCP";
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: message }),
        });
        audit.push({
          taskId,
          iteration,
          event: "tool_call",
          domain,
          toolName,
          status: "error",
          durationMs: Date.now() - startedAt,
          error: message,
        });
      }
    }
  }

  throw new Error(
    `O orquestrador atingiu o limite seguro de ${MAX_ITERATIONS} iterações.`
  );
}

export { MAX_ITERATIONS, toOpenAiTools };
