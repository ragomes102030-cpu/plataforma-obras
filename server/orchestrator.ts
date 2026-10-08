import { ENV } from "./_core/env";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { projectAuditEvents, projectPlanVersions, scheduleActivities, wbsNodes } from "../drizzle/schema";
import { validateEap } from "./construction/eap-validator";
import { ensureWritablePlanVersion } from "./construction/plan-versions";
import { resolveActivityDuration } from "./construction/activity-planning";
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
import { localDatabaseEvidenceSource } from "./construction/local-database-source";
import { buildArquimedesMemoryContext, recallArquimedes, rememberArquimedes, rememberArquimedesLearning, rememberArquimedesConversation } from "./agent/memory";
import { loadArquimedesBrainBootstrap } from "./agent/core/brain-context";
import { calculateActivityDuration, validateDependencyNetwork, analyzeEapLocally, calculateCpmLocally } from "./agent/core/engineering-capabilities";

const MAX_ITERATIONS = 8;
const MAX_TOOL_RESULT_CHARS = 8_000;
const MAX_MESSAGES = 20;
const MAX_USER_MESSAGE_CHARS = 6_000;
const MAX_ASSISTANT_MESSAGE_CHARS = 12_000;
// Keep every provider message below the common 12k hard limit, including
// the system prompt and accumulated tool results.
const MAX_LLM_MESSAGE_CHARS = 11_000;

function compactLlmContent(content: string, maxChars = MAX_LLM_MESSAGE_CHARS) {
  if (content.length <= maxChars) return content;
  const head = Math.floor(maxChars * 0.68);
  const tail = maxChars - head;
  return [
    content.slice(0, head),
    "",
    "[...conteúdo intermediário compactado pelo orquestrador...]",
    "",
    content.slice(-tail),
  ].join("\n");
}

const TOOL_DOMAINS = {
  get_eap_tree: "eap",
  get_eap_node: "eap",
  listar_por_tipo_frente: "eap",
  buscar_eap_node: "eap",
  validar_estrutura: "eap",
  pacotes_sem_dono: "eap",
  resumo_quantitativos: "eap",
  listar_templates: "eap",
  listar_projetos: "eap",
  listar_escopo: "eap",
  validar_regra_100_porcento: "eap",
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
  criar_projeto: "eap",
  criar_eap_node: "eap",
  atualizar_eap_node: "eap",
  move_eap_node: "eap",
  deletar_eap_node: "eap",
  registrar_retrabalho: "eap",
  criar_atividade: "cronograma",
  atualizar_atividade: "cronograma",
  criar_dependencia: "cronograma",
  deletar_atividade: "cronograma",
  deletar_dependencia: "cronograma",
  salvar_baseline: "cronograma",
  gerar_gantt: "ganttLob",
  atualizar_projeto: "eap",
  definir_criterio: "eap",
  deletar_projeto: "eap",
  criar_item_escopo: "eap",
  vincular_escopo_eap: "eap",
  desvincular_escopo_eap: "eap",
} as const;

const PROJECT_SCOPED_TOOLS = new Set([
  "get_eap_tree",
  "get_eap_node",
  "listar_por_tipo_frente",
  "buscar_eap_node",
  "validar_estrutura",
  "pacotes_sem_dono",
  "resumo_quantitativos",
  "listar_escopo",
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
  readOnly: boolean;
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
  localProjectId?: number;
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
        context.evidence.localEap
          ? [
              `EAP local: folhas=${context.evidence.localEap.leafCount}; folhas com dicionário completo=${context.evidence.localEap.leavesWithDictionary}; folhas sem dicionário completo=${context.evidence.localEap.leavesWithoutDictionary}; folhas com unidade+quantidade=${context.evidence.localEap.leavesWithQuantity}; folhas sem unidade+quantidade=${context.evidence.localEap.leavesWithoutQuantity}; validação estrutural local=${context.evidence.localEap.structureValidation.status} (${context.evidence.localEap.structureValidation.issueCount} apontamento(s))`,
            ].join("\n")
          : "Resumo detalhado da EAP local: indisponível.",
        context.evidence.localBudget
          ? context.evidence.localBudget.versionId
            ? `Orçamento local: versão=${context.evidence.localBudget.versionId}; status=${context.evidence.localBudget.versionStatus ?? "não informado"}; itens=${context.evidence.localBudget.itemCount ?? "não informado"}; itens vinculados à EAP=${context.evidence.localBudget.mappedItemCount ?? "não informado"}; itens sem vínculo=${context.evidence.localBudget.unmappedItemCount ?? "não informado"}`
            : "Orçamento local: nenhuma versão de orçamento registrada para esta obra."
          : "Resumo do orçamento local: indisponível.",
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
      "Consulta evidências técnicas adicionais de forma direcionada. Não faça uma varredura fixa por categoria. Escolha apenas as consultas read-only necessárias para reduzir uma lacuna identificada nas evidências já disponíveis. Você pode solicitar de 1 a 6 consultas complementares por rodada. Não repita consultas já suficientes e não consulte uma ferramenta apenas porque ela pertence a uma categoria existente.",
    parameters: {
      type: "object",
      properties: {
        checks: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          uniqueItems: true,
          items: {
            type: "string",
            enum: [
              "get_eap_tree",
              "validar_estrutura",
              "pacotes_sem_dono",
              "resumo_quantitativos",
              "listar_atividades",
              "listar_dependencias",
              "validar_dependencias",
              "calcular_caminho_critico",
              "listar_baselines",
              "comparar_baseline",
              "listar_temas",
              "calcular_linha_balanco",
              "balancear_ritmos_lob",
              "dimensionar_equipes_lob"
            ]
          },
          description: "Consultas read-only que respondem diretamente às lacunas observadas. Escolha somente as necessárias."
        },
        focus: {
          type: "string",
          enum: ["geral", "eap", "cronograma", "producao", "lob"],
          description: "Compatibilidade com solicitações legadas; use somente quando checks não estiver presente."
        }
      },
      additionalProperties: false
    }
  }
};

const MEMORY_RECALL_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "consultar_memoria",
    description:
      "Consulta a memória persistente do Arquimedes para recuperar fatos, decisões, propostas, pendências e aprendizados anteriores. Use quando a continuidade da análise depender de algo que não está no contexto atual. Memória é evidência contextual, não autorização para alterar a obra.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 180 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const LEARNING_WRITE_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "registrar_aprendizado",
    description:
      "Registra um aprendizado candidato no cérebro do Arquimedes. Use quando uma falha, QA, revisão ou evidência produzir uma regra potencialmente reutilizável. O registro nasce como candidate/proposed e nunca altera silenciosamente regras globais.",
    parameters: {
      type: "object",
      properties: {
        learningKey: { type: "string", minLength: 1, maxLength: 180 },
        problem: { type: "string", minLength: 1, maxLength: 1200 },
        evidence: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", maxLength: 1200 } },
        rule: { type: "string", minLength: 1, maxLength: 1600 },
        regressionTest: { type: "string", maxLength: 300 },
        scope: { type: "string", enum: ["project", "library"] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        sourceRef: { type: "string", maxLength: 180 },
      },
      required: ["learningKey", "problem", "evidence", "rule"],
      additionalProperties: false,
    },
  },
};

const MEMORY_WRITE_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "registrar_memoria",
    description:
      "Registra uma memória durável e estruturada do Arquimedes. Use somente para fatos confirmados, decisões do engenheiro, propostas relevantes, pendências ou conclusões úteis para rodadas futuras. Nunca registre uma hipótese como fato. A memória não altera a EAP, cronograma, orçamento ou qualquer dado operacional.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", minLength: 1, maxLength: 80 },
        memoryKey: { type: "string", minLength: 1, maxLength: 180 },
        value: {},
        sourceType: {
          type: "string",
          enum: ["engenheiro", "obra", "documento", "mcp", "pesquisa_externa", "arquimedes", "sistema"],
        },
        sourceRef: { type: "string", maxLength: 180 },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: ["category", "memoryKey", "value", "sourceType"],
      additionalProperties: false,
    },
  },
};

const LOCAL_EAP_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "consultar_eap_local",
    description:
      "Consulta diretamente a EAP local da obra, sem depender de serviço externo. Use quando houver contagens da EAP mas faltar leitura semântica da árvore, dos pacotes ou das folhas. Faça consultas direcionadas por códigos, termo, pai ou folhas; não altere dados.",
    parameters: {
      type: "object",
      properties: {
        refs: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: { type: "string" },
          description: "Códigos ou identificadores exatos de nós que precisam ser inspecionados."
        },
        search: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "Termo para procurar em código, nome e campos textuais da EAP."
        },
        parentCode: {
          type: "string",
          maxLength: 80,
          description: "Retorna os nós filhos diretos deste código."
        },
        leafOnly: {
          type: "boolean",
          description: "Quando verdadeiro, retorna somente nós terminais."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Máximo de nós retornados."
        },
        field: {
          type: "string",
          enum: [
            "description",
            "inclusions",
            "exclusions",
            "location",
            "responsible",
            "acceptanceCriteria",
            "scopeStatus",
            "decompositionBasis",
            "unit",
            "plannedQuantity"
          ],
          description: "Campo específico para filtrar nós preenchidos ou não preenchidos."
        },
        fieldState: {
          type: "string",
          enum: ["filled", "missing"],
          description: "Quando field for informado, filtra pelo estado desse campo."
        },
        includeCoverage: {
          type: "boolean",
          description: "Retorna cobertura agregada dos principais campos em todos os nós e em todas as folhas."
        }
      },
      additionalProperties: false
    }
  }
};

const LOCAL_ACTIVITY_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "criar_atividade_local",
    description:
      "Cria uma atividade diretamente na fonte local da obra quando o MCP de cronograma/EAP não consegue resolver o contexto externo. Use somente em uma ordem operacional explícita. Exige eapRef de uma folha terminal da EAP aprovada, nome e duração. A operação é verificada após a gravação.",
    parameters: {
      type: "object",
      properties: {
        eapRef: { type: "string", minLength: 1, maxLength: 80 },
        name: { type: "string", minLength: 2, maxLength: 220 },
        durationDays: { type: "integer", minimum: 1 },
        plannedQuantity: { type: "number", exclusiveMinimum: 0 },
        unit: { type: "string", minLength: 1, maxLength: 16 },
        productivity: { type: "number", exclusiveMinimum: 0 },
        productivityUnit: { type: "string", minLength: 1, maxLength: 32 },
        source: { type: "string", maxLength: 500 },
      },
      required: ["eapRef", "name"],
      additionalProperties: false,
    },
  },
};

const INTERNAL_EAP_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "analisar_eap_localmente",
    description: "Analisa estruturalmente a EAP diretamente no motor interno do Arquimedes, sem depender de MCP. Use com dados da EAP local para detectar raiz, níveis, órfãos, códigos, duplicidades e ciclos.",
    parameters: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          minItems: 0,
          items: {
            type: "object",
            properties: {
              id: { type: ["string","number"] },
              projectId: { type: ["string","number"] },
              parentId: { type: ["string","number","null"] },
              code: { type: "string" },
              name: { type: "string" },
              level: { type: "integer" },
              nodeType: { type: "string" },
              unit: { type: ["string","null"] },
              plannedQuantity: { type: ["number","null"] }
            },
            required: ["id","code","name","level","nodeType"],
            additionalProperties: true
          }
        }
      },
      required: ["nodes"],
      additionalProperties: false
    }
  }
};

const INTERNAL_CPM_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "calcular_cpm_localmente",
    description: "Calcula CPM deterministicamente no motor interno do Arquimedes, sem depender de MCP. Valida a rede antes do cálculo e retorna duração do projeto, folgas, criticidade e conflitos de restrição.",
    parameters: {
      type: "object",
      properties: {
        activities: {
          type: "array",
          items: { type: "object", properties: {
            id: { type: ["string","number"] },
            durationDays: { type: "integer", minimum: 1 },
            mustStartOnDay: { type: ["integer","null"] },
            finishNoLaterThanDay: { type: ["integer","null"] }
          }, required: ["id","durationDays"], additionalProperties: true }
        },
        dependencies: {
          type: "array",
          items: { type: "object", properties: {
            predecessorId: { type: ["string","number"] },
            successorId: { type: ["string","number"] },
            type: { type: "string", enum: ["FS","SS","FF","SF"] },
            lag: { type: "integer" }
          }, required: ["predecessorId","successorId","type"], additionalProperties: true }
        }
      },
      required: ["activities","dependencies"], additionalProperties: false
    }
  }
};

const INTERNAL_ENGINEERING_TOOLS: LlmTool[] = [
  {
    type: "function",
    function: {
      name: "calcular_duracao_atividade",
      description: "Motor interno do Arquimedes para calcular duração sem depender de MCP. Aceita duração informada ou quantidade + produtividade compatíveis. Nunca inventa produtividade nem converte unidades sem regra validada.",
      parameters: {
        type: "object",
        properties: {
          durationDays: { type: "integer", minimum: 1 },
          plannedQuantity: { type: "number", exclusiveMinimum: 0 },
          productivity: { type: "number", exclusiveMinimum: 0 },
          quantityUnit: { type: "string" },
          productivityUnit: { type: "string" },
          source: { type: "string", maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "validar_rede_dependencias_local",
      description: "Valida no motor interno do Arquimedes se uma rede de dependências é acíclica. Esta validação não depende de MCP.",
      parameters: {
        type: "object",
        properties: {
          dependencies: {
            type: "array", minItems: 0,
            items: { type: "object", properties: { id: {type:"string"}, predecessor:{type:"string"}, successor:{type:"string"} }, required:["id","predecessor","successor"], additionalProperties:false }
          }
        },
        required: ["dependencies"], additionalProperties: false
      }
    }
  }
];
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

async function createLocalAgentActivity(args: {
  projectId: number;
  userId: number;
  rawArgs: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado.");

  const eapRef = String(args.rawArgs.eap_ref ?? args.rawArgs.eapRef ?? args.rawArgs.wbsCode ?? "").trim();
  const name = String(args.rawArgs.name ?? args.rawArgs.nome ?? "").trim();
  const durationInput = args.rawArgs.durationDays ?? args.rawArgs.duracao_dias ?? args.rawArgs.duration ?? args.rawArgs.duracao;
  const plannedQuantity = args.rawArgs.plannedQuantity == null ? undefined : Number(args.rawArgs.plannedQuantity);
  const unit = typeof args.rawArgs.unit === "string" ? args.rawArgs.unit.trim() : undefined;
  const productivity = args.rawArgs.productivity == null ? undefined : Number(args.rawArgs.productivity);
  const productivityUnit = typeof args.rawArgs.productivityUnit === "string" ? args.rawArgs.productivityUnit.trim() : undefined;
  const source = typeof args.rawArgs.source === "string" ? args.rawArgs.source.trim() : undefined;

  if (!eapRef) throw new Error("A atividade precisa de uma referência de EAP válida.");
  if (!name) throw new Error("A atividade precisa de um nome.");

  const hasDuration = durationInput != null && durationInput !== "";
  const hasProductionBasis = plannedQuantity !== undefined || productivity !== undefined;
  if (hasProductionBasis) {
    if (!(plannedQuantity !== undefined && plannedQuantity > 0)) {
      throw new Error("Quantidade planejada deve ser informada quando a atividade usar base de produtividade.");
    }
    if (!(productivity !== undefined && productivity > 0)) {
      throw new Error("Produtividade deve ser informada quando a atividade usar base de produtividade.");
    }
    if (!unit || !productivityUnit) {
      throw new Error("Quantidade e produtividade precisam informar suas unidades.");
    }
    const productivityBaseUnit = productivityUnit.toLowerCase().split("/")[0].trim();
    if (unit.toLowerCase() !== productivityBaseUnit) {
      throw new Error("Unidade do quantitativo incompatível com a unidade da produtividade.");
    }
  }
  const calculatedDuration = hasProductionBasis
    ? Math.max(1, Math.ceil((plannedQuantity as number) / (productivity as number)))
    : Number(durationInput);
  if (!Number.isInteger(calculatedDuration) || calculatedDuration < 1) {
    throw new Error("A atividade precisa de duração inteira maior ou igual a 1 dia, ou quantidade + produtividade válidas.");
  }
  const durationDays = calculatedDuration;

  const [approved] = await db
    .select({ id: projectPlanVersions.id })
    .from(projectPlanVersions)
    .where(and(eq(projectPlanVersions.projectId, args.projectId), eq(projectPlanVersions.status, "approved")))
    .orderBy(desc(projectPlanVersions.versionNumber))
    .limit(1);
  if (!approved) throw new Error("A EAP precisa estar aprovada antes de gerar atividades.");

  const [approvedNode] = await db
    .select()
    .from(wbsNodes)
    .where(and(
      eq(wbsNodes.projectId, args.projectId),
      eq(wbsNodes.versionId, approved.id),
      eq(wbsNodes.code, eapRef)
    ))
    .limit(1);

  if (!approvedNode) {
    throw new Error(`O código de EAP ${eapRef} não existe na EAP aprovada desta obra.`);
  }
  if (approvedNode.nodeType !== "entrega" && approvedNode.nodeType !== "pacote") {
    throw new Error(`O código de EAP ${eapRef} não é uma folha terminal e não pode originar atividade.`);
  }

  const resolvedDuration = resolveActivityDuration({ durationDays });
  const writable = await ensureWritablePlanVersion(args.projectId, args.userId);
  const [writableNode] = await db
    .select({ id: wbsNodes.id, code: wbsNodes.code, name: wbsNodes.name, sortOrder: wbsNodes.sortOrder })
    .from(wbsNodes)
    .where(and(
      eq(wbsNodes.projectId, args.projectId),
      eq(wbsNodes.versionId, writable.id),
      eq(wbsNodes.code, eapRef)
    ))
    .limit(1);
  if (!writableNode) throw new Error(`A referência de EAP ${eapRef} não foi encontrada na versão de trabalho.`);

  const [created] = await db
    .insert(scheduleActivities)
    .values({
      projectId: args.projectId,
      wbsNodeId: writableNode.id,
      wbsCode: writableNode.code,
      eapRef: writableNode.code,
      name,
      phase: eapRef.split(".").slice(0, 2).join(".") || "Execução",
      startOffset: 0,
      durationDays: Number(resolvedDuration),
      plannedQuantity: plannedQuantity ?? null,
      unit: unit ?? null,
      productivity: productivity ?? null,
      sortOrder: writableNode.sortOrder * 1000 + writableNode.id,
      versionId: writable.id,
      } as typeof scheduleActivities.$inferInsert)
    .returning({
      id: scheduleActivities.id,
      wbsCode: scheduleActivities.wbsCode,
      name: scheduleActivities.name,
      durationDays: scheduleActivities.durationDays,
      plannedQuantity: scheduleActivities.plannedQuantity,
      unit: scheduleActivities.unit,
      productivity: scheduleActivities.productivity,
      versionId: scheduleActivities.versionId,
    });

  const [verification] = await db
    .select({
      id: scheduleActivities.id,
      wbsCode: scheduleActivities.wbsCode,
      name: scheduleActivities.name,
      durationDays: scheduleActivities.durationDays,
      plannedQuantity: scheduleActivities.plannedQuantity,
      unit: scheduleActivities.unit,
      productivity: scheduleActivities.productivity,
      versionId: scheduleActivities.versionId,
    })
    .from(scheduleActivities)
    .where(and(
      eq(scheduleActivities.id, created.id),
      eq(scheduleActivities.projectId, args.projectId)
    ))
    .limit(1);

  const evidenceRecord = {
    activityId: created.id,
    projectId: args.projectId,
    eapRef: created.wbsCode,
    name: created.name,
    durationDays: Number(created.durationDays),
    plannedQuantity: created.plannedQuantity ?? null,
    unit: created.unit ?? null,
    productivity: created.productivity ?? null,
    productivityUnit: productivityUnit ?? null,
    durationMethod: hasProductionBasis ? "ceil(quantidade/produtividade)" : "engineer_informed",
    evidenceLevel: hasProductionBasis
      ? (source ? "source_supported" : "engineer_informed")
      : "engineer_informed",
    source: source ?? null,
    premise: hasProductionBasis
      ? "produtividade expressa na unidade do quantitativo por dia para a equipe considerada"
      : "duração informada pelo engenheiro/planejamento",
    approvedEapVersionId: approved.id,
    writableVersionId: writable.id,
    recordedAt: new Date().toISOString(),
  };

  try {
    await db.insert(projectAuditEvents).values({
      projectId: args.projectId,
      userId: args.userId,
      action: "activity_planning_evidence_recorded",
      payload: evidenceRecord,
    });
  } catch (auditError) {
    console.warn(JSON.stringify({
      evento: "activity_planning_evidence_audit_failed",
      projectId: args.projectId,
      activityId: created.id,
      erro: auditError instanceof Error ? auditError.message : String(auditError),
    }));
  }

  try {
    await rememberArquimedes({
      projectId: args.projectId,
      ownerUserId: args.userId,
      scope: "project",
      category: "activity_planning_evidence",
      memoryKey: `activity-evidence-${created.id}`,
      value: evidenceRecord,
      sourceType: "arquimedes",
      sourceRef: `schedule_activity:${created.id}`,
      confidence: source ? "high" : "medium",
    });
  } catch (memoryError) {
    console.warn(JSON.stringify({
      evento: "activity_planning_evidence_memory_failed",
      projectId: args.projectId,
      activityId: created.id,
      erro: memoryError instanceof Error ? memoryError.message : String(memoryError),
    }));
  }

  return {
    source: "local_db_fallback",
    created,
    verification,
    evidence: evidenceRecord,
    approvedEapVersionId: approved.id,
    writableVersionId: writable.id,
  };
}

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
  return [...tools, INTERNAL_EAP_TOOL, INTERNAL_CPM_TOOL, ...INTERNAL_ENGINEERING_TOOLS, ENGINEERING_TEAM_TOOL, ENGINEERING_GAP_TOOL, LOCAL_EAP_TOOL, MEMORY_RECALL_TOOL, MEMORY_WRITE_TOOL, LEARNING_WRITE_TOOL, LOCAL_ACTIVITY_TOOL, ...RUNTIME_TOOLS];
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
  responseIntent: "casual" | "consulta" | "analise" | "operacao",
  memoryContext = "Memória persistente não carregada.",
  brainBootstrap = "Bootstrap do cérebro não carregado."
) {
  const workspaceContext = context.workspace
    ? `Aba ativa: ${context.workspace.activeSection}${context.workspace.activeSubtab ? ` / ${context.workspace.activeSubtab}` : ""}.`
    : "Aba ativa não informada.";
  const now = currentDateTimeFortaleza();

  const base = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    "BOOTSTRAP DO CÉREBRO MESTRE:\n" + brainBootstrap,
    `Data e hora atuais fornecidas pelo runtime: ${now.human} (${now.iso}).`,
    "Use essa referência quando o usuário perguntar sobre data, dia ou hora atuais. Não diga que não possui relógio.",
    "Converse naturalmente com o usuário. Escolha o formato que melhor serve à pergunta. Não existe formato obrigatório de resposta.",
    "Responda diretamente ao que foi perguntado. Não despeje o contexto da obra, métricas ou diagnósticos que o usuário não pediu.",
    "Quando a pergunta puder ser respondida com o contexto disponível, responda sem chamar ferramentas só para preencher a conversa.",
    "Quando precisar de dados atuais ou mais completos, consulte as ferramentas disponíveis. Use ferramentas como instrumentos de consulta, não como roteiro rígido.",
    "Quando houver contagens locais da EAP, mas faltar leitura dos nomes, agrupamentos ou folhas, use consultar_eap_local antes de declarar o escopo ou a decomposição semântica como não verificáveis. Prefira consultas direcionadas e amostragem representativa; só peça muitos nós quando isso for realmente necessário para concluir a análise.",
    "Depois das consultas, interprete os resultados e responda com suas próprias palavras. Não descreva seu raciocínio interno e não revele detalhes de implementação do runtime.",
    "Para análises complexas, não conclua na primeira consulta: use os resultados para decidir quais ferramentas consultar em seguida, faça verificações cruzadas e só finalize quando houver evidência suficiente.",
    "Ao usar engineering_gap_analysis, escolha consultas específicas com base nas lacunas observadas naquele momento. Não faça uma varredura fixa por EAP, cronograma, produção ou LOB. Não repita uma consulta cujo resultado já seja suficiente. Cada nova rodada deve ter uma justificativa factual na evidência anterior e pode selecionar de uma a poucas ferramentas diretamente relacionadas ao que falta confirmar.",
    "Você pode fazer várias rodadas de ferramentas antes da resposta final, mas cada rodada deve reduzir uma incerteza real; quando a evidência já for suficiente, pare de consultar e consolide.",
    "Na EAP, nunca tente colocar diagnóstico, justificativas extensas ou todo o raciocínio em um único campo textual. Use os campos estruturados dos nós para registrar evidências e correções; o resumo deve sintetizar a conclusão.",
    "Não invente dados, consultas, resultados, aprovações ou alterações. Diferencie fatos confirmados, inferências e informações que ainda faltam.",
    "Existe uma memória persistente do Arquimedes. Consulte-a quando a continuidade da análise exigir contexto anterior. Dentro da mesma rodada, não repita consultar_memoria se o resultado já respondeu à necessidade; só faça nova consulta quando houver uma lacuna materialmente diferente. Registre apenas memórias duráveis e úteis; memória não substitui evidência atual nem autoriza mutações.",
    "A validação estrutural determinística local da EAP faz parte das evidências confirmadas da obra e não depende do MCP. Quando ela estiver disponível no contexto, use seu resultado para relatar estrutura, órfãos, níveis, duplicidades e ciclos. A indisponibilidade do MCP só torna indisponíveis as verificações que realmente dependem dele.",
    "As ferramentas de obra incluem consultas e operações de escrita controlada. Nunca altere dados na primeira análise: primeiro leia, diagnostique, apresente a alteração proposta e peça confirmação explícita ao engenheiro. Só depois de uma confirmação explícita nesta conversa execute a mutação. Após qualquer mutação, reconsulte a obra e valide o resultado. Exclusões são destrutivas e exigem confirmação explícita ainda mais clara.",
    "Resultados determinísticos de EAP, dependências e CPM devem ser tratados como cálculo do sistema. Não substitua esses resultados por estimativas suas quando o dado calculado estiver disponível.",
    "Para dúvidas técnicas de planejamento, use EAP, atividades, precedências, CPM, caminho crítico, folgas, Gantt, Linha de Balanço, produção e controle.",
    responseIntent === "analise"
      ? "Quando a intenção for análise no chat, continue sendo o Arquimedes: use consultas MCP somente leitura e, quando a pergunta exigir uma varredura ampla, use engineering_gap_analysis. Não convoque Euclides nem outros revisores silenciosamente; a Análise/Revisão formal de EAP pertence ao fluxo próprio de revisão."
      : "Em consultas pontuais, não faça uma varredura completa sem necessidade.",
    "Os MCPs de EAP, cronograma e Gantt/Linha de Balanço são capacidades opcionais. Nunca trate a indisponibilidade, queda, timeout, erro ou ausência de vínculo de um MCP como morte, bloqueio ou encerramento do Arquimedes. Continue usando o contexto e as evidências locais da obra e informe objetivamente quais evidências externas não puderam ser confirmadas.",
    "Quando uma consulta MCP somente leitura falhar, tente outra fonte somente se houver uma alternativa útil. Se o MCP continuar indisponível, prossiga com as fontes locais disponíveis; não conclua que a obra não pode ser analisada apenas por causa do MCP.",
    "Ao classificar apontamentos por categoria, conte apenas problemas efetivamente evidenciados. Não use '1 problema por grupo' como preenchimento. Quando uma categoria não puder ser auditada com as evidências disponíveis, escreva 'não verificável nesta rodada' e não invente uma quantidade.",
    "Use uma regra de causalidade para classificar cada apontamento: o fato observado precisa pertencer diretamente à categoria antes de virar problema daquela categoria. Ausência de atividades ou dependências é fato de cronograma/operacionalização; não converta isso em 'problema de escopo' nem em contagem de escopo. Ausência de orçamento é fato de orçamento; não transforme automaticamente em defeito da EAP.",
    "Diferencie cobertura de conformidade. '53/53 folhas sem dicionário completo' é uma medição de cobertura. Só chame isso de '53 problemas de dicionário' quando existir uma regra aprovada que exija aqueles campos para todas as 53 folhas. Sem esse padrão, reporte a lacuna como 'cobertura de dicionário: 0/53' e registre a definição do padrão como decisão pendente.",
    "A mesma regra vale para quantitativos: '53/53 sem unidade + quantidade' pode ser um achado factual de cobertura, mas só é um conjunto de problemas quando a unidade e a quantidade forem obrigatórias para aquelas folhas no escopo da obra. Não presuma aplicabilidade universal.",
    "Não declare um dado como 'pré-requisito para tudo o mais' sem evidência de dependência causal no fluxo da obra. Prefira termos como 'base útil', 'dependência parcial' ou 'ordem sugerida' quando a relação for de planejamento, e deixe explícito quando houver decisão de engenharia envolvida.",
    "Não gere um ranking de 'mais importantes' apenas pelo número bruto de ocorrências. Ao ordenar prioridades, considere aplicabilidade, impacto operacional demonstrado, dependências efetivamente conhecidas e decisões ainda pendentes. Se esses critérios não estiverem evidenciados, apresente as prioridades como proposta de tratamento, não como fato.",
    "Antes de atribuir uma quantidade a uma categoria, verifique quatro pontos: qual é a regra da categoria, qual evidência direta demonstra a violação, qual população está sujeita à regra e se a regra é aplicável a toda essa população. Se qualquer ponto faltar, reporte a lacuna/alerta sem fabricar uma contagem de problemas.",
    "Quando uma observação cruzar categorias, não duplique o mesmo fato como problema em todas elas. Mantenha o fato na categoria diretamente demonstrada e, nas demais, registre apenas a implicação ou alerta técnico, sem contagem, salvo evidência específica.",
    "Não infira ausência de quantitativos ou orçamento apenas porque não existem atividades ou dependências. Quantitativos e orçamento têm evidências próprias no contexto local; use-as quando fornecidas. Ausência de uma fonte não autoriza concluir ausência do dado.",
    "Não transforme uma inferência em fato. Para EAP, diferencie 'nós existem' de 'estrutura validada', e 'não há atividades cadastradas' de 'a EAP não possui folhas'. Só use a segunda formulação quando a hierarquia local permitir essa conclusão.",
    "Quando o usuário perguntar sobre o próprio código, arquitetura, bugs ou funcionamento interno da Plataforma Obras, use as ferramentas de repositório disponíveis para investigar. Não diga que não possui acesso ao código se a ferramenta puder fornecê-lo.",
    "Antes de modificar código, leia os arquivos envolvidos e confirme a causa do problema. Depois aplique somente a mudança necessária. Não invente que testou algo: use evidências reais.",
    "A ferramenta de atualização do repositório trabalha apenas na branch de trabalho configurada pelo runtime e aplica validações de caminho e concorrência. Nunca trate uma alteração como implantada até existir evidência do deploy.",
    "A administração de capacidades do Arquimedes é restrita a administradores. Instalação ou ativação só deve ocorrer quando houver um pedido explícito do administrador; não instale uma capacidade apenas porque ela parece útil.",
    "Não mencione 'MARCO', 'Agent Orchestrator', project_id, nomes internos de MCP, catálogos, políticas internas ou contratos de resposta, a menos que o usuário pergunte explicitamente sobre a arquitetura.",
  ];

  if (responseIntent !== "casual") {
    base.push(
      workspaceContext,
      "Contexto factual atual da obra. Use como referência, não como texto a ser repetido:\n" + formatContext(context),
      "Memória persistente disponível:\n" + memoryContext
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
        message.content.length >
          (message.role === "user"
            ? MAX_USER_MESSAGE_CHARS
            : MAX_ASSISTANT_MESSAGE_CHARS)
    )
  ) {
    throw new Error(
      `Cada mensagem de usuário deve ter até ${MAX_USER_MESSAGE_CHARS} caracteres e cada resposta histórica do assistente pode ter até ${MAX_ASSISTANT_MESSAGE_CHARS} caracteres.`
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
  // Uma ordem operacional explícita já é autorização para ações reversíveis
  // de planejamento (criar/atualizar atividades e dependências). Exclusões e
  // captura de baseline continuam sujeitas a confirmação adicional no fluxo.
  const allowMutations = intent === "operacao";
  const tools = toOpenAiTools(catalog, allowMutations);
  await emit({
    type: "catalog_loaded",
    toolCount: tools.length,
    errors: catalog.errors,
  });
  const audit: AuditEvent[] = [];
  const gapChecksExecuted = new Set<string>();
  let gapAnalysisCalls = 0;
  const MAX_GAP_ANALYSES = 2;
  const memoryContext = options.userId
    ? await buildArquimedesMemoryContext(options.userId, options.localProjectId)
    : "Memória persistente não carregada: usuário não identificado.";
  const brainBootstrap = await loadArquimedesBrainBootstrap();
  const conversation: LlmMessage[] = [
    {
      role: "system",
      content: compactLlmContent(
        buildSystem(context, mcpProjectIds, intent, memoryContext, brainBootstrap)
      ),
    },
    ...messages.map(message => ({
      role: message.role,
      content: compactLlmContent(message.content),
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
      if (toolName === "analisar_eap_localmente") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          const nodes = Array.isArray(rawArgs.nodes) ? rawArgs.nodes.map((node: any) => ({
            ...node,
            id: Number(node.id),
            projectId: Number(node.projectId ?? options.localProjectId ?? 0),
            parentId: node.parentId === null || node.parentId === undefined ? null : Number(node.parentId),
            code: String(node.code ?? ""),
            name: String(node.name ?? ""),
            level: Number(node.level ?? 0),
            nodeType: String(node.nodeType ?? ""),
            unit: node.unit == null ? null : String(node.unit),
            plannedQuantity: node.plannedQuantity == null ? null : Number(node.plannedQuantity),
          })) : [];
          const value = analyzeEapLocally(nodes);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "error", durationMs: Date.now() - startedAt, error: message });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "calcular_cpm_localmente") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          const activities = Array.isArray(rawArgs.activities) ? rawArgs.activities.map((a: any) => ({
            id: Number(a.id),
            projectId: 0,
            externalId: null,
            eapRef: null,
            wbsCode: String(a.wbsCode ?? a.id),
            name: String(a.name ?? a.id),
            phase: String(a.phase ?? "CPM"),
            startOffset: 0,
            durationDays: Number(a.durationDays),
            progress: 0,
            status: "Não iniciado",
            critical: 0,
            sortOrder: 0,
            mustStartOnDay: a.mustStartOnDay == null ? null : Number(a.mustStartOnDay),
            finishNoLaterThanDay: a.finishNoLaterThanDay == null ? null : Number(a.finishNoLaterThanDay),
          })) : [];
          const dependencies = Array.isArray(rawArgs.dependencies) ? rawArgs.dependencies.map((d: any) => ({
            id: 0,
            projectId: 0,
            externalId: null,
            predecessorId: Number(d.predecessorId),
            successorId: Number(d.successorId),
            type: (["FS", "SS", "FF", "SF"] as const).includes(String(d.type) as any) ? String(d.type) as "FS" | "SS" | "FF" | "SF" : "FS",
            lag: Number(d.lag ?? 0),
          })) : [];
          const value = calculateCpmLocally(activities, dependencies);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify({ source: "arquimedes_internal_engine", ...value }).slice(0, MAX_TOOL_RESULT_CHARS) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "error", durationMs: Date.now() - startedAt, error: message });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "calcular_duracao_atividade" || toolName === "validar_rede_dependencias_local") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          const value = toolName === "calcular_duracao_atividade"
            ? calculateActivityDuration({
                durationDays: rawArgs.durationDays === undefined ? undefined : Number(rawArgs.durationDays),
                plannedQuantity: rawArgs.plannedQuantity === undefined ? undefined : Number(rawArgs.plannedQuantity),
                productivity: rawArgs.productivity === undefined ? undefined : Number(rawArgs.productivity),
                quantityUnit: typeof rawArgs.quantityUnit === "string" ? rawArgs.quantityUnit : undefined,
                productivityUnit: typeof rawArgs.productivityUnit === "string" ? rawArgs.productivityUnit : undefined,
                source: typeof rawArgs.source === "string" ? rawArgs.source : null,
              })
            : validateDependencyNetwork(Array.isArray(rawArgs.dependencies) ? rawArgs.dependencies.map((dep: any) => ({ id:String(dep.id ?? ""), predecessor:String(dep.predecessor ?? ""), successor:String(dep.successor ?? "") })) : []);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify({ source: "arquimedes_internal_engine", ...value }).slice(0, MAX_TOOL_RESULT_CHARS) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "error", durationMs: Date.now() - startedAt, error: message });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "criar_atividade_local") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        if (!allowMutations) {
          const message = "A criação da atividade ainda não foi autorizada. Aguarde uma ordem operacional explícita.";
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "error", durationMs: Date.now() - startedAt, error: message });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
        try {
          if (!options.localProjectId || !options.userId) throw new Error("Sessão local da obra indisponível para criar atividade.");
          const localResult = await createLocalAgentActivity({
            projectId: options.localProjectId,
            userId: options.userId,
            rawArgs: {
              eap_ref: rawArgs.eapRef,
              name: rawArgs.name,
              durationDays: rawArgs.durationDays,
              plannedQuantity: rawArgs.plannedQuantity,
              unit: rawArgs.unit,
              productivity: rawArgs.productivity,
              productivityUnit: rawArgs.productivityUnit,
              source: rawArgs.source,
            },
          });
          const serialized = compactLlmContent(JSON.stringify({
            status: "created_and_verified",
            source: "local_db",
            resultado: localResult,
          }), MAX_TOOL_RESULT_CHARS);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: serialized };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "error", durationMs: Date.now() - startedAt, error: message });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "registrar_aprendizado") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          if (!options.userId) throw new Error("Sessão do usuário não identificada para a memória.");
          const value = await rememberArquimedesLearning({
            ownerUserId: options.userId,
            projectId: options.localProjectId ?? null,
            learningKey: String(rawArgs.learningKey ?? ""),
            problem: String(rawArgs.problem ?? ""),
            evidence: Array.isArray(rawArgs.evidence) ? rawArgs.evidence.map(String) : [],
            rule: String(rawArgs.rule ?? ""),
            regressionTest: rawArgs.regressionTest ? String(rawArgs.regressionTest) : null,
            scope: rawArgs.scope === "library" ? "library" : "project",
            confidence: rawArgs.confidence === "high" || rawArgs.confidence === "low" ? rawArgs.confidence : "medium",
            sourceRef: rawArgs.sourceRef ? String(rawArgs.sourceRef) : null,
          });
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify({ status: "candidate_recorded", memoryId: value?.id ?? null }) };
        } catch (error) {
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          throw error;
        }
      }
      if (toolName === "consultar_memoria" || toolName === "registrar_memoria") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          if (!options.userId) throw new Error("Sessão do usuário não identificada para a memória.");
          if (toolName === "consultar_memoria") {
            const value = await recallArquimedes(
              options.userId,
              options.localProjectId,
              String(rawArgs.query ?? ""),
              Number(rawArgs.limit ?? 10)
            );
            audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
            await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
            return { ok: true, content: JSON.stringify({ status: "ok", memorias: value }).slice(0, MAX_TOOL_RESULT_CHARS) };
          }

          const value = await rememberArquimedes({
            projectId: options.localProjectId ?? null,
            ownerUserId: options.userId,
            scope: options.localProjectId ? "project" : "library",
            category: String(rawArgs.category ?? ""),
            memoryKey: String(rawArgs.memoryKey ?? ""),
            value: rawArgs.value,
            sourceType: String(rawArgs.sourceType ?? "arquimedes"),
            sourceRef: typeof rawArgs.sourceRef === "string" ? rawArgs.sourceRef : null,
            confidence: rawArgs.confidence === "high" || rawArgs.confidence === "low" ? rawArgs.confidence : "medium",
          });
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "success", durationMs: Date.now() - startedAt });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify({ status: "registrada", memoria: value }).slice(0, MAX_TOOL_RESULT_CHARS) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          audit.push({ taskId, iteration, event: "tool_call", domain: "runtime", toolName, status: "error", durationMs: Date.now() - startedAt, error: message });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
          return { ok: false, error: message, content: "" };
        }
      }

      if (toolName === "consultar_eap_local") {
        const startedAt = Date.now();
        await emit({ type: "tool_started", iteration, domain: "runtime", toolName });
        try {
          if (!options.localProjectId) {
            throw new Error("Identificador local da obra indisponível para consulta da EAP.");
          }
          const result = await localDatabaseEvidenceSource.getEapTree(options.localProjectId);
          if (!result.data) {
            const message = result.errors.map(error => error.message).join(" | ") || "EAP local indisponível.";
            audit.push({
              taskId, iteration, event: "tool_call", domain: "runtime", toolName,
              status: "error", durationMs: Date.now() - startedAt, error: message,
            });
            await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "error" });
            return { ok: true, content: JSON.stringify({ status: "indisponivel", fonte: "local_db", mensagem: message }) };
          }

          const nodes = result.data;
          const childrenByParent = new Map<string, number>();
          const byRef = new Map<string, (typeof nodes)[number]>();
          for (const node of nodes) {
            byRef.set(node.code.toLowerCase(), node);
            if (node.externalId) byRef.set(node.externalId.toLowerCase(), node);
            if (node.externalUid) byRef.set(node.externalUid.toLowerCase(), node);
            if (node.parentId !== null && node.parentId !== undefined) {
              const key = String(node.parentId);
              childrenByParent.set(key, (childrenByParent.get(key) ?? 0) + 1);
            }
          }

          const refs = Array.isArray(rawArgs.refs)
            ? rawArgs.refs.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(0, 20)
            : [];
          const search = typeof rawArgs.search === "string" ? rawArgs.search.trim().toLowerCase() : "";
          const parentCode = typeof rawArgs.parentCode === "string" ? rawArgs.parentCode.trim().toLowerCase() : "";
          const leafOnly = rawArgs.leafOnly === true || rawArgs.leafOnly === "true" ? true : false;
          const limit = Math.min(Math.max(Number(rawArgs.limit ?? 20), 1), 30);
          const field = typeof rawArgs.field === "string" ? rawArgs.field : null;
          const fieldState = rawArgs.fieldState === "filled" || rawArgs.fieldState === "missing"
            ? rawArgs.fieldState
            : null;
          const includeCoverage = rawArgs.includeCoverage === true;
          const parentNode = parentCode ? byRef.get(parentCode) : null;

          const fieldValue = (node: (typeof nodes)[number], key: string) => {
            const value = (node as Record<string, unknown>)[key];
            if (value === null || value === undefined) return null;
            if (typeof value === "string") return value.trim() || null;
            return value;
          };
          const isFieldFilled = (node: (typeof nodes)[number], key: string) => fieldValue(node, key) !== null;

          const selected = nodes
            .filter(node => {
              if (refs.length > 0 && !refs.some(ref => byRef.get(ref.trim().toLowerCase())?.id === node.id)) return false;
              if (parentCode && (!parentNode || String(node.parentId) !== String(parentNode.id))) return false;
              if (leafOnly && (childrenByParent.get(String(node.id)) ?? 0) > 0) return false;
              if (field && fieldState) {
                const filled = isFieldFilled(node, field);
                if (fieldState === "filled" && !filled) return false;
                if (fieldState === "missing" && filled) return false;
              }
              if (search) {
                const haystack = [
                  node.code, node.name, node.description, node.inclusions, node.exclusions,
                  node.location, node.responsible, node.acceptanceCriteria, node.scopeStatus,
                  node.decompositionBasis,
                ].filter(Boolean).join(" ").toLowerCase();
                if (!haystack.includes(search)) return false;
              }
              return true;
            })
            .sort((a, b) => a.sortOrder - b.sortOrder || String(a.code).localeCompare(String(b.code)))
            .slice(0, limit);

          const parentById = new Map(nodes.map(node => [String(node.id), node]));
          const pathFor = (node: (typeof nodes)[number]) => {
            const path: string[] = [];
            const seen = new Set<string>();
            let current: (typeof nodes)[number] | undefined = node;
            while (current) {
              const key = String(current.id);
              if (seen.has(key)) break;
              seen.add(key);
              path.unshift(current.code);
              if (current.parentId === null || current.parentId === undefined) break;
              current = parentById.get(String(current.parentId));
            }
            return path;
          };

          const payload = {
            status: "ok",
            fonte: "local_db",
            totalNodes: nodes.length,
            totalLeaves: nodes.filter(node => (childrenByParent.get(String(node.id)) ?? 0) === 0).length,
            filtros: {
              refs,
              search: search || null,
              parentCode: parentCode || null,
              leafOnly,
              limit,
              field,
              fieldState,
            },
            encontrados: selected.length,
            coverage: includeCoverage
              ? (() => {
                  const leaves = nodes.filter(node => (childrenByParent.get(String(node.id)) ?? 0) === 0);
                  const fields = [
                    "description",
                    "inclusions",
                    "exclusions",
                    "location",
                    "responsible",
                    "acceptanceCriteria",
                    "scopeStatus",
                    "decompositionBasis",
                    "unit",
                    "plannedQuantity",
                  ] as const;
                  const makeCoverage = (population: typeof nodes) =>
                    Object.fromEntries(
                      fields.map(key => {
                        const filled = population.filter(node => isFieldFilled(node, key)).length;
                        return [key, {
                          total: population.length,
                          filled,
                          missing: population.length - filled,
                          coveragePct: population.length ? Math.round((filled / population.length) * 10000) / 100 : 0,
                        }];
                      })
                    );
                  return {
                    allNodes: makeCoverage(nodes),
                    leaves: makeCoverage(leaves),
                    currentDictionaryRule: {
                      fields: ["description", "inclusions", "exclusions", "responsible", "acceptanceCriteria"],
                      totalLeaves: leaves.length,
                      completeLeaves: leaves.filter(node =>
                        ["description", "inclusions", "exclusions", "responsible", "acceptanceCriteria"]
                          .every(key => isFieldFilled(node, key))
                      ).length,
                    },
                    scopeStatusValues: Array.from(
                      new Set(nodes.map(node => String(node.scopeStatus ?? "null")))
                    ).map(value => ({
                      value,
                      count: nodes.filter(node => String(node.scopeStatus ?? "null") === value).length,
                    })),
                  };
                })()
              : null,
            nos: selected.map(node => ({
              code: node.code,
              name: node.name,
              path: pathFor(node),
              parentCode: node.parentId === null || node.parentId === undefined
                ? null
                : parentById.get(String(node.parentId))?.code ?? null,
              level: node.level,
              nodeType: node.nodeType,
              description: node.description ?? null,
              inclusions: node.inclusions ?? null,
              exclusions: node.exclusions ?? null,
              location: node.location ?? null,
              responsible: node.responsible ?? null,
              acceptanceCriteria: node.acceptanceCriteria ?? null,
              scopeStatus: node.scopeStatus ?? null,
              decompositionBasis: node.decompositionBasis ?? null,
              unit: node.unit ?? null,
              plannedQuantity: node.plannedQuantity ?? null,
              hasChildren: (childrenByParent.get(String(node.id)) ?? 0) > 0,
            })),
            avisos: result.warnings,
          };

          audit.push({
            taskId, iteration, event: "tool_call", domain: "runtime", toolName,
            status: "success", durationMs: Date.now() - startedAt,
          });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify(payload).slice(0, MAX_TOOL_RESULT_CHARS) };
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

        const requestedChecks = Array.isArray(rawArgs.checks)
          ? rawArgs.checks.filter((value): value is string => typeof value === "string")
          : [];
        const focus = typeof rawArgs.focus === "string" ? rawArgs.focus : null;

        const legacyChecksByFocus: Record<string, string[]> = {
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

        const selectedChecks = (requestedChecks.length
          ? requestedChecks
          : legacyChecksByFocus[focus ?? "geral"] ?? legacyChecksByFocus.geral
        ).slice(0, 6);

        if (gapAnalysisCalls >= MAX_GAP_ANALYSES) {
          const value = {
            obra: context.project.code,
            status: "limite_atingido",
            consultasJaExecutadas: [...gapChecksExecuted],
            instrucao:
              "O orçamento de rodadas adicionais desta análise já foi usado. Não solicite outra varredura; consolide as evidências já coletadas e conclua.",
          };
          audit.push({
            taskId, iteration, event: "tool_call", domain: "runtime", toolName,
            status: "success", durationMs: Date.now() - startedAt,
          });
          await emit({ type: "tool_finished", iteration, domain: "runtime", toolName, status: "success" });
          return { ok: true, content: JSON.stringify(value) };
        }

        gapAnalysisCalls += 1;

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

        const availableByDomain: Record<string, Set<string>> = {
          eap: new Set((catalog.eap ?? []).map(tool => tool.name)),
          cronograma: new Set((catalog.cronograma ?? []).map(tool => tool.name)),
          ganttLob: new Set((catalog.ganttLob ?? []).map(tool => tool.name)),
        };
        const findings: Array<Record<string, unknown>> = [];
        for (const check of selectedChecks) {
          if (gapChecksExecuted.has(check)) {
            findings.push({
              check,
              status: "ja_consultado",
              instrucao: "Não repita esta consulta; use o resultado já retornado nesta análise.",
            });
            continue;
          }

          const domain = TOOL_DOMAINS[check as keyof typeof TOOL_DOMAINS];
          if (!domain || !knownByDomain[domain]?.has(check)) {
            findings.push({ check, status: "indisponivel" });
            continue;
          }

          if (!availableByDomain[domain]?.has(check)) {
            findings.push({ check, status: "nao_publicado_no_catalogo" });
            gapChecksExecuted.add(check);
            continue;
          }

          const projectId = mcpProjectIds[domain];
          if (!projectId) {
            findings.push({ check, status: "sem_projeto_mcp" });
            gapChecksExecuted.add(check);
            continue;
          }

          try {
            const result = await (deps.callTool ?? callReadOnlyMcpTool)(
              domain,
              check,
              { project_id: projectId }
            );
            findings.push({ check, status: "ok", result });
            gapChecksExecuted.add(check);
          } catch (error) {
            findings.push({
              check,
              status: "erro",
              error: error instanceof Error ? error.message : String(error),
            });
            // Consider the attempted check consumed so a failing MCP does not
            // trigger an infinite retry loop in the next reasoning round.
            gapChecksExecuted.add(check);
          }
        }

        const value = {
          obra: context.project.code,
          consultasSolicitadas: selectedChecks,
          consultasJaExecutadas: [...gapChecksExecuted],
          verificacoes: findings,
          evidenciasLocais: {
            nosEap: context.evidence?.eapNodeCount ?? null,
            atividades: context.evidence?.activityCount ?? null,
            dependencias: context.evidence?.dependencyCount ?? null,
            eapLocal: context.evidence?.localEap ?? null,
            orcamentoLocal: context.evidence?.localBudget ?? null,
            avisos: context.evidence?.warnings ?? [],
            erros: context.evidence?.errors ?? [],
            validacao: context.evidence?.validation
              ? {
                  status: context.evidence.validation.status,
                  bloqueadores: context.evidence.validation.blockerCount,
                  duracao: context.evidence.validation.projectDuration ?? null,
                  caminhoCritico: context.evidence.validation.criticalPath,
                  problemas: context.evidence.validation.issues,
                }
              : null,
          },
          instrucao:
            "Interprete cada resultado como evidência. Separe fatos confirmados, inferências e indisponibilidades. Use a rodada seguinte somente se ainda existir uma lacuna relevante que possa ser reduzida por outra consulta específica. Se um MCP estiver indisponível, use as evidências locais como fallback. Não altere a obra nesta ferramenta.",
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
      const isProjectScoped =
        PROJECT_SCOPED_TOOLS.has(toolName) ||
        PROJECT_SCOPED_MUTATION_TOOLS.has(toolName);

      if (isProjectScoped && !mcpProjectId) {
        const message =
          "Esta consulta depende de um MCP de obra que não está vinculado no momento. O Arquimedes deve continuar com as evidências locais disponíveis e informar esta limitação.";
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "error", durationMs: Date.now() - startedAt, error: message,
        });
        await emit({ type: "tool_finished", iteration, domain, toolName, status: "error" });

        if (isMutation) {
          return { ok: false, error: message, content: "" };
        }

        return {
          ok: true,
          content: JSON.stringify({
            status: "indisponivel",
            motivo: "mcp_sem_vinculo",
            dominio: domain,
            ferramenta: toolName,
            obra: context.project.code,
            mensagem: message,
            fallbackLocal: {
              nosEap: context.evidence?.eapNodeCount ?? null,
              atividades: context.evidence?.activityCount ?? null,
              dependencias: context.evidence?.dependencyCount ?? null,
            },
          }),
        };
      }

      const args = { ...rawArgs };
      if (mcpProjectId) args.project_id = mcpProjectId;

      try {
        let result: McpCallResult;
        if (
          isMutation &&
          toolName === "criar_atividade" &&
          (!mcpProjectId)
        ) {
          const localResult = await createLocalAgentActivity({
            projectId: options.localProjectId!,
            userId: options.userId!,
            rawArgs: args,
          });
          result = {
            content: [{ type: "text", text: JSON.stringify(localResult) }],
          } as McpCallResult;
        } else {
          result = isMutation
            ? await callMutationMcpTool(domain as any, toolName, args)
            : await (deps.callTool ?? callReadOnlyMcpTool)(domain, toolName, args);
        }
        if (
          isMutation &&
          toolName === "criar_atividade" &&
          options.localProjectId &&
          options.userId &&
          /HTTP Error 404|404.*Not Found|eap_ref.*not found|eap_ref.*não encontrado/i.test(JSON.stringify(result))
        ) {
          const localResult = await createLocalAgentActivity({
            projectId: options.localProjectId,
            userId: options.userId,
            rawArgs: args,
          });
          result = {
            content: [{ type: "text", text: JSON.stringify({
              fallback: true,
              motivo: "mcp_context_not_resolved",
              mensagem: "O MCP devolveu 404 para a referência da obra; a operação foi executada e verificada pela fonte local.",
              resultado: localResult,
            }) }],
          } as McpCallResult;
        }
        const serialized = compactLlmContent(
          JSON.stringify(result),
          MAX_TOOL_RESULT_CHARS
        );
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "success", durationMs: Date.now() - startedAt,
        });
        await emit({ type: "tool_finished", iteration, domain, toolName, status: "success" });
        return { ok: true, content: serialized };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida na ferramenta MCP";
        const canSafelyFallbackToLocal =
          isMutation &&
          toolName === "criar_atividade" &&
          Boolean(options.localProjectId && options.userId) &&
          /HTTP Error 404|404|eap_ref|não encontrado|not found|project_id/i.test(message);
        if (canSafelyFallbackToLocal) {
          try {
            const localResult = await createLocalAgentActivity({
              projectId: options.localProjectId!,
              userId: options.userId!,
              rawArgs: args,
            });
            const serialized = compactLlmContent(
              JSON.stringify({
                fallback: true,
                motivo: "mcp_context_not_resolved",
                mensagem: "O MCP não resolveu a referência da obra; a operação foi executada e verificada pela fonte local.",
                resultado: localResult,
              }),
              MAX_TOOL_RESULT_CHARS
            );
            audit.push({
              taskId, iteration, event: "tool_call", domain, toolName,
              status: "success", durationMs: Date.now() - startedAt,
            });
            await emit({ type: "tool_finished", iteration, domain, toolName, status: "success" });
            return { ok: true, content: serialized };
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            audit.push({
              taskId, iteration, event: "tool_call", domain, toolName,
              status: "error", durationMs: Date.now() - startedAt, error: fallbackMessage,
            });
            await emit({ type: "tool_finished", iteration, domain, toolName, status: "error" });
            return { ok: false, error: `${message} | fallback local: ${fallbackMessage}`, content: "" };
          }
        }
        audit.push({
          taskId, iteration, event: "tool_call", domain, toolName,
          status: "error", durationMs: Date.now() - startedAt, error: message,
        });
        await emit({ type: "tool_finished", iteration, domain, toolName, status: "error" });
        if (isReadOnly) {
          return {
            ok: true,
            content: JSON.stringify({
              status: "indisponivel",
              motivo: "mcp_falhou_na_consulta",
              dominio: domain,
              ferramenta: toolName,
              obra: context.project.code,
              mensagem:
                "A consulta MCP falhou, mas isso não bloqueia o Arquimedes. Continue com as evidências locais e registre a limitação na resposta final.",
              erro: message,
              fallbackLocal: {
                nosEap: context.evidence?.eapNodeCount ?? null,
                atividades: context.evidence?.activityCount ?? null,
                dependencias: context.evidence?.dependencyCount ?? null,
              },
            }),
          };
        }
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

  // Persiste automaticamente o ponto de parada de uma análise. O checkpoint
  // é contexto de raciocínio para a próxima conversa; nunca autoriza mutação.
  if (options.userId && options.localProjectId && intent === "analise" && content) {
    try {
      await rememberArquimedes({
        projectId: options.localProjectId,
        ownerUserId: options.userId,
        scope: "project",
        category: "analysis_checkpoint",
        memoryKey: "eap-analysis-checkpoint-current",
        value: {
          status: "diagnostico_concluido",
          etapa: "antes_da_proposta",
          projectId: options.localProjectId,
          projectCode: context.project.code,
          projectName: context.project.name,
          evidence: {
            eapNodeCount: context.evidence?.eapNodeCount ?? null,
            activityCount: context.evidence?.activityCount ?? null,
            dependencyCount: context.evidence?.dependencyCount ?? null,
            budgetItemCount: context.evidence?.localBudget?.itemCount ?? null,
            eapStructureValidation: context.evidence?.localEap?.structureValidation ?? null,
          },
          response: content.slice(0, 9000),
          toolsConsulted: audit
            .filter(event => event.event === "tool_call" && event.status === "success")
            .map(event => event.toolName)
            .filter((name, index, all) => all.indexOf(name) === index)
            .slice(0, 30),
          iterations: runtimeResult.iterations,
          changesApplied: false,
          formalProposalCount: 0,
          savedAt: new Date().toISOString(),
        },
        sourceType: "arquimedes",
        sourceRef: taskId,
        confidence: "medium",
      });
    } catch (error) {
      // A falha de memória não deve derrubar a resposta de engenharia.
      console.warn(JSON.stringify({
        evento: "arquimedes_analysis_checkpoint_failed",
        projectId: options.localProjectId,
        taskId,
        erro: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  // Regra permanente do cérebro: toda conversa operacional que passa pelo
  // Arquimedes é preservada como histórico recuperável. Isso não transforma
  // conversa em regra validada e nunca concede autorização de mutação.
  if (options.userId && messages.length > 0) {
    try {
      await rememberArquimedesConversation({
        ownerUserId: options.userId,
        projectId: options.localProjectId ?? null,
        taskId,
        messages,
        response: content,
        sourceRef: taskId,
      });
    } catch (error) {
      // Continuidade é importante, mas uma falha de memória não deve derrubar
      // a resposta operacional atual.
      console.warn(JSON.stringify({
        evento: "arquimedes_conversation_memory_failed",
        projectId: options.localProjectId ?? null,
        taskId,
        erro: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  await emit({ type: "response_parsed" });

  return {
    taskId,
    content,
    model: runtimeResult.response.model || ENV.aiModel || "gpt-5-mini",
    provider: runtimeResult.response.provider,
    iterations: runtimeResult.iterations,
    audit,
    // O modo somente leitura é derivado da política efetiva desta execução.
    // Quando não há confirmação explícita, nenhuma mutação é permitida.
    readOnly: !allowMutations,
    status: "respondido",
  };

}

export { MAX_ITERATIONS, toOpenAiTools };