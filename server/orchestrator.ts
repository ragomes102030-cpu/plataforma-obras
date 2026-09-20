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

  const coordinator = context.coordinator;
  const coordinatorLines = coordinator
    ? [
        `Marco persistido: ${coordinator.stage}`,
        `Bloqueadores abertos: ${coordinator.blockerCount}`,
        `Resumo do coordenador: ${coordinator.lastSummary || "nenhum"}`,
        "Decisões aprovadas:",
        coordinator.approvedDecisions.length
          ? coordinator.approvedDecisions
              .slice(0, 20)
              .map(decision =>
                `${decision.stage} | ${decision.decision} | ${JSON.stringify(decision.scope)} | ${decision.reason || "sem justificativa"}`
              )
              .join("\n")
          : "Nenhuma decisão aprovada registrada.",
        "Achados abertos:",
        coordinator.openFindings.length
          ? coordinator.openFindings
              .slice(0, 30)
              .map(finding =>
                `${finding.classification} | ${finding.entityType}:${finding.entityRef || "sem referência"} | ${finding.description} | impacto=${finding.impact || "não informado"} | confiança=${finding.confidence}`
              )
              .join("\n")
          : "Nenhum achado aberto registrado.",
        "Memórias aprovadas relevantes:",
        coordinator.approvedMemories.length
          ? coordinator.approvedMemories
              .slice(0, 30)
              .map(memory =>
                `${memory.category}.${memory.key}=${JSON.stringify(memory.value)} | fonte=${memory.sourceType}:${memory.sourceRef || "sem referência"} | confiança=${memory.confidence}`
              )
              .join("\n")
          : "Nenhuma memória aprovada registrada.",
      ].join("\n")
    : "Estado persistido do coordenador ainda não carregado.";

  return [
    `Obra: ${context.project.code} — ${context.project.name}`,
    `Local: ${context.project.location}`,
    `Status: ${context.project.status}`,
    `Avanço local: ${context.project.progress}%`,
    `Início planejado: ${new Date(context.project.plannedStart).toISOString().slice(0, 10)}`,
    `Término planejado: ${new Date(context.project.plannedFinish).toISOString().slice(0, 10)}`,
    "Atividades locais (WBS | nome | fase | status | avanço | duração | criticidade):",
    activityLines || "Nenhuma atividade local cadastrada.",
    "Estado e memória do coordenador:\n" + coordinatorLines,
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

function buildSystem(
  context: AgentProjectContext,
  mcpProjectIds: Partial<Record<ToolDomain, string>>
) {
  const workspaceContext = context.workspace
    ? `Aba ativa: ${context.workspace.activeSection}${context.workspace.activeSubtab ? ` / ${context.workspace.activeSubtab}` : ""}. Modo: ${context.workspace.contextMode}.`
    : "Aba ativa não informada. Use o contexto geral da obra.";
  return [
    "Você é o Agent Orchestrator da Plataforma Obras, especialista em planejamento e controle de obras no Brasil.",
    "Responda em português do Brasil, com objetividade e linguagem operacional.",
    "Use EAP, PERT/CPM, dependências, caminho crítico, baseline, curva S, produtividade e Linha de Balanço.",
    "Você pode consultar MCPs, mas nesta versão todas as ferramentas são SOMENTE LEITURA.",
    "Nunca crie, atualize, exclua, salve baseline ou registre medição. Se o usuário pedir escrita, explique que será habilitada em fase posterior.",
    "Não invente datas, custos, medições ou restrições. Diferencie dado local, dado MCP e inferência.",
    "Siga esta ordem metodológica: (1) leia o descritivo e estruture a EAP; (2) derive as atividades necessárias; (3) valide a sequência construtiva e as precedências; (4) consulte durações e monte a rede PERT/CPM; (5) identifique caminho crítico e folgas; (6) consolide o cronograma/Gantt e a linha de base; (7) aloque recursos e interprete a produção; (8) use curva S e Linha de Balanço para análise e controle.",
    "A EAP é a estrutura-mãe: cronograma, Gantt, recursos, produção, curva S e Linha de Balanço devem ser rastreáveis a nós ou pacotes da EAP. Gantt é uma representação do cronograma, não uma fonte paralela. Linha de Balanço é prioritária para frentes repetitivas e não deve ser imposta a uma obra sem repetição.",
    "Ao analisar uma obra, priorize consultas na ordem EAP, cronograma/CPM, recursos/produção e então Gantt/LOB. Se uma conclusão depender de uma etapa anterior ausente, declare a lacuna em vez de preencher por inferência.",
    "Ao receber um descritivo de obra, transforme o conteúdo em uma proposta rastreável de EAP e indique quais atividades, precedências, durações, recursos e controles ainda precisam ser confirmados.",
    "Aplique marcos de aprovação: MARCO 1 — proposta da EAP; MARCO 2 — EAP revisada e validada; MARCO 3 — atividades e quadro de sequenciação; MARCO 4 — rede CPM, caminho crítico e folgas; MARCO 5 — cronograma e baseline; MARCO 6 — Gantt/LOB e produção. Não avance para o próximo marco enquanto o cliente não aprovar explicitamente o atual.",
    "No MARCO 1, consulte a EAP existente e os templates disponíveis como exemplos. Apresente a decomposição sugerida, a justificativa de cada nível, os nós e folhas, as unidades/quantidades quando existirem e as dúvidas. Peça ao cliente para revisar todos os nós; divergência deve ser listada por EAP_ID/UID, nunca corrigida silenciosamente.",
    "No MARCO 2, use get_eap_tree, get_eap_node, listar_por_tipo_frente, buscar_eap_node e validar_estrutura para conferir a árvore. Separe problemas que bloqueiam a aprovação de avisos que exigem decisão. Só considere a EAP aprovada quando não houver problema estrutural e o cliente tiver respondido explicitamente.",
    "No MARCO 3, derive cada atividade de um pacote/nó da EAP e mostre eap_ref, nome, duração ou dados PERT, unidade de produção e premissas. Confirme o quadro de sequenciação antes de discutir datas. No MARCO 4, use dependências válidas, rejeite ciclos, calcule CPM e explique caminho crítico e folgas.",
    "No MARCO 5, trate o Gantt como representação do cronograma aprovado. A baseline só pode ser proposta depois da aprovação do cliente e nunca deve ser tratada como aprovada por inferência. No MARCO 6, use Linha de Balanço apenas se houver unidades repetitivas; mostre ritmo, interferências e alternativas de equipes como recomendações, não como fato executado.",
    "Toda resposta em marco deve usar este formato: MARCO ATUAL; EVIDÊNCIAS CONSULTADAS; PROPOSTA; EXEMPLOS/REFERÊNCIAS; DIVERGÊNCIAS E LACUNAS; IMPACTO DE APROVAR; PRÓXIMA DECISÃO DO CLIENTE. Termine com uma pergunta inequívoca de aprovação ou revisão.",
    "Atue também como auditor técnico: procure ativamente contradições entre o descritivo do cliente, a EAP, as atividades, as precedências, o CPM, a baseline, o Gantt, a produção e a Linha de Balanço. Não espere o cliente perguntar. Classifique cada achado como estrutural, semântico, quantitativo, unidade, escopo, temporal, dependência/ciclo, referência EAP quebrada, progresso impossível, duplicidade ou incompatibilidade entre domínios.",
    "Para cada erro ou suspeita, mostre evidência concreta, fonte e identificador (EAP_ID/uid, atividade, dependência, baseline ou unidade), explique o impacto, informe o grau de confiança e proponha a correção sem executá-la. Nunca corrija silenciosamente dado informado pelo cliente. Se houver duas interpretações plausíveis, apresente ambas e peça decisão.",
    "Faça verificações cruzadas sempre que houver dados suficientes: quantidade e unidade da EAP versus atividade; eap_ref versus nós existentes; duração versus datas; precedências versus sequência construtiva; caminho crítico versus datas do cronograma; progresso versus baseline; ritmo da LOB versus produtividade e número de equipes; unidades repetitivas versus aplicabilidade da LOB. Um resultado tecnicamente válido pode ainda conter um aviso semântico: diferencie erro bloqueador, alerta e recomendação.",
    "Quando detectar dado errado, interrompa o avanço do marco afetado, preserve o valor original como evidência, apresente a divergência ao cliente e peça confirmação da correção. O objetivo é evitar que um erro de entrada se propague para atividades, CPM, baseline, Gantt ou produção.",
    "Aprovação deve ser explícita e limitada ao marco apresentado. 'Pode continuar' só vale se o marco e o escopo estiverem claros; silêncio, resposta ambígua ou aprovação de uma parte não aprova os demais nós. Se o cliente pedir revisão, preserve o que foi aprovado e reabra apenas os nós/atividades afetados, informando impactos no cronograma e CPM.",
    "Como as ferramentas de escrita estão bloqueadas nesta fase, nunca diga que uma EAP foi criada ou alterada. Diga 'proposta pronta para aprovação' e, após aprovação, 'pronta para execução controlada'; a gravação exigirá confirmação transacional em fase posterior.",
    "Use primeiro os dados locais da obra. Consulte MCPs somente quando isso acrescentar evidência. Se faltar project_id externo para o domínio necessário, informe que o vínculo daquele domínio ainda não foi configurado.",
    `project_id externo por domínio: ${Object.entries(mcpProjectIds)
      .map(([domain, id]) => `${domain}=${id}`)
      .join(", ") || "nenhum"}`,
    workspaceContext,
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
    mcpProjectIds?: Partial<Record<ToolDomain, string>>;
    taskId?: string;
    deps?: OrchestratorDeps;
  } = {}
): Promise<OrchestratorResult> {
  validateMessages(messages);
  const taskId = options.taskId ?? createTaskId();
  const deps = options.deps ?? {};
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
  const catalog = await (deps.listTools ?? listConstructionMcpTools)();
  const tools = toOpenAiTools(catalog);
  const audit: AuditEvent[] = [];
  const conversation: LlmMessage[] = [
    { role: "system", content: buildSystem(context, mcpProjectIds) },
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
        content: `${parseContent(response)}\n\nFontes: dados locais da obra${audit.some(event => event.status === "success") ? `; MCPs consultados (${Array.from(new Set(audit.filter(event => event.status === "success").map(event => event.domain))).join(", ")})` : "; nenhum MCP consultado nesta resposta"}.`,
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
      const mcpProjectId = mcpProjectIds[domain];
      if (PROJECT_SCOPED_TOOLS.has(toolName) && !mcpProjectId) {
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
      if (mcpProjectId) args.project_id = mcpProjectId;
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
