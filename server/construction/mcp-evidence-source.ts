import {
  callReadOnlyMcpTool,
  type ConstructionMcpDomain,
} from "../integrations/construction-mcps";
import type { McpCallResult } from "../integrations/mcp-client";
import {
  failedEvidence,
  type EapEvidenceNode,
  type EvidenceResult,
  type EvidenceSource,
  type ScheduleEvidenceActivity,
  type ScheduleEvidenceDependency,
} from "./domain-types";

type McpEvidenceCall = (
  domain: ConstructionMcpDomain,
  toolName: string,
  args: Record<string, unknown>
) => Promise<McpCallResult>;

type RawRecord = Record<string, any>;

function payload(result: McpCallResult): RawRecord {
  if (
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    return result.structuredContent as RawRecord;
  }
  const text = result.content
    ?.filter(item => item.type === "text" && typeof item.text === "string")
    .map(item => item.text)
    .join("\n")
    .trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as RawRecord) : {};
  } catch {
    return {};
  }
}

function listFrom(payloadValue: RawRecord, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(payloadValue[key]))
      return payloadValue[key] as RawRecord[];
  }
  return [];
}

function mapNode(
  raw: RawRecord,
  projectId: number,
  index: number,
  parentId: string | null
): EapEvidenceNode {
  const children = Array.isArray(raw.filhos) ? raw.filhos : [];
  const externalId = raw.eap_id ?? raw.id ?? null;
  return {
    id: raw.id ?? externalId ?? `mcp-eap-${index}`,
    projectId,
    externalId: externalId === null ? null : String(externalId),
    externalUid: raw.uid == null ? null : String(raw.uid),
    parentId: raw.parent_id ?? parentId,
    code: String(
      raw.eap_id ?? raw.codigo ?? raw.code ?? externalId ?? index + 1
    ),
    name: String(raw.nome ?? raw.name ?? "Nó EAP sem nome"),
    level: Number(raw.nivel ?? raw.level ?? 0),
    nodeType: children.length > 0 ? "grupo" : "pacote",
    unit: raw.unidade ?? raw.unit ?? null,
    plannedQuantity:
      raw.quantidade == null
        ? (raw.planned_quantity ?? null)
        : Number(raw.quantidade),
    sortOrder: Number(raw.sort_order ?? index),
  };
}

function flattenNodes(rawNodes: RawRecord[], projectId: number) {
  const nodes: EapEvidenceNode[] = [];
  const visit = (raw: RawRecord, parentId: string | null) => {
    const node = mapNode(raw, projectId, nodes.length, parentId);
    nodes.push(node);
    const children = Array.isArray(raw.filhos) ? raw.filhos : [];
    for (const child of children)
      visit(child, String(node.externalId ?? node.id));
  };
  for (const raw of rawNodes) visit(raw, null);
  return nodes;
}

function mapActivity(
  raw: RawRecord,
  projectId: number,
  index: number
): ScheduleEvidenceActivity {
  const id = raw.id ?? raw.external_id ?? `mcp-activity-${index}`;
  return {
    id,
    projectId,
    externalId: id == null ? null : String(id),
    eapRef: raw.eap_ref ?? raw.wbs_code ?? null,
    wbsCode: String(raw.wbs_code ?? raw.eap_ref ?? "sem-EAP"),
    name: String(raw.nome ?? raw.name ?? "Atividade sem nome"),
    phase: String(raw.fase ?? raw.phase ?? "Não informado"),
    startOffset: Number(raw.start_offset ?? 0),
    durationDays: Number(
      raw.duracao_dias ?? raw.duration_days ?? raw.duration ?? 0
    ),
    progress: Number(raw.percentual_concluido ?? raw.progress ?? 0),
    status: String(raw.status ?? "Não informado"),
    critical: Number(raw.critica ?? raw.critical ?? 0),
    sortOrder: Number(raw.sort_order ?? index),
  };
}

function mapDependency(
  raw: RawRecord,
  projectId: number,
  index: number
): ScheduleEvidenceDependency {
  const typeMap: Record<string, ScheduleEvidenceDependency["type"]> = {
    TI: "FS",
    II: "SS",
    TT: "FF",
    IT: "SF",
    FS: "FS",
    SS: "SS",
    FF: "FF",
    SF: "SF",
  };
  const rawType = String(raw.tipo ?? raw.type ?? "FS").toUpperCase();
  return {
    id: raw.id ?? `mcp-dependency-${index}`,
    projectId,
    externalId: raw.id == null ? null : String(raw.id),
    predecessorId: raw.predecessora_id ?? raw.predecessor_id ?? raw.predecessor,
    successorId: raw.sucessora_id ?? raw.successor_id ?? raw.successor,
    type: typeMap[rawType] ?? "FS",
    lag: Number(raw.lag_dias ?? raw.lag ?? 0),
  };
}

export class McpEvidenceSource implements EvidenceSource {
  constructor(
    private readonly externalProjectId: string,
    private readonly call: McpEvidenceCall = callReadOnlyMcpTool
  ) {}

  private args() {
    return { project_id: this.externalProjectId };
  }

  async getEapTree(
    projectId: number
  ): Promise<EvidenceResult<EapEvidenceNode[]>> {
    try {
      const result = await this.call("eap", "get_eap_tree", this.args());
      const nodes = flattenNodes(
        listFrom(payload(result), ["raizes", "nodes", "eap"]),
        projectId
      );
      return {
        source: "mcp",
        projectId,
        data: nodes,
        warnings: nodes.length
          ? []
          : [
              {
                code: "empty_mcp_eap",
                message: "O MCP EAP respondeu sem nós estruturados.",
              },
            ],
        errors: [],
      };
    } catch (error) {
      return failedEvidence("mcp", projectId, "mcp_eap_unavailable", error);
    }
  }

  async getEapNode(
    projectId: number,
    ref: string
  ): Promise<EvidenceResult<EapEvidenceNode | null>> {
    try {
      const result = await this.call("eap", "get_eap_node", {
        ...this.args(),
        eap_id: ref,
      });
      const parsed = payload(result);
      const raw = parsed.node ?? parsed.eap_node ?? parsed;
      const node =
        raw && (raw.eap_id || raw.id || raw.codigo)
          ? mapNode(raw, projectId, 0, raw.parent_id ?? null)
          : null;
      return {
        source: "mcp",
        projectId,
        data: node,
        warnings: node
          ? []
          : [
              {
                code: "mcp_eap_node_not_found",
                message: `Nó EAP não encontrado no MCP: ${ref}.`,
                entityRef: ref,
              },
            ],
        errors: [],
      };
    } catch (error) {
      return failedEvidence("mcp", projectId, "mcp_eap_unavailable", error);
    }
  }

  async listActivities(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceActivity[]>> {
    try {
      const result = await this.call(
        "cronograma",
        "listar_atividades",
        this.args()
      );
      const activities = listFrom(payload(result), [
        "atividades",
        "activities",
      ]).map((raw, index) => mapActivity(raw, projectId, index));
      return {
        source: "mcp",
        projectId,
        data: activities,
        warnings: activities.length
          ? []
          : [
              {
                code: "empty_mcp_schedule",
                message:
                  "O MCP de Cronograma respondeu sem atividades estruturadas.",
              },
            ],
        errors: [],
      };
    } catch (error) {
      return failedEvidence(
        "mcp",
        projectId,
        "mcp_cronograma_unavailable",
        error
      );
    }
  }

  async listDependencies(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceDependency[]>> {
    try {
      const result = await this.call(
        "cronograma",
        "listar_dependencias",
        this.args()
      );
      const dependencies = listFrom(payload(result), [
        "dependencias",
        "dependencies",
      ]).map((raw, index) => mapDependency(raw, projectId, index));
      return {
        source: "mcp",
        projectId,
        data: dependencies,
        warnings: [],
        errors: [],
      };
    } catch (error) {
      return failedEvidence(
        "mcp",
        projectId,
        "mcp_cronograma_unavailable",
        error
      );
    }
  }
}

export class ConstructionMcpEvidenceSource implements EvidenceSource {
  private readonly eap?: McpEvidenceSource;
  private readonly cronograma?: McpEvidenceSource;

  constructor(
    externalProjectIds: Partial<Record<"eap" | "cronograma", string>>,
    call: McpEvidenceCall = callReadOnlyMcpTool
  ) {
    this.eap = externalProjectIds.eap
      ? new McpEvidenceSource(externalProjectIds.eap, call)
      : undefined;
    this.cronograma = externalProjectIds.cronograma
      ? new McpEvidenceSource(externalProjectIds.cronograma, call)
      : undefined;
  }

  private missing<T>(projectId: number, domain: string): EvidenceResult<T> {
    return failedEvidence(
      "mcp",
      projectId,
      "mcp_project_mapping_missing",
      `Vínculo de projeto externo ausente para o domínio ${domain}.`,
      false
    );
  }

  getEapTree(projectId: number) {
    return (
      this.eap?.getEapTree(projectId) ??
      Promise.resolve(this.missing<EapEvidenceNode[]>(projectId, "eap"))
    );
  }

  getEapNode(projectId: number, ref: string) {
    return (
      this.eap?.getEapNode(projectId, ref) ??
      Promise.resolve(this.missing<EapEvidenceNode | null>(projectId, "eap"))
    );
  }

  listActivities(projectId: number) {
    return (
      this.cronograma?.listActivities(projectId) ??
      Promise.resolve(
        this.missing<ScheduleEvidenceActivity[]>(projectId, "cronograma")
      )
    );
  }

  listDependencies(projectId: number) {
    return (
      this.cronograma?.listDependencies(projectId) ??
      Promise.resolve(
        this.missing<ScheduleEvidenceDependency[]>(projectId, "cronograma")
      )
    );
  }
}
