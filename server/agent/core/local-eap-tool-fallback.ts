import type { AgentProjectContext } from "../../agent";
import type { EapScopeNode } from "../../construction/eap-validator";
import { analyzeEapLocally } from "./engineering-capabilities";

type LocalEapNode = NonNullable<NonNullable<AgentProjectContext["evidence"]>["eapSnapshot"]>[number];

function normalizeNodes(nodes: LocalEapNode[]): EapScopeNode[] {
  return nodes.map((node, index) => ({
    id: node.id,
    projectId: 0,
    externalId: null,
    externalUid: null,
    parentId: node.parentId,
    code: String(node.code ?? ""),
    name: String(node.name ?? ""),
    level: Number(node.level ?? 0),
    nodeType: (["grupo", "pacote", "entrega"].includes(node.nodeType)
      ? node.nodeType
      : "pacote") as EapScopeNode["nodeType"],
    unit: node.unit ?? null,
    plannedQuantity: node.plannedQuantity ?? null,
    description: node.description ?? null,
    inclusions: node.inclusions ?? null,
    exclusions: node.exclusions ?? null,
    location: node.location ?? null,
    responsible: node.responsible ?? null,
    acceptanceCriteria: node.acceptanceCriteria ?? null,
    scopeStatus: node.scopeStatus ?? null,
    decompositionBasis: node.decompositionBasis ?? null,
    sortOrder: index,
  }));
}

function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

export function resolveLocalEapToolFallback(
  toolName: string,
  context: AgentProjectContext
): string | null {
  const snapshot = context.evidence?.eapSnapshot;
  if (!Array.isArray(snapshot)) return null;

  const nodes = normalizeNodes(snapshot);
  const childIds = new Set(nodes.map(node => node.parentId).filter((id): id is number | string => id !== null));
  const leaves = nodes.filter(node => !childIds.has(node.id));
  const missingDictionaryFields = [
    "description",
    "inclusions",
    "exclusions",
    "location",
    "responsible",
    "acceptanceCriteria",
    "unit",
    "plannedQuantity",
  ] as const;
  const completeLeaves = leaves.filter(node =>
    missingDictionaryFields.every(field => isFilled(node[field]))
  );
  const mcpNote = "O MCP externo desta obra não está vinculado; resultado calculado a partir do snapshot local persistido.";

  switch (toolName) {
    case "get_eap_tree":
      return JSON.stringify({
        status: "ok",
        source: "local_db",
        fallback: true,
        mcpStatus: "mcp_sem_vinculo",
        message: mcpNote,
        nodeCount: nodes.length,
        nodes,
      });

    case "validar_estrutura": {
      const validation = analyzeEapLocally(nodes);
      return JSON.stringify({
        ...validation,
        source: "local_db",
        fallback: true,
        mcpStatus: "mcp_sem_vinculo",
        message: mcpNote,
        leaves: leaves.length,
        completeLeaves: completeLeaves.length,
        dictionaryCoveragePercent: leaves.length ? Math.round((completeLeaves.length / leaves.length) * 100) : null,
      });
    }

    case "pacotes_sem_dono": {
      const unassigned = leaves.filter(node => !isFilled(node.responsible));
      return JSON.stringify({
        status: "ok",
        source: "local_db",
        fallback: true,
        mcpStatus: "mcp_sem_vinculo",
        message: mcpNote,
        leafCount: leaves.length,
        unassignedCount: unassigned.length,
        unassigned: unassigned.map(node => ({ id: node.id, code: node.code, name: node.name })),
      });
    }

    case "resumo_quantitativos": {
      const withQuantity = leaves.filter(node => isFilled(node.plannedQuantity) && Number(node.plannedQuantity) > 0);
      const withUnit = leaves.filter(node => isFilled(node.unit));
      return JSON.stringify({
        status: "ok",
        source: "local_db",
        fallback: true,
        mcpStatus: "mcp_sem_vinculo",
        message: mcpNote,
        nodeCount: nodes.length,
        leafCount: leaves.length,
        leavesWithQuantity: withQuantity.length,
        leavesWithoutQuantity: leaves.length - withQuantity.length,
        leavesWithUnit: withUnit.length,
        leavesWithoutUnit: leaves.length - withUnit.length,
        quantities: withQuantity.map(node => ({ code: node.code, name: node.name, unit: node.unit, plannedQuantity: node.plannedQuantity })),
      });
    }

    case "listar_escopo":
      return JSON.stringify({
        status: "description_only",
        source: "local_db",
        fallback: true,
        mcpStatus: "mcp_sem_vinculo",
        project: {
          code: context.project.code,
          name: context.project.name,
          location: context.project.location,
          tipoDeObra: context.project.tipoDeObra ?? null,
          descricao: context.project.descricao ?? null,
        },
        structuredItems: [],
        message: "A descrição local da obra está disponível, mas não há itens estruturados de escopo ou vínculos escopo↔EAP no contexto local. Não inferir cobertura percentual a partir apenas do texto.",
      });

    case "validar_regra_100_porcento":
      return JSON.stringify({
        status: "indecidivel",
        source: "local_db",
        fallback: true,
        mcpStatus: "mcp_sem_vinculo",
        coveragePercent: null,
        scopeItemCount: null,
        linkedScopeItemCount: null,
        message: "A regra dos 100% não pode ser comprovada sem itens estruturados de escopo e vínculos escopo↔EAP. A descrição textual não fornece denominador auditável. Não classificar como aprovado ou reprovado.",
        localSnapshot: { nodeCount: nodes.length, leafCount: leaves.length },
      });

    default:
      return null;
  }
}
