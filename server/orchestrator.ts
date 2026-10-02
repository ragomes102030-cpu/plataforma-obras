import { ENV } from "./_core/env";
import type { AgentMessage, AgentProjectContext } from "./agent";
import {
  MCP_TOOL_POLICY,
  MUTATING_TOOLS,
  PROJECT_SCOPED_MUTATION_TOOLS,
  callMutationMcpTool,
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
import { runEngineeringTeam } from "./agent/engineering-team";
import { runReActAgent } from "./agent/runtime/react-runtime";
import {
  listRepositoryDirectory,
  readRepositoryFile,
  repositoryInfo,
  searchRepositoryCode,
  updateRepositoryFile,
} from "./integrations/repository-tools";
import {
  getArquimedesCapabilitySnapshot,
  installArquimedesCapability,
  setArquimedesCapabilityEnabled,
} from "./agent/capability-manager";

const MAX_ITERATIONS = 8;
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
  readOnly: false;
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
  userId?: number;
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

const ENGINEERING_TEAM_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "engineering_team_analysis",
    description: "Convoca a equipe interna de especialistas do Arquimedes para analisar a obra. O coordenador deve usar o resultado para consolidar achados. Especialistas são somente leitura e não alteram a obra.",
    parameters: {
      type: "object",
      properties: { focus: { type: "string", enum: ["geral", "eap", "cronograma", "producao", "lob"] } },
      additionalProperties: false,
    },
  },
};

const ENGINEERING_GAP_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "engineering_gap_analysis",
    description:
      "Faz uma varredura técnica da obra antes de concluir uma análise. Escolha um único foco geral ou, no máximo, dois focos complementares. Não repita o mesmo foco e não percorra todas as especialidades só porque elas existem. Consulta validações estruturais, pacotes sem dono, atividades, dependências, CPM e linha de base quando essas ferramentas estiverem disponíveis. Use quando o usuário pedir uma análise da obra, dos problemas, das lacunas ou quando você precisar descobrir algo que ele talvez não esteja vendo.",
    parameters: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["geral", "eap", "cronograma", "producao", "lob"],
          description: "Área principal da varredura."
        }
      },
      additionalProperties: false
    }
  }
};

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
      name: "list_archimedes_capabilities",
      description:
        "Lista as capacidades instaladas, disponíveis, ativadas e suas dependências. É uma ferramenta administrativa e só pode ser usada por administradores.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "install_archimedes_capability",
      description:
        "Instala e ativa uma capacidade do catálogo homologado do Arquimedes. Só execute quando o administrador pedir explicitamente a instalação; dependências precisam estar instaladas e ativas.",
      parameters: {
        type: "object",
        properties: {
          capabilityId: { type: "string" },
        },
        required: ["capabilityId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_archimedes_capability_enabled",
      description:
        "Ativa ou desativa uma capacidade já instalada. É administrativo; só execute quando o administrador pedir explicitamente.",
      parameters: {
        type: "object",
        properties: {
          capabilityId: { type: "string" },
          enabled: { type: "boolean" },
        },
        required: ["capabilityId", "enabled"],
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

function toOpenAiTools(
  catalog: ConstructionMcpToolCatalog,
  allowMutations = false
): LlmTool[] {
  const tools: LlmTool[] = [];
  for (const entries of [catalog.eap, catalog.cronograma, catalog.ganttLob]) {
    if (!Array.isArray(entries)) continue;
    for (const tool of entries) {
      const isReadOnly = MCP_TOOL_POLICY.readOnly.has(tool.name as never);
      const isMutation = MUTATING_TOOLS.has(tool.name);
      if (!isReadOnly && !(allowMutations && isMutation)) continue;
      const domain = TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS];
      if (!domain) continue;
      const description = isReadOnly
        ? `${tool.description ?? "Consulta MCP"} Domínio: ${domain}. Somente leitura.`
        : `${tool.description ?? "Operação MCP"} Domínio: ${domain}. ALTERA DADOS. Só execute após confirmação explícita do usuário nesta conversa.`;
      tools.push({
        type: "function",
        function: {
          name: tool.name,
          description,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      });
    }
  }
  // O chat do Arquimedes permanece no papel de orquestrador. A Análise/Revisão
  // formal com Euclides ocorre no fluxo próprio e não deve ser disparada
  // silenciosamente por uma mensagem de chat.
  return [...tools, ENGINEERING_GAP_TOOL, ...RUNTIME_TOOLS];
}

function hasExplicitMutationConfirmation(messages: AgentMessage[]) {
  const lastUser = [...messages].reverse().find(message => message.role === "user");
  if (!lastUser) return false;
  return /(?:^|\b)(confirmo|confirmado|pode aplicar|pode corrigir|aplique|pode executar|sim,?\s*(?:pode|aplique|corrija))(?:\b|$)/i.test(
    lastUser.content.trim()
  );
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
    "Para análises complexas, não conclua na primeira consulta: use os resultados para decidir quais ferramentas consultar em seguida, faça verificações cruzadas e só finalize quando houver evidência suficiente. Você pode fazer várias rodadas de ferramentas antes da resposta final.",
    "Na EAP, nunca tente colocar diagnóstico, justificativas extensas ou todo o raciocínio em um único campo textual. Use os campos estruturados dos nós para registrar evidências e correções; o resumo deve sintetizar a conclusão.",
    "Não invente dados, consultas, resultados, aprovações ou alterações. Diferencie fatos confirmados, inferências e informações que ainda faltam.",
    "As ferramentas de obra incluem consultas e operações de escrita controlada. Nunca altere dados na primeira análise: primeiro leia, diagnostique, apresente a alteração proposta e peça confirmação explícita ao engenheiro. Só depois de uma confirmação explícita nesta conversa execute a mutação. Após qualquer mutação, reconsulte a obra e valide o resultado. Exclusões são destrutivas e exigem confirmação explícita ainda mais clara.",
    "Resultados determinísticos de EAP, dependências e CPM devem ser tratados como cálculo do sistema. Não substitua esses resultados por estimativas suas quando o dado calculado estiver disponível.",
    "Para dúvidas técnicas de planejamento, use EAP, atividades, precedências, CPM, caminho crítico, folgas, Gantt, Linha de Balanço, produção e controle.",
    responseIntent === "analise"
      ? "Quando a intenção for análise no chat, continue sendo o Arquimedes: use consultas MCP somente leitura e, quando a pergunta exigir uma varredura ampla, use engineering_gap_analysis. Não convoque Euclides nem outros revisores silenciosamente; a Análise/Revisão formal de EAP pertence ao fluxo próprio de revisão."
      : "Em consultas pontuais, não faça uma varredura completa sem necessidade.",
    "Quando uma consulta de ferramenta falhar, tente outra fonte somente se houver uma alternativa útil. Se a informação continuar indisponível e for importante para a resposta, diga simplesmente que esse dado não está disponível agora.",
    "Quando o usuário perguntar sobre o próprio código, arquitetura, bugs ou funcionamento interno da Plataforma Obras, use as ferramentas de repositório disponíveis para investigar. Não diga que não possui acesso ao código se a ferramenta puder fornecê-lo.",
    "Antes de modificar código, leia os arquivos envolvidos e confirme a causa do problema. Depois aplique somente a mudança necessária. Não invente que testou algo: use evidências reais.",
    "A ferramenta de atualização do repositório trabalha apenas na branch de trabalho configurada pelo runtime e aplica validações de caminho e concorrência. Nunca trate uma alteração como implantada até existir evidência do deploy.",
    "A administração de capacidades do Arquimedes é restrita a administradores. Instalação ou ativação só deve ocorrer quando houver um pedido explícito do administrador; não instale uma capacidade apenas porque ela parece útil.",
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
  const allowMutations = intent === "operacao" && hasExplicitMutationConfirmation(messages);
  const tools = toOpenAiTools(catalog, allowMutations);
  await emit({
    type: "catalog_loaded",
    toolCount: tools.length,
    errors: catalog.errors,
  });
  const audit: AuditEvent[] = [];
  const gapAnalysisFoci = new Set<string>();
  const MAX_GAP_ANALYSES = 2;
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

      if (
        toolName === "list_archimedes_capabilities" ||
        toolName === "install_archimedes_capability" ||
        toolName === "set_archimedes_capability_enabled"
      ) {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          if (!options.userId) {
            throw new Error("A sessão do usuário não foi identificada para administrar capacidades.");
          }
          let value: unknown;
          if (toolName === "list_archimedes_capabilities") {
            value = await getArquimedesCapabilitySnapshot(options.userId);
          } else if (toolName === "install_archimedes_capability") {
            value = await installArquimedesCapability(
              options.userId,
              String(rawArgs.capabilityId ?? "")
            );
          } else {
            value = await setArquimedesCapabilityEnabled(
              options.userId,
              String(rawArgs.capabilityId ?? ""),
              Boolean(rawArgs.enabled)
            );
          }
          audit.push({
            taskId,
            iteration,
            event: "tool_call",
            domain: "runtime",
            toolName,
            status: "success",
            durationMs: Date.now() - startedAt,
          });
          await emit({
            type: "tool_finished",
            iteration,
            domain: "runtime",
            toolName,
            status: "success",
          });
          return {
            ok: true,
            content: JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Falha na administração de capacidades.";
          audit.push({
            taskId,
            iteration,
            event: "tool_call",
            domain: "runtime",
            toolName,
            status: "error",
            durationMs: Date.now() - startedAt,
            error: message,
          });
          await emit({
            type: "tool_finished",
            iteration,
            domain: "runtime",
            toolName,
            status: "error",
          });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "engineering_team_analysis") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        const focus = typeof rawArgs.focus === "string" ? rawArgs.focus : "geral";
        try {
          const value = await runEngineeringTeam(
            context,
            catalog,
            {
              eap: mcpProjectIds.eap,
              cronograma: mcpProjectIds.cronograma,
              ganttLob: mcpProjectIds.ganttLob,
            },
            focus,
            {
              callLlm: deps.callLlm ?? invokeLlmGateway,
              onSpecialistEvent: async event => {
                const specialistToolName = `specialist:${event.specialist}`;
                if (event.type === "started") {
                  await emit({ type: "tool_started", iteration, domain: "runtime", toolName: specialistToolName });
                } else {
                  await emit({
                    type: "tool_finished",
                    iteration,
                    domain: "runtime",
                    toolName: specialistToolName,
                    status: event.status === "erro" ? "error" : "success",
                  });
                }
              },
            }
          );
          audit.push({
            taskId, iteration, event: "tool_call", domain: "runtime", toolName,
            status: "success", durationMs: Date.now() - startedAt,
          });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.push({
            taskId, iteration, event: "tool_call", domain: "runtime", toolName,
            status: "error", durationMs: Date.now() - startedAt, error: message,
          });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "engineering_gap_analysis") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        const focus = typeof rawArgs.focus === "string" ? rawArgs.focus : "geral";
        const checksByFocus: Record<string, string[]> = {
          geral: [
            "validar_estrutura",
            "pacotes_sem_dono",
            "listar_atividades",
            "listar_dependencias",
            "validar_dependencias",
            "calcular_caminho_critico",
            "listar_baselines",
            "calcular_linha_balanco",
          ],
          eap: ["get_eap_tree", "validar_estrutura", "pacotes_sem_dono", "resumo_quantitativos"],
          cronograma: ["listar_atividades", "listar_dependencias", "validar_dependencias", "calcular_caminho_critico", "listar_baselines", "comparar_baseline"],
          producao: ["pacotes_sem_dono", "resumo_quantitativos", "listar_atividades"],
          lob: ["listar_temas", "calcular_linha_balanco", "balancear_ritmos_lob", "dimensionar_equipes_lob"],
        };
        if (gapAnalysisFoci.has(focus)) {
          const value = {
            obra: context.project.code,
            foco: focus,
            status: "ja_executado",
            instrucao:
              "Esta varredura já foi executada nesta análise. Use o resultado anterior e consolide a resposta; não repita a mesma consulta.",
          };
          return { ok: true, content: JSON.stringify(value) };
        }

        if (
          gapAnalysisFoci.has("geral") ||
          (focus === "geral" && gapAnalysisFoci.size > 0) ||
          gapAnalysisFoci.size >= MAX_GAP_ANALYSES
        ) {
          const value = {
            obra: context.project.code,
            foco: focus,
            status: "limite_atingido",
            instrucao:
              "O orçamento de varreduras desta análise já foi usado. Não solicite outra varredura; consolide as evidências já coletadas e conclua.",
          };
          return { ok: true, content: JSON.stringify(value) };
        }

        gapAnalysisFoci.add(focus);

        // As ferramentas oficiais dos MCPs são um contrato conhecido do
        // orquestrador. Mesmo que a descoberta dinâmica (listTools) esteja
        // temporariamente indisponível/limitada (ex.: HTTP 429), podemos tentar
        // as consultas somente-leitura diretamente e registrar o erro real se
        // a execução também estiver indisponível.
        const knownByDomain: Record<string, Set<string>> = {
          eap: new Set([
            "get_eap_tree",
            "validar_estrutura",
            "pacotes_sem_dono",
            "resumo_quantitativos",
          ]),
          cronograma: new Set([
            "listar_atividades",
            "listar_dependencias",
            "validar_dependencias",
            "calcular_caminho_critico",
            "listar_baselines",
            "comparar_baseline",
          ]),
          ganttLob: new Set([
            "listar_temas",
            "calcular_linha_balanco",
            "balancear_ritmos_lob",
            "dimensionar_equipes_lob",
          ]),
        };
        const discovered = new Map(
          [...catalog.eap, ...catalog.cronograma, ...catalog.ganttLob]
            .map(tool => [tool.name, tool] as const)
        );
        const requested = checksByFocus[focus] ?? checksByFocus.geral;
        const findings: Array<Record<string, unknown>> = [];
        for (const check of requested) {
          const domain = TOOL_DOMAINS[check as keyof typeof TOOL_DOMAINS];
          if (!domain || !knownByDomain[domain]?.has(check)) {
            findings.push({ check, status: "indisponivel" });
            continue;
          }
          const discoveredTool = discovered.get(check);
          const projectId = mcpProjectIds[domain];
          if (!domain || !projectId) {
            findings.push({ check, status: "sem_projeto_mcp" });
            continue;
          }
          try {
            const result = await (deps.callTool ?? callReadOnlyMcpTool)(
              domain,
              check,
              { project_id: projectId }
            );
            findings.push({ check, status: "ok", result });
          } catch (error) {
            findings.push({
              check,
              status: "erro",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        const value = {
          obra: context.project.code,
          foco: focus,
          verificacoes: findings,
          instrucao:
            "Interprete os resultados como evidência. Separe achados confirmados de hipóteses e indisponibilidades. Não altere a obra nesta ferramenta.",
        };
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
        return { ok: true, content: JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS) };
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
      const isReadOnly = MCP_TOOL_POLICY.readOnly.has(toolName);
      const isMutation = MUTATING_TOOLS.has(toolName);
      if (!domain || (!isReadOnly && !isMutation)) {
        throw new Error(`Ferramenta não permitida pelo runtime: ${toolName}`);
      }
      if (isMutation && !allowMutations) {
        const message = "A alteração ainda não foi autorizada. Apresente a proposta e peça confirmação explícita antes de executar.";
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "error", durationMs: Date.now() - startedAt, error: message,
        });
        return { ok: false, error: message, content: "" };
      }

      await emit({ type: "tool_started", iteration, domain, toolName });

      const mcpProjectId = mcpProjectIds[domain];
      if ((PROJECT_SCOPED_TOOLS.has(toolName) || PROJECT_SCOPED_MUTATION_TOOLS.has(toolName)) && !mcpProjectId) {
        const message = "A obra ainda não possui project_id externo autorizado para esta operação MCP.";
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
        const result = isMutation
          ? await callMutationMcpTool(domain as any, toolName, args)
          : await (deps.callTool ?? callReadOnlyMcpTool)(domain, toolName, args);
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
    readOnly: false,
    status: "respondido",
  };

}

export { MAX_ITERATIONS, toOpenAiTools };
