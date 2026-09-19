import { ENV } from "../_core/env";
import { McpClient, type McpCallResult, type McpTool } from "./mcp-client";

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
