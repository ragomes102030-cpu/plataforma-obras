import type { AgentProjectContext } from "../agent";
import type { LlmMessage, LlmResponse, LlmTool } from "../llm-provider-gateway";
import { invokeLlmGateway } from "../llm-provider-gateway";
import {
  MCP_TOOL_POLICY,
  callReadOnlyMcpTool,
  type ConstructionMcpToolCatalog,
} from "../integrations/construction-mcps";
import { runReActAgent } from "./runtime/react-runtime";
import type { McpCallResult } from "../integrations/mcp-client";

export type SpecialistId =
  | "eap"
  | "cronograma"
  | "producao"
  | "auditor";

type SpecialistDefinition = {
  id: SpecialistId;
  name: string;
  mission: string;
  tools: string[];
};

const SPECIALISTS: SpecialistDefinition[] = [
  {
    id: "eap",
    name: "Especialista EAP",
    mission:
      "Avaliar a estrutura da EAP, hierarquia, pacotes, frentes, responsáveis, quantitativos e coerência entre níveis. Identifique lacunas que o engenheiro talvez não esteja vendo.",
    tools: ["get_eap_tree", "get_eap_node", "validar_estrutura", "pacotes_sem_dono", "resumo_quantitativos", "listar_por_tipo_frente", "buscar_eap_node"],
  },
  {
    id: "cronograma",
    name: "Especialista de Cronograma",
    mission:
      "Avaliar atividades, predecessoras, sucessoras, dependências, caminho crítico, folgas, baseline e consistência temporal. Diferencie problemas calculados de hipóteses.",
    tools: ["listar_atividades", "listar_dependencias", "validar_dependencias", "calcular_caminho_critico", "listar_baselines", "comparar_baseline", "curva_s"],
  },
  {
    id: "producao",
    name: "Especialista de Produção e LOB",
    mission:
      "Avaliar produção, pacotes sem dono, quantitativos, frentes, temas, ritmos, linha de balanço e dimensionamento de equipes quando disponíveis.",
    tools: ["pacotes_sem_dono", "resumo_quantitativos", "listar_atividades", "listar_temas", "calcular_linha_balanco", "balancear_ritmos_lob", "dimensionar_equipes_lob"],
  },
  {
    id: "auditor",
    name: "Auditor Técnico",
    mission:
      "Fazer uma revisão independente dos achados. Procure conflitos entre EAP, cronograma e produção, falsos positivos, impactos cruzados e dados faltantes. Não execute alterações.",
    tools: [
      "validar_estrutura",
      "pacotes_sem_dono",
      "listar_atividades",
      "listar_dependencias",
      "validar_dependencias",
      "calcular_caminho_critico",
      "calcular_linha_balanco",
    ],
  },
];

function domainForTool(toolName: string) {
  if (
    [
      "get_eap_tree",
      "get_eap_node",
      "listar_por_tipo_frente",
      "buscar_eap_node",
      "validar_estrutura",
      "pacotes_sem_dono",
      "resumo_quantitativos",
    ].includes(toolName)
  )
    return "eap" as const;
  if (
    [
      "listar_atividades",
      "listar_dependencias",
      "validar_dependencias",
      "calcular_caminho_critico",
      "listar_baselines",
      "comparar_baseline",
      "curva_s",
    ].includes(toolName)
  )
    return "cronograma" as const;
  return "ganttLob" as const;
}

function specialistTools(
  definition: SpecialistDefinition,
  catalog: ConstructionMcpToolCatalog
): LlmTool[] {
  const all = [...catalog.eap, ...catalog.cronograma, ...catalog.ganttLob];
  const available = new Map(all.map(tool => [tool.name, tool]));
  return definition.tools
    .filter(name => MCP_TOOL_POLICY.readOnly.has(name) && available.has(name))
    .map(name => {
      const tool = available.get(name)!;
      return {
        type: "function" as const,
        function: {
          name,
          description: `${tool.description ?? "Consulta técnica"} Somente leitura. Não altera a obra.`,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      };
    });
}

function contextSummary(context: AgentProjectContext) {
  return [
    `Obra: ${context.project.code} — ${context.project.name}`,
    `Local: ${context.project.location}`,
    `Status: ${context.project.status}`,
    `Avanço: ${context.project.progress}%`,
    `Planejamento: ${new Date(context.project.plannedStart).toISOString().slice(0, 10)} a ${new Date(context.project.plannedFinish).toISOString().slice(0, 10)}`,
  ].join("\n");
}

async function runSpecialist(
  definition: SpecialistDefinition,
  context: AgentProjectContext,
  catalog: ConstructionMcpToolCatalog,
  projectIds: Partial<Record<"eap" | "cronograma" | "ganttLob", string>>,
  callLlm: (input: { messages: LlmMessage[]; tools: LlmTool[] }) => Promise<LlmResponse>,
  maxIterations: number
) {
  const tools = specialistTools(definition, catalog);
  if (!tools.length) {
    return { specialist: definition.id, name: definition.name, status: "indisponivel", report: "Nenhuma ferramenta da especialidade está disponível." };
  }

  const system = [
    `Você é o ${definition.name} da equipe do Arquimedes.`,
    definition.mission,
    "Você trabalha como especialista interno. Não conversa diretamente com o usuário.",
    "Use somente as ferramentas de consulta disponibilizadas. Nunca invente dados e nunca altere a obra.",
    "Faça as consultas necessárias e entregue um relatório objetivo ao Arquimedes.",
    "Separe achados confirmados, hipóteses e dados indisponíveis.",
    "Se não houver problema, diga explicitamente que não encontrou evidência de problema nas verificações realizadas.",
    contextSummary(context),
  ].join("\n\n");

  const messages: LlmMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content:
        "Analise a obra agora. Procure especificamente aquilo que um engenheiro pode deixar passar e que sua especialidade consegue detectar.",
    },
  ];

  const result = await runReActAgent({
    messages,
    tools,
    maxIterations,
    allowedTools: new Set(tools.map(tool => tool.function.name)),
    callModel: callLlm,
    executeTool: async (toolName, args) => {
      try {
        const domain = domainForTool(toolName);
        const projectId = projectIds[domain];
        if (!projectId) {
          return { ok: false, error: `project_id não disponível para ${domain}.`, content: "" };
        }
        const finalArgs = { ...args, project_id: projectId };
        const result = await callReadOnlyMcpTool(domain, toolName, finalArgs);
        return { ok: true, content: JSON.stringify(result).slice(0, 12000) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          content: "",
        };
      }
    },
  });

  return {
    specialist: definition.id,
    name: definition.name,
    status: "concluido",
    report: result.text,
    iterations: result.iterations,
  };
}

export async function runEngineeringTeam(
  context: AgentProjectContext,
  catalog: ConstructionMcpToolCatalog,
  projectIds: Partial<Record<"eap" | "cronograma" | "ganttLob", string>>,
  focus: string,
  deps?: {
    callLlm?: (input: { messages: LlmMessage[]; tools: LlmTool[] }) => Promise<LlmResponse>;
    onSpecialistEvent?: (event: {
      type: "started" | "finished";
      specialist: SpecialistId;
      name: string;
      status?: string;
    }) => void | Promise<void>;
  }
) {
  const requested = focus === "geral"
    ? SPECIALISTS
    : SPECIALISTS.filter(s =>
        focus === "eap" ? ["eap", "auditor"].includes(s.id) :
        focus === "cronograma" ? ["cronograma", "auditor"].includes(s.id) :
        focus === "producao" || focus === "lob" ? ["producao", "auditor"].includes(s.id) :
        true
      );

  const callLlm = deps?.callLlm ?? (input => invokeLlmGateway(input));
  const results = await Promise.all(
    requested.map(async specialist => {
      await deps?.onSpecialistEvent?.({
        type: "started",
        specialist: specialist.id,
        name: specialist.name,
      });
      try {
        const result = await runSpecialist(
          specialist,
          context,
          catalog,
          projectIds,
          callLlm,
          3
        );
        await deps?.onSpecialistEvent?.({
          type: "finished",
          specialist: specialist.id,
          name: specialist.name,
          status: result.status,
        });
        return result;
      } catch (error) {
        await deps?.onSpecialistEvent?.({
          type: "finished",
          specialist: specialist.id,
          name: specialist.name,
          status: "erro",
        });
        return {
          specialist: specialist.id,
          name: specialist.name,
          status: "erro",
          report: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );

  return {
    obra: context.project.code,
    foco: focus,
    equipe: results,
    regra: "Especialistas somente consultam. Arquimedes consolida os achados e qualquer alteração continua sujeita à confirmação explícita do engenheiro.",
  };
}
