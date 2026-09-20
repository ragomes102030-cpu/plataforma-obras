import { writeFile } from "node:fs/promises";
import {
  runProjectOrchestrator,
  validateReadonlyResponse,
} from "../server/orchestrator";
import type { AgentProjectContext } from "../server/agent";

const projectId = "fase1-aurora-readonly";
const outputPath =
  "/home/ubuntu/plataforma-obras/phase1-readonly-battery-report.json";

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
  activities: [
    {
      wbsCode: "1.1",
      name: "Executar fundações",
      phase: "Fundação",
      startOffset: 0,
      durationDays: 20,
      progress: 0,
      status: "Não iniciado",
      critical: true,
    },
    {
      wbsCode: "1.2",
      name: "Executar estrutura dos pavimentos",
      phase: "Estrutura",
      startOffset: 20,
      durationDays: 45,
      progress: 0,
      status: "Não iniciado",
      critical: true,
    },
    {
      wbsCode: "1.3",
      name: "Executar alvenaria por pavimento",
      phase: "Alvenaria",
      startOffset: 65,
      durationDays: 35,
      progress: 0,
      status: "Não iniciado",
      critical: false,
    },
  ],
  workspace: { activeSection: "eap", contextMode: "focused" },
  coordinator: {
    stage: "EAP_REVISAO",
    blockerCount: 0,
    lastSummary: "Fixture aguardando revisão do cliente.",
    approvedDecisions: [],
    openFindings: [],
    approvedMemories: [],
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
      name: "validar_dependencias",
      description: "Valida dependências",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "calcular_caminho_critico",
      description: "Calcula CPM",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "listar_baselines",
      description: "Lista baselines",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "comparar_baseline",
      description: "Compara baseline",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  ganttLob: [
    {
      name: "listar_temas",
      description: "Lista temas de Gantt",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "calcular_linha_balanco",
      description: "Calcula LOB",
      inputSchema: { type: "object", properties: {} },
    },
  ],
};

type BatteryCase = {
  id: string;
  question: string;
  calls: Array<{ domain: "eap" | "cronograma" | "ganttLob"; toolName: string }>;
  response: string;
};

const response = (
  marco: string,
  evidence: string,
  proposal: string,
  references: string,
  gaps: string,
  impact: string,
  decision: string
) =>
  [
    `MARCO ATUAL\n${marco}`,
    `EVIDÊNCIAS CONSULTADAS\n${evidence}`,
    `PROPOSTA\n${proposal}`,
    `EXEMPLOS/REFERÊNCIAS\n${references}`,
    `DIVERGÊNCIAS E LACUNAS\n${gaps}`,
    `IMPACTO DE APROVAR\n${impact}`,
    `PRÓXIMA DECISÃO DO CLIENTE\n${decision}`,
  ].join("\n\n");

const cases: BatteryCase[] = [
  {
    id: "p1-eap-estrutura",
    question:
      "Revise a EAP e procure problemas estruturais antes de derivar atividades.",
    calls: [
      { domain: "eap", toolName: "get_eap_tree" },
      { domain: "eap", toolName: "validar_estrutura" },
    ],
    response: response(
      "MARCO 2 — EAP em revisão.",
      "EAP_ID=1 com folhas 1.1 Fundação, 1.2 Estrutura e 1.3 Alvenaria; validação estrutural sem problemas.",
      "Manter a decomposição e revisar unidades/quantidades antes da aprovação.",
      "EAP_ID/UID dos nós consultados no MCP EAP.",
      "Nenhum problema estrutural bloqueador; quantidades ainda precisam de confirmação.",
      "Aprovar permite derivar atividades, mas não executa nenhuma gravação.",
      "Você aprova esta leitura da EAP ou indica EAP_IDs para revisão?"
    ),
  },
  {
    id: "p1-atividades-dependencias",
    question: "Quais atividades e dependências devem ser conferidas primeiro?",
    calls: [
      { domain: "cronograma", toolName: "listar_atividades" },
      { domain: "cronograma", toolName: "listar_dependencias" },
      { domain: "cronograma", toolName: "validar_dependencias" },
    ],
    response: response(
      "MARCO 3 — atividades e sequência.",
      "Atividades eap_ref=1.1, 1.2 e 1.3; dependências TI entre fundação, estrutura e alvenaria.",
      "Conferir as três referências EAP e validar a sequência construtiva antes de discutir datas.",
      "Atividade e dependência identificadas por ID no cronograma.",
      "Não há ciclo na fixture; recursos e produtividade não estão informados.",
      "Aprovar a sequência permite calcular CPM, sem criar ou alterar atividades.",
      "Você aprova esta sequência para calcular o caminho crítico?"
    ),
  },
  {
    id: "p1-cpm",
    question: "Calcule o caminho crítico e explique as folgas disponíveis.",
    calls: [
      { domain: "cronograma", toolName: "calcular_caminho_critico" },
      { domain: "cronograma", toolName: "listar_dependencias" },
    ],
    response: response(
      "MARCO 4 — rede CPM.",
      "Caminho crítico indicado por e2e-atv-1 e e2e-atv-2; duração acumulada de 65 dias na fixture.",
      "Tratar fundações e estrutura como sequência crítica até confirmação de folgas.",
      "CPM do cronograma e dependências TI consultadas.",
      "Folgas detalhadas e calendários de trabalho não estão disponíveis nesta fixture.",
      "Aprovar orienta prioridade de controle, mas não altera a rede.",
      "Você aprova esta leitura do caminho crítico ou informa outro calendário?"
    ),
  },
  {
    id: "p1-baseline",
    question:
      "Compare a baseline e diga se existe desvio que possa ser tratado como fato.",
    calls: [
      { domain: "cronograma", toolName: "listar_baselines" },
      { domain: "cronograma", toolName: "comparar_baseline" },
    ],
    response: response(
      "MARCO 5 — baseline e cronograma.",
      "Consulta de baselines e comparação retornam ausência de baseline aprovada na fixture.",
      "Não declarar desvio como fato; preparar uma proposta de baseline somente após aprovação explícita.",
      "Baseline e cronograma do domínio cronograma.",
      "Não há baseline aprovada nem medição real para comparação.",
      "Aprovar apenas a leitura mantém a baseline inexistente e não salva nada.",
      "Você confirma que não há baseline aprovada ou deseja revisar o escopo?"
    ),
  },
  {
    id: "p1-lob",
    question:
      "A Linha de Balanço é aplicável a esta obra e quais dados faltam?",
    calls: [
      { domain: "ganttLob", toolName: "calcular_linha_balanco" },
      { domain: "ganttLob", toolName: "listar_temas" },
    ],
    response: response(
      "MARCO 6 — Gantt/LOB e produção.",
      "Fixture informa pavimento como unidade repetitiva, mas não informa ritmo observado, equipes ou produtividade real.",
      "Usar LOB apenas como recomendação preliminar, condicionada a ritmo e equipes confirmados.",
      "Linha de Balanço e Gantt do domínio ganttLob.",
      "Produtividade, disponibilidade de equipes e interferências reais são lacunas.",
      "Aprovar permite revisar a hipótese, não dimensiona equipes nem grava produção.",
      "Você deseja confirmar a unidade repetitiva ou fornecer ritmo e equipes para nova leitura?"
    ),
  },
  {
    id: "p1-dados-incompletos",
    question: "O que ainda impede uma decisão técnica sem inventar dados?",
    calls: [{ domain: "cronograma", toolName: "listar_atividades" }],
    response: response(
      "MARCO 3 — auditoria de dados.",
      "Atividades locais sem progresso real, recursos, calendário e medição de produção confirmados.",
      "Registrar as lacunas como pendências de confirmação, sem preencher valores por inferência.",
      "Atividades locais e memória aprovada da obra.",
      "Duração real, produtividade, custo, equipes e baseline aprovada estão ausentes.",
      "Aprovar apenas o diagnóstico não libera CPM, baseline ou produção.",
      "Você confirma estas lacunas ou indica qual fonte deve ser consultada primeiro?"
    ),
  },
];

function payloadFor(toolName: string) {
  return {
    ferramenta: toolName,
    somente_leitura: true,
    dados: {
      projeto: projectId,
      fonte:
        toolName.includes("eap") || toolName.includes("estrutura")
          ? "EAP"
          : "cronograma/ganttLob",
    },
  };
}

async function runCase(testCase: BatteryCase) {
  const requestedTools: string[] = [];
  let llmCall = 0;
  const result = await runProjectOrchestrator(
    context,
    [{ role: "user", content: testCase.question }],
    {
      mcpProjectIds: {
        eap: projectId,
        cronograma: projectId,
        ganttLob: projectId,
      },
      taskId: testCase.id,
      deps: {
        listTools: async () => catalog,
        callTool: async (domain, toolName, args) => {
          requestedTools.push(`${domain}.${toolName}`);
          if (args.project_id !== projectId) {
            throw new Error(`project_id incorreto para ${domain}`);
          }
          return { structuredContent: payloadFor(toolName) };
        },
        callLlm: async () => {
          const call = testCase.calls[llmCall++];
          if (call) {
            return {
              model: "phase1-deterministic-agent",
              provider: "simulated-provider",
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: `${testCase.id}-${llmCall}`,
                        type: "function",
                        function: { name: call.toolName, arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
            };
          }
          return {
            model: "phase1-deterministic-agent",
            provider: "simulated-provider",
            choices: [
              { message: { role: "assistant", content: testCase.response } },
            ],
          };
        },
      },
    }
  );
  validateReadonlyResponse(result.content);
  const expectedTools = testCase.calls.map(
    call => `${call.domain}.${call.toolName}`
  );
  if (JSON.stringify(requestedTools) !== JSON.stringify(expectedTools)) {
    throw new Error(
      `${testCase.id}: ferramentas inesperadas: ${requestedTools.join(", ")}; esperado ${expectedTools.join(", ")}`
    );
  }
  if (!result.readOnly || result.status !== "respondido") {
    throw new Error(
      `${testCase.id}: execução não terminou como leitura respondida.`
    );
  }
  if (result.audit.some(event => event.status !== "success")) {
    throw new Error(`${testCase.id}: houve evento MCP não sucedido.`);
  }
  return {
    id: testCase.id,
    status: result.status,
    model: result.model,
    provider: result.provider,
    iterations: result.iterations,
    tools: requestedTools,
    audit: result.audit,
    hasSources: result.content.includes("Fontes:"),
    hasGaps: result.content.includes("DIVERGÊNCIAS E LACUNAS"),
    readOnly: result.readOnly,
    content: result.content,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const results = [];
  for (const testCase of cases) results.push(await runCase(testCase));
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: "simulated-provider-and-mcp",
    readOnly: true,
    caseCount: results.length,
    cases: results,
    allPassed:
      results.length === cases.length &&
      results.every(item => item.readOnly && item.hasSources && item.hasGaps),
    note: "Nenhuma chamada externa foi realizada; este relatório prova o contrato e o loop de leitura determinístico.",
  };
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      { outputPath, caseCount: results.length, allPassed: report.allPassed },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
