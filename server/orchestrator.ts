import { ENV } from "./_core/env";
import type { AgentMessage, AgentProjectContext } from "./agent";
import {
  MCP_TOOL_POLICY,
  callReadOnlyMcpTool,
  listConstructionMcpTools,
  type ConstructionMcpToolCatalog,
} from "./integrations/construction-mcps";
import type { McpCallResult, McpTool } from "./integrations/mcp-client";
import {
  invokeLlmGateway,
  type LlmMessage,
  type LlmResponse,
  type LlmTool,
} from "./llm-provider-gateway";
import { classifyArquimedesIntent } from "./agent/runtime/intent-router";
import { runReActAgent } from "./agent/runtime/react-runtime";
import {
  listRepositoryDirectory,
  readRepositoryFile,
  repositoryInfo,
  searchRepositoryCode,
  updateRepositoryFile,
} from "./integrations/repository-tools";

const MAX_ITERATIONS = 4;
const MAX_TOOL_RESULT_CHARS = 12_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 6_000;

const TOOL_DOMAINS = {
  get_eap_tree: "eap",
  get_eap_node: "eap",
  listar_por_tipo_frente: "eap",
  buscar_eap_node: "eap",
  validar_estrutura: "eap",
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
  "validar_estrutura",
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

export type ToolDomain =
  | keyof ReturnType<
      typeof import("./integrations/construction-mcps").createConstructionMcpClients
    >
  | "runtime"
  | "repository";

export type OrchestratorEvent =
  | { type: "catalog_started" }
  | {
      type: "catalog_loaded";
      toolCount: number;
      errors?: Record<string, string>;
    }
  | { type: "llm_started"; iteration: number }
  | {
      type: "llm_response";
      iteration: number;
      toolCallCount: number;
      provider?: string;
    }
  | {
      type: "tool_started";
      iteration: number;
      domain: ToolDomain;
      toolName: string;
    }
  | {
      type: "tool_finished";
      iteration: number;
      domain: ToolDomain;
      toolName: string;
      status: "success" | "error";
    }
  | {
      type: "execution_failed";
      status:
        | "falhou"
        | "timeout"
        | "aguardando_confirmacao"
        | "dados_incompletos";
      errorCode: string;
      message: string;
    }
  | { type: "response_parsed" };

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
  provider?: string;
  iterations: number;
  audit: AuditEvent[];
  readOnly: true;
  status: "respondido";
};

export type OrchestratorDeps = {
  listTools?: () => Promise<ConstructionMcpToolCatalog>;
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

export type OrchestratorOptions = {
  mcpProjectId?: string;
  mcpProjectIds?: Partial<Record<ToolDomain, string>>;
  taskId?: string;
  maxIterations?: number;
  deps?: OrchestratorDeps;
  onEvent?: (event: OrchestratorEvent) => void | Promise<void>;
};

function createTaskId() {
  return `obra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseContent(response: LlmResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter(part => part?.type === "text" && typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  throw new Error(
    "O provider não retornou conteúdo final textual; a resposta ficou vazia, somente com reasoning ou somente com tool call."
  );
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

  const coordinator = context.coordinator;
  const evidence = context.evidence
    ? [
        `Fonte de evidências: ${context.evidence.source}`,
        `Nós EAP locais: ${context.evidence.eapNodeCount ?? "indisponível"}`,
        `Atividades locais consultadas: ${context.evidence.activityCount ?? "indisponível"}`,
        `Dependências locais consultadas: ${context.evidence.dependencyCount ?? "indisponível"}`,
        `Avisos de evidência: ${context.evidence.warnings.join(" | ") || "nenhum"}`,
        `Erros de evidência: ${context.evidence.errors.join(" | ") || "nenhum"}`,
        context.evidence.validation
          ? `Validação determinística: ${context.evidence.validation.status} | bloqueadores=${context.evidence.validation.blockerCount} | duração=${context.evidence.validation.projectDuration ?? "indisponível"} | caminho crítico=${context.evidence.validation.criticalPath.join(" → ") || "indisponível"}`
          : "Validação determinística ainda não executada.",
        context.evidence.validation?.issues.length
          ? `Problemas determinísticos: ${context.evidence.validation.issues.join(" | ")}`
          : "Problemas determinísticos: nenhum.",
      ].join("\n")
    : "Resumo de evidências locais ainda não carregado.";
  const coordinatorLines = coordinator
    ? [
        `Pendências registradas: ${coordinator.blockerCount}`,
        `Resumo operacional: ${coordinator.lastSummary || "nenhum"}`,
        "Decisões já aprovadas:",
        coordinator.approvedDecisions.length
          ? coordinator.approvedDecisions
              .slice(0, 20)
              .map(decision => `${decision.decision} | ${decision.reason || "sem justificativa"}`)
              .join("\n")
          : "Nenhuma decisão aprovada registrada.",
        "Achados abertos:",
        coordinator.openFindings.length
          ? coordinator.openFindings
              .slice(0, 30)
              .map(finding => `${finding.description} | impacto=${finding.impact || "não informado"} | confiança=${finding.confidence}`)
              .join("\n")
          : "Nenhum achado aberto registrado.",
      ].join("\n")
    : "Estado operacional persistido ainda não carregado.";

  return [
    `Obra: ${context.project.code} — ${context.project.name}`,
    `Local: ${context.project.location}`,
    `Status: ${context.project.status}`,
    `Avanço local: ${context.project.progress}%`,
    `Início planejado: ${new Date(context.project.plannedStart).toISOString().slice(0, 10)}`,
    `Término planejado: ${new Date(context.project.plannedFinish).toISOString().slice(0, 10)}`,
    "Atividades locais (WBS | nome | fase | status | avanço | duração | criticidade):",
    activityLines || "Nenhuma atividade local cadastrada.",
    "Evidências estruturadas:\n" + evidence,
    "Estado e memória do coordenador:\n" + coordinatorLines,
  ].join("\n");
}

const RUNTIME_TOOLS: LlmTool[] = [
  {
    type: "function",
    function: {
      name: "repository_info",
      description:
        "Mostra qual repositório de código está conectado ao Arquimedes e quais capacidades de auditoria estão disponíveis.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "repository_list_directory",
      description:
        "Lista arquivos e diretórios do repositório conectado. Use para navegar pelo código quando ainda não souber o caminho do arquivo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repository_read_file",
      description:
        "Lê um arquivo do repositório conectado para auditar a arquitetura ou diagnosticar um problema.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repository_search_code",
      description:
        "Pesquisa símbolos e textos no código do repositório conectado.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          topK: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repository_update_file",
      description:
        "Atualiza um arquivo do repositório na branch de trabalho configurada. Leia o arquivo antes e use o SHA retornado pela leitura.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          message: { type: "string" },
          expectedSha: { type: "string" },
        },
        required: ["path", "content", "message", "expectedSha"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_datetime",
      description:
        "Retorna a data e hora atuais do runtime na zona America/Fortaleza. Use quando o usuário perguntar que dia é hoje, a hora atual ou precisar de uma referência temporal presente.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

function currentDateTimeFortaleza() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    dateStyle: "full",
    timeStyle: "long",
  });
  const isoParts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const parts = Object.fromEntries(
    isoParts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return {
    timezone: "America/Fortaleza",
    iso: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-03:00`,
    human: formatter.format(now),
  };
}

function toOpenAiTools(catalog: ConstructionMcpToolCatalog): LlmTool[] {
  const tools: LlmTool[] = [];
  for (const entries of [catalog.eap, catalog.cronograma, catalog.ganttLob]) {
    if (!Array.isArray(entries)) continue;
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
  return [...tools, ...RUNTIME_TOOLS];
}

function buildSystem(
  context: AgentProjectContext,
  mcpProjectIds: Partial<Record<Extract<ToolDomain, "eap" | "cronograma" | "ganttLob">, string>>,
  responseIntent: "casual" | "consulta" | "analise" | "operacao"
) {
  const workspaceContext = context.workspace
    ? `Aba ativa: ${context.workspace.activeSection}${context.workspace.activeSubtab ? ` / ${context.workspace.activeSubtab}` : ""}.`
    : "Aba ativa não informada.";
  const now = currentDateTimeFortaleza();

  const base = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    `Data e hora atuais fornecidas pelo runtime: ${now.human} (${now.iso}).`,
    "Use essa referência quando o usuário perguntar sobre data, dia ou hora atuais. Não diga que não possui relógio.",
    "Converse naturalmente com o usuário. Escolha o formato que melhor serve à pergunta. Não existe formato obrigatório de resposta.",
    "Responda diretamente ao que foi perguntado. Não despeje o contexto da obra, métricas ou diagnósticos que o usuário não pediu.",
    "Quando a pergunta puder ser respondida com o contexto disponível, responda sem chamar ferramentas só para preencher a conversa.",
    "Quando precisar de dados atuais ou mais completos, consulte as ferramentas disponíveis. Use ferramentas como instrumentos de consulta, não como roteiro rígido.",
    "Depois das consultas, interprete os resultados e responda com suas próprias palavras. Não descreva seu raciocínio interno e não revele detalhes de implementação do runtime.",
    "Não invente dados, consultas, resultados, aprovações ou alterações. Diferencie fatos confirmados, inferências e informações que ainda faltam.",
    "As ferramentas de obra disponíveis nesta fase são somente leitura. Nunca execute uma alteração, criação, exclusão, baseline ou medição.",
    "Resultados determinísticos de EAP, dependências e CPM devem ser tratados como cálculo do sistema. Não substitua esses resultados por estimativas suas quando o dado calculado estiver disponível.",
    "Para dúvidas técnicas de planejamento, use EAP, atividades, precedências, CPM, caminho crítico, folgas, Gantt, Linha de Balanço, produção e controle.",
    "Quando uma consulta de ferramenta falhar, tente outra fonte somente se houver uma alternativa útil. Se a informação continuar indisponível e for importante para a resposta, diga simplesmente que esse dado não está disponível agora.",
    "Quando o usuário perguntar sobre o próprio código, arquitetura, bugs ou funcionamento interno da Plataforma Obras, use as ferramentas de repositório disponíveis para investigar. Não diga que não possui acesso ao código se a ferramenta puder fornecê-lo.",
    "Antes de modificar código, leia os arquivos envolvidos e confirme a causa do problema. Depois aplique somente a mudança necessária. Não invente que testou algo: use evidências reais.",
    "A ferramenta de atualização do repositório trabalha apenas na branch de trabalho configurada pelo runtime e aplica validações de caminho e concorrência. Nunca trate uma alteração como implantada até existir evidência do deploy.",
    "Não mencione 'MARCO', 'Agent Orchestrator', project_id, nomes internos de MCP, catálogos, políticas internas ou contratos de resposta, a menos que o usuário pergunte explicitamente sobre a arquitetura.",
  ];

  if (responseIntent !== "casual") {
    base.push(
      workspaceContext,
      "Contexto factual atual da obra. Use como referência, não como texto a ser repetido:\n" + formatContext(context)
    );
  }

  return base.join("\n\n");
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
  options: OrchestratorOptions = {}
): Promise<OrchestratorResult> {
  validateMessages(messages);
  const taskId = options.taskId ?? createTaskId();
  const deps = options.deps ?? {};

  const lastUserMessage = [...messages].reverse().find(message => message.role === "user");
  const intent = lastUserMessage
    ? classifyArquimedesIntent(lastUserMessage.content)
    : "consulta";
  const mcpProjectIds: Partial<Record<ToolDomain, string>> = {
    ...(options.mcpProjectId
      ? {
          eap: options.mcpProjectId,
          cronograma: options.mcpProjectId,
          ganttLob: options.mcpProjectId,
        }
      : {}),
    ...(options.mcpProjectIds ?? {}),
  };
  const emit = async (event: OrchestratorEvent) => {
    try {
      await options.onEvent?.(event);
    } catch (error) {
      console.warn(
        JSON.stringify({
          evento: "orchestrator_event_error",
          taskId,
          tipo: event.type,
          erro: error instanceof Error ? error.message : String(error),
        })
      );
    }
  };
  await emit({ type: "catalog_started" });
  const catalog = await (deps.listTools ?? listConstructionMcpTools)();
  const tools = toOpenAiTools(catalog);
  await emit({
    type: "catalog_loaded",
    toolCount: tools.length,
    errors: catalog.errors,
  });
  const audit: AuditEvent[] = [];
  const conversation: LlmMessage[] = [
    { role: "system", content: buildSystem(context, mcpProjectIds, intent) },
    ...messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const maxIterations =
    Number.isFinite(options.maxIterations) && options.maxIterations! > 0
      ? Math.min(Math.floor(options.maxIterations!), MAX_ITERATIONS)
      : MAX_ITERATIONS;
  const runtimeResult = await runReActAgent({
    messages: conversation,
    tools,
    maxIterations,
    allowedTools: new Set(tools.map(tool => tool.function.name)),
    maxToolResultChars: MAX_TOOL_RESULT_CHARS,
    callModel: async input => {
      return (deps.callLlm ?? invokeLlmGateway)({
        messages: input.messages,
        tools: input.tools,
      });
    },
    executeTool: async (toolName, rawArgs, iteration) => {
      if (
        toolName === "repository_info" ||
        toolName === "repository_list_directory" ||
        toolName === "repository_read_file" ||
        toolName === "repository_search_code" ||
        toolName === "repository_update_file"
      ) {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "repository", toolName });
        try {
          let value: unknown;
          if (toolName === "repository_info") {
            value = repositoryInfo();
          } else if (toolName === "repository_read_file") {
            value = await readRepositoryFile(
              String(rawArgs.path ?? ""),
              typeof rawArgs.ref === "string" ? rawArgs.ref : undefined
            );
          } else if (toolName === "repository_list_directory") {
            value = await listRepositoryDirectory(
              typeof rawArgs.path === "string" ? rawArgs.path : ""
            );
          } else if (toolName === "repository_search_code") {
            value = await searchRepositoryCode(
              String(rawArgs.query ?? ""),
              Number(rawArgs.topK ?? 8)
            );
          } else {
            value = await updateRepositoryFile({
              path: String(rawArgs.path ?? ""),
              content: String(rawArgs.content ?? ""),
              message: String(rawArgs.message ?? ""),
              expectedSha: String(rawArgs.expectedSha ?? ""),
            });
          }
          audit.push({
            taskId,
            iteration,
            event: "tool_call",
            domain: "repository",
            toolName,
            status: "success",
            durationMs: Date.now() - startedAt,
          });
          await emit({
            type: "tool_finished",
            iteration,
            domain: "repository",
            toolName,
            status: "success",
          });
          return {
            ok: true,
            content: JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS),
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Falha na ferramenta de repositório.";
          audit.push({
            taskId,
            iteration,
            event: "tool_call",
            domain: "repository",
            toolName,
            status: "error",
            durationMs: Date.now() - startedAt,
            error: message,
          });
          await emit({
            type: "tool_finished",
            iteration,
            domain: "repository",
            toolName,
            status: "error",
          });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "get_current_datetime") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        const value = currentDateTimeFortaleza();
        audit.push({
          taskId,
          iteration,
          event: "tool_call",
          domain: "runtime",
          toolName,
          status: "success",
          durationMs: Date.now() - startedAt,
        });
        await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
        return { ok: true, content: JSON.stringify(value) };
      }

      const domain = TOOL_DOMAINS[toolName as keyof typeof TOOL_DOMAINS];
      const startedAt = Date.now();
      if (!domain || !MCP_TOOL_POLICY.readOnly.has(toolName)) {
        throw new Error(`Ferramenta não permitida pelo runtime: ${toolName}`);
      }

      await emit({ type: "tool_started", iteration, domain, toolName });

      const mcpProjectId = mcpProjectIds[domain];
      if (PROJECT_SCOPED_TOOLS.has(toolName) && !mcpProjectId) {
        const message = "A obra ainda não possui project_id externo autorizado para consulta MCP.";
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "error", durationMs: Date.now() - startedAt, error: message,
        });
        await emit({ type: "tool_finished", iteration, domain, toolName, status: "error" });
        return { ok: false, error: message, content: "" };
      }

      const args = { ...rawArgs };
      if (mcpProjectId) args.project_id = mcpProjectId;

      try {
        const result = await (deps.callTool ?? callReadOnlyMcpTool)(domain, toolName, args);
        const serialized = JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS);
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "success", durationMs: Date.now() - startedAt,
        });
        await emit({ type: "tool_finished", iteration, domain, toolName, status: "success" });
        return { ok: true, content: serialized };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida na ferramenta MCP";
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "error", durationMs: Date.now() - startedAt, error: message,
        });
        await emit({ type: "tool_finished", iteration, domain, toolName, status: "error" });
        return { ok: false, error: message, content: "" };
      }
    },
    onEvent: async event => {
      if (event.type === "model_started") {
        await emit({ type: "llm_started", iteration: event.iteration });
      } else if (event.type === "model_finished") {
        await emit({
          type: "llm_response",
          iteration: event.iteration,
          toolCallCount: event.toolCallCount,
          provider: event.provider,
        });
      }
    },
  });

  const content = runtimeResult.text.trim();

  await emit({ type: "response_parsed" });

  return {
    taskId,
    content,
    model: runtimeResult.response.model || ENV.aiModel || "gpt-5-mini",
    provider: runtimeResult.response.provider,
    iterations: runtimeResult.iterations,
    audit,
    readOnly: true,
    status: "respondido",
  };

}

export { MAX_ITERATIONS, toOpenAiTools };
