import type { wbsNodes } from "../../drizzle/schema";

type EapNode = typeof wbsNodes.$inferSelect;

/** Compara o conteúdo da EAP sem depender dos IDs recriados ao abrir uma versão. */
export function sameEapContent(left: EapNode[], right: EapNode[]) {
  const content = (nodes: EapNode[]) => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return nodes.map(node => ({
      code: node.code,
      parentCode: node.parentId == null ? null : byId.get(node.parentId)?.code ?? null,
      name: node.name,
      description: node.description,
      inclusions: node.inclusions,
      exclusions: node.exclusions,
      location: node.location,
      responsible: node.responsible,
      acceptanceCriteria: node.acceptanceCriteria,
      decompositionBasis: node.decompositionBasis,
      scopeStatus: node.scopeStatus,
      level: node.level,
      nodeType: node.nodeType,
      unit: node.unit,
      plannedQuantity: node.plannedQuantity,
      sortOrder: node.sortOrder,
    })).sort((a, b) => a.code.localeCompare(b.code));
  };
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}
