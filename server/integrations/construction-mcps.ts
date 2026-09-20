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
    "pacotes_sem_dono",
    "resumo_quantitativos",
    "listar_templates",
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
    "criar_eap_node",
    "atualizar_eap_node",
    "move_eap_node",
    "registrar_retrabalho",
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

export function createConstructionMcpClients() {
  return {
    eap: new McpClient(ENV.mcpEapUrl, { name: "plataforma-obras-eap" }),
    cronograma: new McpClient(ENV.mcpCronogramaUrl, {
      name: "plataforma-obras-cronograma",
    }),
    ganttLob: new McpClient(ENV.mcpGanttLobUrl, {
      name: "plataforma-obras-gantt-lob",
    }),
  };
}

type ConstructionMcpClients = Record<
  ConstructionMcpDomain,
  Pick<McpClient, "listTools" | "callTool">
>;

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
        const tools = await client.listTools();
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
              toolCount: tools.length,
              durationMs: Date.now() - serverStartedAt,
              detail: "Nenhuma consulta de homologação compatível foi publicada.",
              error: null,
            },
          ] as const;
        }
        const result = await client.callTool(
          toolName,
          probeArguments(toolName, externalProjectIds[domain])
        );
        return [
          domain,
          {
            status: "passed" as const,
            toolName,
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
    servers: Object.fromEntries(entries) as ConstructionMcpHomologationResult["servers"],
  };
}

export async function getConstructionMcpStatus(
  requestId: string,
  clients: ConstructionMcpClients = createConstructionMcpClients()
): Promise<ConstructionMcpStatus> {
  const startedAt = Date.now();
  const entries = await Promise.all(
    (
      Object.entries(clients) as Array<
        [ConstructionMcpDomain, ConstructionMcpClients[ConstructionMcpDomain]]
      >
    ).map(async ([domain, client]) => {
      const serverStartedAt = Date.now();
      try {
        const tools = await client.listTools();
        return [
          domain,
          {
            status: "online" as const,
            latencyMs: Date.now() - serverStartedAt,
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
}

export async function listConstructionMcpTools() {
  const clients = createConstructionMcpClients();
  const entries = await Promise.all(
    Object.entries(clients).map(
      async ([key, client]) => [key, await client.listTools()] as const
    )
  );
  return Object.fromEntries(entries) as Record<string, McpTool[]>;
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
  return clients[domain].callTool(toolName, args);
}
