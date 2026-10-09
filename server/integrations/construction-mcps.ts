import { ENV } from "../_core/env";
import {
  extractMcpText,
  McpClient,
  type McpCallResult,
  type McpTool,
} from "./mcp-client";

export type ConstructionMcpDomain = "eap" | "cronograma" | "ganttLob";

export type ConstructionMcpServerStatus = {
  status: "online" | "offline";
  latencyMs: number;
  attempts: number;
  toolCount: number;
  tools: string[];
  lastError: string | null;
};

export type ConstructionMcpStatus = {
  status: "online" | "degraded" | "offline";
  requestId: string;
  checkedAt: string;
  durationMs: number;
  servers: Record<ConstructionMcpDomain, ConstructionMcpServerStatus>;
};

export function toCentralCommandMcpDomains(status: ConstructionMcpStatus) {
  const names: Record<ConstructionMcpDomain, string> = {
    eap: "EAP",
    cronograma: "Cronograma",
    ganttLob: "Gantt / Linha de Balanço",
  };

  return (Object.entries(status.servers) as Array<
    [ConstructionMcpDomain, ConstructionMcpServerStatus]
  >).map(([id, server]) => ({
    id,
    name: names[id],
    status: server.status,
    latencyMs: server.latencyMs,
    attempts: server.attempts,
    toolCount: server.toolCount,
    tools: server.tools,
    lastError: server.lastError,
  }));
}

export type ConstructionMcpToolCatalog = Record<
  ConstructionMcpDomain,
  McpTool[]
> & {
  errors?: Partial<Record<ConstructionMcpDomain, string>>;
};

export type ConstructionMcpHomologationResult = {
  requestId: string;
  externalProjectIds: Record<ConstructionMcpDomain, string>;
  startedAt: string;
  durationMs: number;
  readOnly: true;
  servers: Record<
    ConstructionMcpDomain,
    {
      status: "passed" | "failed" | "skipped";
      toolName: string | null;
      attempts: number;
      toolCount: number;
      durationMs: number;
      detail: string;
      error: string | null;
    }
  >;
};

export const MCP_TOOL_POLICY = {
  readOnly: new Set([
    "get_eap_tree",
    "get_eap_node",
    "listar_por_tipo_frente",
    "buscar_eap_node",
    "validar_estrutura",
    "pacotes_sem_dono",
    "resumo_quantitativos",
    "listar_templates",
    "listar_projetos",
    "listar_escopo",
    "validar_regra_100_porcento",
    "listar_atividades",
    "listar_dependencias",
    "validar_dependencias",
    "calcular_caminho_critico",
    "listar_baselines",
    "comparar_baseline",
    "curva_s",
    "listar_temas",
    "calcular_linha_balanco",
    "balancear_ritmos_lob",
    "dimensionar_equipes_lob",
  ]),
  requiresConfirmation: new Set([
    "criar_projeto",
    "atualizar_projeto",
    "criar_eap_node",
    "atualizar_eap_node",
    "move_eap_node",
    "registrar_retrabalho",
    "definir_criterio",
    "criar_item_escopo",
    "vincular_escopo_eap",
    "desvincular_escopo_eap",
    "criar_atividade",
    "atualizar_atividade",
    "criar_dependencia",
    "salvar_baseline",
    "gerar_gantt",
  ]),
  destructive: new Set([
    "deletar_projeto",
    "deletar_eap_node",
    "deletar_atividade",
    "deletar_dependencia",
  ]),
} as const;

export const CONTROLLED_MUTATION_POLICY: Record<
  ConstructionMcpDomain,
  Set<string>
> = {
  eap: new Set([
    "atualizar_projeto",
    "criar_eap_node",
    "atualizar_eap_node",
    "definir_criterio",
    "criar_item_escopo",
    "vincular_escopo_eap",
    "desvincular_escopo_eap",
    "move_eap_node",
    "deletar_eap_node",
    "registrar_retrabalho",
  ]),
  cronograma: new Set([
    "criar_atividade",
    "atualizar_atividade",
    "criar_dependencia",
    "salvar_baseline",
    "gerar_gantt",
  ]),
  ganttLob: new Set(["gerar_gantt"]),
};

export const MUTATING_TOOLS = new Set([
  "criar_projeto",
  "deletar_projeto",
  "atualizar_projeto",
  "criar_eap_node",
  "atualizar_eap_node",
  "move_eap_node",
  "deletar_eap_node",
  "registrar_retrabalho",
  "definir_criterio",
  "criar_item_escopo",
  "vincular_escopo_eap",
  "desvincular_escopo_eap",
  "criar_atividade",
  "atualizar_atividade",
  "criar_dependencia",
  "deletar_atividade",
  "deletar_dependencia",
  "salvar_baseline",
  "gerar_gantt",
]);

export const PROJECT_SCOPED_MUTATION_TOOLS = new Set([
  "atualizar_projeto",
  "criar_eap_node",
  "atualizar_eap_node",
  "move_eap_node",
  "deletar_eap_node",
  "registrar_retrabalho",
  "definir_criterio",
  "criar_item_escopo",
  "vincular_escopo_eap",
  "desvincular_escopo_eap",
  "deletar_projeto",
  "criar_atividade",
  "atualizar_atividade",
  "criar_dependencia",
  "deletar_atividade",
  "deletar_dependencia",
  "salvar_baseline",
  "gerar_gantt",
]);

export const PROJECT_SCOPED_READ_ONLY_TOOLS = new Set([
  "get_eap_tree",
  "get_eap_node",
  "listar_por_tipo_frente",
  "buscar_eap_node",
  "validar_estrutura",
  "pacotes_sem_dono",
  "resumo_quantitativos",
  "listar_escopo",
  "validar_regra_100_porcento",
  "validar_regra_100_porcento",
  "listar_atividades",
  "listar_dependencias",
  "validar_dependencias",
  "calcular_caminho_critico",
  "listar_baselines",
  "comparar_baseline",
  "curva_s",
  "calcular_linha_balanco",
]);

export function createConstructionMcpClients() {
  return {
    eap: new McpClient(ENV.mcpEapUrl, {
      name: "plataforma-obras-eap",
      timeoutMs: ENV.mcpTimeoutMs,
    }),
    cronograma: new McpClient(ENV.mcpCronogramaUrl, {
      name: "plataforma-obras-cronograma",
      timeoutMs: ENV.mcpTimeoutMs,
    }),
    ganttLob: new McpClient(ENV.mcpGanttLobUrl, {
      name: "plataforma-obras-gantt-lob",
      timeoutMs: ENV.mcpTimeoutMs,
    }),
  };
}

type ConstructionMcpClients = Record<
  ConstructionMcpDomain,
  Pick<McpClient, "listTools" | "callTool">
>;

type ConstructionMcpReadClients = Record<
  ConstructionMcpDomain,
  Pick<McpClient, "listTools">
>;

const IS_TEST_RUNTIME = process.env.NODE_ENV === "test";
const READ_RETRY_LIMIT = IS_TEST_RUNTIME ? 1 : 2;
const READ_RETRY_DELAYS_MS = IS_TEST_RUNTIME
  ? ([1_000] as const)
  : ([2_000, 5_000] as const);
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;
const circuitBreakers = new Map<
  ConstructionMcpDomain,
  { consecutiveFailures: number; openedAt: number | null }
>();
let toolCatalogCache: {
  expiresAt: number;
  value: ConstructionMcpToolCatalog;
} | null = null;
let toolCatalogInFlight: Promise<ConstructionMcpToolCatalog> | null = null;
const MCP_STATUS_CACHE_TTL_MS = 30_000;
let mcpStatusCache: {
  expiresAt: number;
  value: ConstructionMcpStatus;
} | null = null;
let mcpStatusInFlight: Promise<ConstructionMcpStatus> | null = null;

export function resetMcpResilienceState() {
  circuitBreakers.clear();
  toolCatalogCache = null;
  toolCatalogInFlight = null;
  mcpStatusCache = null;
  mcpStatusInFlight = null;
}

function circuitState(domain: ConstructionMcpDomain) {
  const current = circuitBreakers.get(domain);
  if (current) return current;
  const created = { consecutiveFailures: 0, openedAt: null };
  circuitBreakers.set(domain, created);
  return created;
}

function isTransientMcpFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|fetch failed|network|econnreset|MCP (408|425|429|5\d\d)/i.test(
    message
  );
}

class ReadOnlyResilienceError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly circuitOpen = false
  ) {
    super(message);
    this.name = "ReadOnlyResilienceError";
  }
}

function attemptCount(error: unknown) {
  return error instanceof ReadOnlyResilienceError ? error.attempts : 1;
}

async function runReadOnlyWithResilience<T>(
  domain: ConstructionMcpDomain,
  operation: () => Promise<T>
): Promise<{ value: T; attempts: number }> {
  const state = circuitState(domain);
  if (
    state.openedAt !== null &&
    Date.now() - state.openedAt < CIRCUIT_COOLDOWN_MS
  ) {
    throw new ReadOnlyResilienceError(
      `Circuit breaker aberto para o MCP ${domain}; nova tentativa após o cooldown.`,
      0,
      true
    );
  }
  if (state.openedAt !== null) state.openedAt = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= READ_RETRY_LIMIT + 1; attempt++) {
    try {
      const value = await operation();
      state.consecutiveFailures = 0;
      state.openedAt = null;
      return { value, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!isTransientMcpFailure(error) || attempt > READ_RETRY_LIMIT) break;
      const delayMs =
        READ_RETRY_DELAYS_MS[attempt - 1] ?? READ_RETRY_DELAYS_MS.at(-1)!;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openedAt = Date.now();
  }
  throw new ReadOnlyResilienceError(
    errorMessage(lastError),
    READ_RETRY_LIMIT + 1
  );
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida";
  return message.replace(/\s+/g, " ").trim().slice(0, 240);
}

const homologationProbes: Record<ConstructionMcpDomain, string[]> = {
  eap: ["get_eap_tree", "get_eap_node", "listar_templates"],
  cronograma: ["listar_atividades", "listar_dependencias", "listar_baselines"],
  ganttLob: ["listar_temas", "calcular_linha_balanco"],
};

function probeArguments(toolName: string, externalProjectId: string) {
  return [
    "get_eap_tree",
    "get_eap_node",
    "listar_atividades",
    "listar_dependencias",
    "listar_baselines",
    "calcular_caminho_critico",
    "comparar_baseline",
    "curva_s",
    "calcular_linha_balanco",
  ].includes(toolName)
    ? { project_id: externalProjectId }
    : {};
}

function resultDetail(result: McpCallResult) {
  const text = extractMcpText(result).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 240);
  return result.structuredContent === undefined
    ? "Consulta concluída sem conteúdo textual."
    : "Consulta concluída com conteúdo estruturado.";
}

export async function runConstructionMcpHomologation(
  externalProjectIds: Record<ConstructionMcpDomain, string>,
  requestId: string,
  clients: ConstructionMcpClients = createConstructionMcpClients()
): Promise<ConstructionMcpHomologationResult> {
  const startedAt = new Date();
  const entries = await Promise.all(
    (
      Object.entries(clients) as Array<
        [ConstructionMcpDomain, ConstructionMcpClients[ConstructionMcpDomain]]
      >
    ).map(async ([domain, client]) => {
      const serverStartedAt = Date.now();
      try {
        const toolsResult = await runReadOnlyWithResilience(domain, () =>
          client.listTools()
        );
        const tools = toolsResult.value;
        let attempts = toolsResult.attempts;
        const allowedNames = new Set(
          tools
            .filter(tool => MCP_TOOL_POLICY.readOnly.has(tool.name as never))
            .map(tool => tool.name)
        );
        const toolName = homologationProbes[domain].find(name =>
          allowedNames.has(name)
        );
        if (!toolName) {
          return [
            domain,
            {
              status: "skipped" as const,
              toolName: null,
              attempts,
              toolCount: tools.length,
              durationMs: Date.now() - serverStartedAt,
              detail:
                "Nenhuma consulta de homologação compatível foi publicada.",
              error: null,
            },
          ] as const;
        }
        const callResult = await runReadOnlyWithResilience(domain, () =>
          client.callTool(
            toolName,
            probeArguments(toolName, externalProjectIds[domain])
          )
        );
        attempts += callResult.attempts;
        const result = callResult.value;
        return [
          domain,
          {
            status: "passed" as const,
            toolName,
            attempts,
            toolCount: tools.length,
            durationMs: Date.now() - serverStartedAt,
            detail: resultDetail(result),
            error: null,
          },
        ] as const;
      } catch (error) {
        const message = errorMessage(error);
        console.error(
          JSON.stringify({
            evento: "mcp_homologation_error",
            requestId,
            servidor: domain,
            externalProjectId: externalProjectIds[domain],
            erro: message,
          })
        );
        return [
          domain,
          {
            status: "failed" as const,
            toolName: null,
            attempts: attemptCount(error),
            toolCount: 0,
            durationMs: Date.now() - serverStartedAt,
            detail: "A consulta somente leitura falhou.",
            error: message,
          },
        ] as const;
      }
    })
  );

  return {
    requestId,
    externalProjectIds,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    readOnly: true,
    servers: Object.fromEntries(
      entries
    ) as ConstructionMcpHomologationResult["servers"],
  };
}

export async function getConstructionMcpStatus(
  requestId: string,
  clients?: ConstructionMcpReadClients
): Promise<ConstructionMcpStatus> {
  const useSharedCache = clients === undefined;

  if (
    useSharedCache &&
    mcpStatusCache &&
    mcpStatusCache.expiresAt > Date.now()
  ) {
    return { ...mcpStatusCache.value, requestId };
  }

  if (useSharedCache && mcpStatusInFlight) {
    const value = await mcpStatusInFlight;
    return { ...value, requestId };
  }

  const runStatusCheck = async (): Promise<ConstructionMcpStatus> => {
    const effectiveClients = clients ?? createConstructionMcpClients();
    const startedAt = Date.now();
    const entries = await Promise.all(
      (
        Object.entries(effectiveClients) as Array<
          [ConstructionMcpDomain, ConstructionMcpReadClients[ConstructionMcpDomain]]
        >
      ).map(async ([domain, client]) => {
        const serverStartedAt = Date.now();
        try {
          const toolsResult = await runReadOnlyWithResilience(domain, () =>
            client.listTools()
          );
          const tools = toolsResult.value;
          return [
            domain,
            {
              status: "online" as const,
              latencyMs: Date.now() - serverStartedAt,
              attempts: toolsResult.attempts,
              toolCount: tools.length,
              tools: tools.map(tool => tool.name),
              lastError: null,
            },
          ] as const;
        } catch (error) {
          const message = errorMessage(error);
          const latencyMs = Date.now() - serverStartedAt;
          console.error(
            JSON.stringify({
              evento: "mcp_status_error",
              requestId,
              servidor: domain,
              latencia_ms: latencyMs,
              erro: message,
            })
          );
          return [
            domain,
            {
              status: "offline" as const,
              latencyMs,
              attempts: attemptCount(error),
              toolCount: 0,
              tools: [],
              lastError: message,
            },
          ] as const;
        }
      })
    );

    const servers = Object.fromEntries(entries) as Record<
      ConstructionMcpDomain,
      ConstructionMcpServerStatus
    >;
    const serverStatuses = Object.values(servers).map(server => server.status);
    const status = serverStatuses.every(value => value === "online")
      ? "online"
      : serverStatuses.some(value => value === "online")
        ? "degraded"
        : "offline";

    return {
      status,
      requestId,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      servers,
    };
  };

  if (!useSharedCache) return runStatusCheck();

  const promise = runStatusCheck();
  mcpStatusInFlight = promise;
  try {
    const value = await promise;
    mcpStatusCache = {
      value,
      expiresAt: Date.now() + MCP_STATUS_CACHE_TTL_MS,
    };
    return value;
  } finally {
    mcpStatusInFlight = null;
  }
}

export async function listConstructionMcpTools(): Promise<ConstructionMcpToolCatalog> {
  if (toolCatalogCache && toolCatalogCache.expiresAt > Date.now()) {
    return toolCatalogCache.value;
  }
  if (toolCatalogInFlight) return toolCatalogInFlight;
  const promise = (async () => {
    const clients = createConstructionMcpClients();
    const entries = await Promise.all(
      Object.entries(clients).map(async ([key, client]) => {
        try {
          return [
            key,
            (
              await runReadOnlyWithResilience(
                key as ConstructionMcpDomain,
                () => client.listTools()
              )
            ).value,
            null,
          ] as const;
        } catch (error) {
          const message = errorMessage(error);
          console.error(
            JSON.stringify({
              evento: "mcp_catalog_error",
              servidor: key,
              erro: message,
            })
          );
          return [key, [] as McpTool[], message] as const;
        }
      })
    );
    const catalog = {
      eap: entries.find(([key]) => key === "eap")?.[1] ?? [],
      cronograma: entries.find(([key]) => key === "cronograma")?.[1] ?? [],
      ganttLob: entries.find(([key]) => key === "ganttLob")?.[1] ?? [],
      errors: Object.fromEntries(
        entries.filter(entry => entry[2]).map(entry => [entry[0], entry[2]])
      ) as Partial<Record<ConstructionMcpDomain, string>>,
    } satisfies ConstructionMcpToolCatalog;
    const ttlMs =
      Number.isFinite(ENV.mcpCatalogTtlMs) && ENV.mcpCatalogTtlMs > 0
        ? ENV.mcpCatalogTtlMs
        : 300_000;
    toolCatalogCache = { value: catalog, expiresAt: Date.now() + ttlMs };
    return catalog;
  })();
  toolCatalogInFlight = promise;
  try {
    return await promise;
  } finally {
    toolCatalogInFlight = null;
  }
}

export async function callReadOnlyMcpTool(
  domain: keyof ReturnType<typeof createConstructionMcpClients>,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<McpCallResult> {
  if (!MCP_TOOL_POLICY.readOnly.has(toolName as never)) {
    throw new Error(
      `Ferramenta MCP não permitida em modo somente leitura: ${toolName}`
    );
  }
  const clients = createConstructionMcpClients();
  return (
    await runReadOnlyWithResilience(domain, () =>
      clients[domain].callTool(toolName, args)
    )
  ).value;
}

export async function callControlledMcpTool(
  domain: ConstructionMcpDomain,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpCallResult> {
  if (!CONTROLLED_MUTATION_POLICY[domain].has(toolName)) {
    throw new Error(
      `Mutação não liberada para teste controlado: ${domain}.${toolName}`
    );
  }
  if (JSON.stringify(args).toLowerCase().includes('"project_id":"default"')) {
    throw new Error("O project_id default é bloqueado para mutações reais.");
  }
  const clients = createConstructionMcpClients();
  return clients[domain].callTool(toolName, args);
}

export async function callMutationMcpTool(
  domain: ConstructionMcpDomain,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpCallResult> {
  if (!MUTATING_TOOLS.has(toolName)) {
    throw new Error(`Ferramenta não é uma mutação conhecida: ${domain}.${toolName}`);
  }
  if (PROJECT_SCOPED_MUTATION_TOOLS.has(toolName) && !String(args.project_id ?? "").trim()) {
    throw new Error(`A mutação ${domain}.${toolName} exige project_id explícito.`);
  }
  if (String(args.project_id ?? "").trim() === "default") {
    throw new Error("O project_id default é bloqueado para mutações reais.");
  }
  const clients = createConstructionMcpClients();
  return clients[domain].callTool(toolName, args);
}
