import { extractMcpText, type McpCallResult } from "./mcp-client";

export type Phase7WbsNode = {
  externalId: string;
  externalUid: string | null;
  parentExternalId: string | null;
  code: string;
  name: string;
  level: number;
  nodeType: "grupo" | "pacote" | "entrega";
  unit: string | null;
  plannedQuantity: number | null;
  sortOrder: number;
};

export type Phase7Activity = {
  externalId: string;
  eapRef: string;
  name: string;
  phase: string;
  startDate: string | null;
  durationDays: number;
  progress: number;
  critical: number;
  sortOrder: number;
};

export type Phase7Dependency = {
  externalId: string;
  predecessorExternalId: string;
  successorExternalId: string;
  type: "FS" | "SS" | "FF" | "SF";
  lag: number;
};

export type Phase7ImportPlan = {
  projectExternalId: string;
  wbsNodes: Phase7WbsNode[];
  activities: Phase7Activity[];
  dependencies: Phase7Dependency[];
  criticalPath: string[];
  totalDurationDays: number | null;
};

function payload(result: McpCallResult): Record<string, unknown> {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  const text = extractMcpText(result).trim();
  if (!text) throw new Error("MCP retornou resposta vazia.");
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("MCP retornou payload inválido.");
  }
  return parsed as Record<string, unknown>;
}

function stringValue(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Campo MCP obrigatório ausente: ${field}.`);
  }
  return value.trim();
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function flattenNodes(roots: unknown[]) {
  const result: Phase7WbsNode[] = [];
  const visit = (raw: unknown, parentExternalId: string | null, sortOrder: number) => {
    if (!raw || typeof raw !== "object") throw new Error("Nó EAP inválido.");
    const node = raw as Record<string, unknown>;
    if (node.truncado === true) {
      throw new Error("A EAP está truncada; importe a árvore completa antes de continuar.");
    }
    const externalId = stringValue(node.eap_id, "eap_id");
    const level = Math.max(1, Math.trunc(numberValue(node.nivel, parentExternalId ? 2 : 1)));
    const children = Array.isArray(node.filhos) ? node.filhos : [];
    result.push({
      externalId,
      externalUid: typeof node.uid === "string" ? node.uid : null,
      parentExternalId,
      code: externalId,
      name: stringValue(node.nome, `nome(${externalId})`),
      level,
      nodeType: parentExternalId === null ? "grupo" : children.length ? "pacote" : "entrega",
      unit: typeof node.unidade === "string" ? node.unidade : null,
      plannedQuantity: typeof node.quantidade === "number" ? Math.round(node.quantidade) : null,
      sortOrder,
    });
    children.forEach((child, index) => visit(child, externalId, index));
  };
  roots.forEach((root, index) => visit(root, null, index));
  return result;
}

function parseDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function dependencyType(value: unknown): Phase7Dependency["type"] {
  const map: Record<string, Phase7Dependency["type"]> = { TI: "FS", II: "SS", TT: "FF", IT: "SF" };
  return map[String(value ?? "TI").toUpperCase()] ?? "FS";
}

export function buildPhase7ImportPlan(
  projectExternalId: string,
  eapResult: McpCallResult,
  activityResult: McpCallResult,
  dependencyResult: McpCallResult,
  cpmResult?: McpCallResult
): Phase7ImportPlan {
  const eap = payload(eapResult);
  const roots = Array.isArray(eap.raizes) ? eap.raizes : [];
  if (roots.length !== 1) throw new Error(`A EAP deve possuir uma única raiz; foram retornadas ${roots.length}.`);
  const wbsNodes = flattenNodes(roots);
  const nodeIds = new Set(wbsNodes.map(node => node.externalId));

  const activitiesPayload = payload(activityResult);
  const rawActivities = Array.isArray(activitiesPayload.atividades) ? activitiesPayload.atividades : [];
  const activities: Phase7Activity[] = rawActivities.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error("Atividade MCP inválida.");
    const item = raw as Record<string, unknown>;
    const eapRef = stringValue(item.eap_ref, `eap_ref(${index + 1})`);
    if (!nodeIds.has(eapRef)) throw new Error(`Atividade ${String(item.id ?? index + 1)} referencia EAP inexistente: ${eapRef}.`);
    const progress = Math.min(100, Math.max(0, Math.round(numberValue(item.percentual_concluido))));
    return {
      externalId: stringValue(item.id, `id atividade ${index + 1}`),
      eapRef,
      name: stringValue(item.nome, `nome atividade ${index + 1}`),
      phase: eapRef,
      startDate: parseDate(item.data_inicio_planejada),
      durationDays: Math.max(0, Math.round(numberValue(item.duracao_dias))),
      progress,
      critical: item.critica === true || numberValue(item.critica) === 1 ? 1 : 0,
      sortOrder: index,
    };
  });
  const activityIds = new Set(activities.map(activity => activity.externalId));

  const dependenciesPayload = payload(dependencyResult);
  const rawDependencies = Array.isArray(dependenciesPayload.dependencias) ? dependenciesPayload.dependencias : [];
  const dependencies: Phase7Dependency[] = rawDependencies.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error("Dependência MCP inválida.");
    const item = raw as Record<string, unknown>;
    const predecessorExternalId = stringValue(item.predecessora_id, `predecessora_id(${index + 1})`);
    const successorExternalId = stringValue(item.sucessora_id, `sucessora_id(${index + 1})`);
    if (!activityIds.has(predecessorExternalId) || !activityIds.has(successorExternalId)) {
      throw new Error(`Dependência ${String(item.id ?? index + 1)} referencia atividade inexistente.`);
    }
    return {
      externalId: stringValue(item.id, `id dependência ${index + 1}`),
      predecessorExternalId,
      successorExternalId,
      type: dependencyType(item.tipo),
      lag: numberValue(item.lag_dias),
    };
  });

  const cpm = cpmResult ? payload(cpmResult) : {};
  const criticalPath = Array.isArray(cpm.caminho_critico)
    ? cpm.caminho_critico.filter((value): value is string => typeof value === "string")
    : activities.filter(activity => activity.critical).map(activity => activity.externalId);
  const totalDurationDays = typeof cpm.duracao_total_dias === "number" ? cpm.duracao_total_dias : null;
  return { projectExternalId, wbsNodes, activities, dependencies, criticalPath, totalDurationDays };
}
