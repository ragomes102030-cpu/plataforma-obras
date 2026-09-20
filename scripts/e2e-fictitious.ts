import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  createConstructionMcpClients,
  getConstructionMcpStatus,
  runConstructionMcpHomologation,
} from "../server/integrations/construction-mcps";
import { buildPhase7ImportPlan } from "../server/integrations/phase7-import";
import { runProjectOrchestrator } from "../server/orchestrator";
import type { AgentProjectContext } from "../server/agent";

const externalProjectIds = {
  eap: `e2e-ficticia-${Date.now()}-eap`,
  cronograma: `e2e-ficticia-${Date.now()}-cronograma`,
  ganttLob: `e2e-ficticia-${Date.now()}-gantt-lob`,
} as const;

const eap = {
  raizes: [
    {
      eap_id: "1",
      uid: "e2e-root",
      nivel: 1,
      nome: "Residencial Aurora — obra fictícia E2E",
      filhos: [
        {
          eap_id: "1.1",
          uid: "e2e-1-1",
          parent_id: "1",
          nivel: 2,
          nome: "Fundação",
          unidade: "m³",
          quantidade: 180,
          filhos: [],
        },
        {
          eap_id: "1.2",
          uid: "e2e-1-2",
          parent_id: "1",
          nivel: 2,
          nome: "Estrutura dos pavimentos",
          unidade: "m²",
          quantidade: 2400,
          filhos: [],
        },
        {
          eap_id: "1.3",
          uid: "e2e-1-3",
          parent_id: "1",
          nivel: 2,
          nome: "Alvenaria por pavimento",
          unidade: "m²",
          quantidade: 3200,
          filhos: [],
        },
      ],
    },
  ],
};

const activities = {
  atividades: [
    {
      id: "e2e-atv-1",
      eap_ref: "1.1",
      nome: "Executar fundações",
      duracao_dias: 20,
      percentual_concluido: 0,
      data_inicio_planejada: "2026-10-01",
      critica: 1,
    },
    {
      id: "e2e-atv-2",
      eap_ref: "1.2",
      nome: "Executar estrutura dos pavimentos",
      duracao_dias: 45,
      percentual_concluido: 0,
      data_inicio_planejada: "2026-10-21",
      critica: 1,
    },
    {
      id: "e2e-atv-3",
      eap_ref: "1.3",
      nome: "Executar alvenaria por pavimento",
      duracao_dias: 35,
      percentual_concluido: 0,
      data_inicio_planejada: "2026-12-05",
      critica: 0,
    },
  ],
};

const dependencies = {
  dependencias: [
    {
      id: "e2e-dep-1",
      predecessora_id: "e2e-atv-1",
      sucessora_id: "e2e-atv-2",
      tipo: "TI",
      lag_dias: 0,
    },
    {
      id: "e2e-dep-2",
      predecessora_id: "e2e-atv-2",
      sucessora_id: "e2e-atv-3",
      tipo: "TI",
      lag_dias: 0,
    },
  ],
};

const cpm = {
  caminho_critico: ["e2e-atv-1", "e2e-atv-2"],
  duracao_total_dias: 65,
};

const lob = {
  aplicavel: true,
  unidade_repetitiva: "pavimento",
  ritmo_dias_por_unidade: 2,
  interferencias: [],
};

function result(structuredContent: unknown) {
  return { structuredContent };
}

async function main() {
  const startedAt = new Date().toISOString();
  const report: Record<string, unknown> = {
    startedAt,
    readOnly: true,
    externalProjectIds,
    liveMcp: null,
    localFlow: null,
    agentFlow: null,
  };

  const liveStatus = await getConstructionMcpStatus(
    `e2e-status-${randomUUID()}`
  );
  const liveHomologation = await runConstructionMcpHomologation(
    externalProjectIds,
    `e2e-homologation-${randomUUID()}`
  );
  report.liveMcp = { status: liveStatus, homologation: liveHomologation };

  const importPlan = buildPhase7ImportPlan(
    externalProjectIds.cronograma,
    result(eap),
    result(activities),
    result(dependencies),
    result(cpm)
  );

  let invalidReferenceRejected = false;
  try {
    buildPhase7ImportPlan(
      externalProjectIds.cronograma,
      result(eap),
      result({ atividades: [{ ...activities.atividades[0], eap_ref: "9.9" }] }),
      result(dependencies),
      result(cpm)
    );
  } catch (error) {
    invalidReferenceRejected = String(error).includes(
      "referencia EAP inexistente"
    );
  }
  if (!invalidReferenceRejected) {
    throw new Error(
      "A auditoria não rejeitou atividade com referência EAP inexistente."
    );
  }

  const context: AgentProjectContext = {
    project: {
      code: "E2E-AURORA",
      name: "Residencial Aurora — obra fictícia",
      location: "São Paulo, SP",
      status: "Planejamento",
      progress: 0,
      plannedStart: "2026-10-01",
      plannedFinish: "2027-02-28",
    },
    activities: importPlan.activities.map(activity => ({
      wbsCode: activity.wbsCode,
      name: activity.name,
      phase: activity.phase,
      startOffset: activity.startOffset,
      durationDays: activity.durationDays,
      progress: activity.progress,
      status: "Não iniciado",
      critical: activity.critical,
    })),
    workspace: { activeSection: "eap", contextMode: "focused" },
    coordinator: {
      stage: "EAP_REVISAO",
      blockerCount: 0,
      lastSummary: "Fixture aguardando revisão do cliente.",
      approvedDecisions: [],
      openFindings: [],
      approvedMemories: [
        {
          category: "metodo_construtivo",
          key: "unidade_repetitiva",
          value: "pavimento",
          sourceType: "fixture_e2e",
          sourceRef: "E2E-AURORA",
          confidence: "high",
        },
      ],
    },
  };

  const catalog = {
    eap: [
      {
        name: "get_eap_tree",
        description: "Consulta EAP",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "validar_estrutura",
        description: "Valida EAP",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    cronograma: [
      {
        name: "listar_atividades",
        description: "Lista atividades",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "listar_dependencias",
        description: "Lista dependências",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "calcular_caminho_critico",
        description: "Calcula CPM",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    ganttLob: [
      {
        name: "calcular_linha_balanco",
        description: "Calcula LOB",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
  const requestedTools: string[] = [];
  const llmCalls: number[] = [];
  const agentResult = await runProjectOrchestrator(
    context,
    [
      {
        role: "user",
        content:
          "Revise a EAP da obra fictícia e procure inconsistências antes de liberar atividades.",
      },
    ],
    {
      mcpProjectIds: externalProjectIds,
      deps: {
        listTools: async () => catalog,
        callTool: async (_domain, toolName, args) => {
          requestedTools.push(`${toolName}:${JSON.stringify(args)}`);
          const payload =
            toolName === "get_eap_tree"
              ? eap
              : toolName === "validar_estrutura"
                ? { problemas: [], avisos: [] }
                : toolName === "listar_atividades"
                  ? activities
                  : toolName === "listar_dependencias"
                    ? dependencies
                    : toolName === "calcular_caminho_critico"
                      ? cpm
                      : lob;
          return { structuredContent: payload };
        },
        callLlm: async ({ messages }) => {
          llmCalls.push(messages.length);
          if (llmCalls.length === 1) {
            return {
              model: "e2e-deterministic-agent",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "e2e-call-1",
                        type: "function",
                        function: { name: "get_eap_tree", arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
            };
          }
          return {
            model: "e2e-deterministic-agent",
            choices: [
              {
                message: {
                  role: "assistant",
                  content:
                    "MARCO ATUAL\nEAP em revisão.\n\nEVIDÊNCIAS CONSULTADAS\nEAP, validação estrutural e memória da obra.\n\nPROPOSTA\nManter a decomposição por fundação, estrutura e alvenaria por pavimento.\n\nEXEMPLOS/REFERÊNCIAS\nNós da EAP e unidade repetitiva registrada.\n\nDIVERGÊNCIAS E LACUNAS\nNenhuma bloqueadora encontrada.\n\nIMPACTO DE APROVAR\nA próxima etapa poderá derivar atividades sem executar gravações.\n\nPRÓXIMA DECISÃO DO CLIENTE\nVocê deseja aprovar a EAP ou indicar nós para revisão?",
                },
              },
            ],
          };
        },
      },
    }
  );

  report.localFlow = {
    eapNodes: importPlan.wbsNodes.length,
    activities: importPlan.activities.length,
    dependencies: dependencies.dependencias.length,
    criticalPath: importPlan.criticalPath,
    totalDurationDays: importPlan.totalDurationDays,
    lob,
    invalidReferenceRejected,
  };
  report.agentFlow = {
    model: agentResult.model,
    iterations: agentResult.iterations,
    requestedTools,
    llmCalls,
    readOnly: agentResult.readOnly,
    audit: agentResult.audit,
    content: agentResult.content,
  };

  const outputPath = "/home/ubuntu/plataforma-obras/e2e-fictitious-report.json";
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ outputPath, report }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
