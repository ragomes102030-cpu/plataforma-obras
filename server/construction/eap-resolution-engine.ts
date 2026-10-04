export type EapResolutionNode = {
  code: string;
  nodeId: number;
  name: string;
  parentCode: string | null;
  description?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  responsible?: string | null;
  acceptanceCriteria?: string | null;
};

export type EapResolutionIssue = {
  code: string;
  message: string;
  entityRef?: string;
};

export type EapResolutionGroup = {
  id: string;
  kind: "scope_overlap" | "missing_dictionary" | "structure" | "other";
  parentCode: string | null;
  affectedCodes: string[];
  affectedNodeIds: number[];
  issueCount: number;
  problem: string;
  evidence: string[];
  requiredAction: string;
  unresolvedDecisions: string[];
};

const CODE_RE = /\b\d+(?:\.\d+)+\b/g;

function extractCodes(message: string): string[] {
  return Array.from(new Set(message.match(CODE_RE) ?? []));
}

function leafMissingFields(node: EapResolutionNode): string[] {
  const missing: string[] = [];
  if (!node.description?.trim()) missing.push("descrição/escopo");
  if (!node.inclusions?.trim()) missing.push("inclusões");
  if (!node.exclusions?.trim()) missing.push("exclusões");
  if (!node.responsible?.trim()) missing.push("responsável");
  if (!node.acceptanceCriteria?.trim()) missing.push("critério de aceitação");
  return missing;
}

export function findUncoveredEapResolutionGroups(
  plan: EapResolutionGroup[],
  proposedNodes: Array<{
    operation: "create" | "update" | "move" | "remove";
    nodeId?: number;
    description?: string | null;
    inclusions?: string | null;
    exclusions?: string | null;
    responsible?: string | null;
    acceptanceCriteria?: string | null;
    decompositionBasis?: string;
  }>
): EapResolutionGroup[] {
  const updates = proposedNodes.filter(node => node.operation === "update");

  return plan.filter(group => {
    const touchesGroup = (node: (typeof updates)[number]) =>
      node.nodeId != null && group.affectedNodeIds.includes(node.nodeId);

    if (group.kind === "scope_overlap") {
      return !updates.some(
        node =>
          touchesGroup(node) &&
          Boolean(
            node.inclusions?.trim() ||
            node.exclusions?.trim() ||
            node.description?.trim()
          )
      );
    }

    if (group.kind === "missing_dictionary") {
      const evidence = group.evidence.join(" ");
      const requiresConcreteUpdate =
        /descrição|inclusões|exclusões|critério de aceitação|base de decomposição/i.test(
          evidence
        );
      return (
        requiresConcreteUpdate &&
        !updates.some(node => touchesGroup(node))
      );
    }

    return false;
  });
}

export function buildEapResolutionPlan(
  nodes: EapResolutionNode[],
  issues: EapResolutionIssue[]
): EapResolutionGroup[] {
  const byCode = new Map(nodes.map(node => [node.code, node]));
  const groups = new Map<string, EapResolutionGroup>();

  for (const issue of issues) {
    const codes = extractCodes(issue.message);
    const issueNodes = codes
      .map(code => byCode.get(code))
      .filter((node): node is EapResolutionNode => Boolean(node));

    const overlap =
      issue.code === "eap_scope_overlap_evidence" ||
      /sobreposição|responsabilidades duplicadas/i.test(issue.message);

    if (overlap && issueNodes.length >= 2) {
      const lastCode = codes.at(-1);
      const lastNode = lastCode ? byCode.get(lastCode) : undefined;
      const siblingNodes =
        lastNode &&
        issueNodes.length >= 3 &&
        issueNodes.slice(0, -1).every(node => node.parentCode === lastNode.code)
          ? issueNodes.slice(0, -1)
          : issueNodes;

      const parentCode =
        lastNode && siblingNodes.every(node => node.parentCode === lastNode.code)
          ? lastNode.code
          : siblingNodes[0]?.parentCode ?? null;

      const affectedCodes = siblingNodes.map(node => node.code).sort();
      const key = `scope_overlap:${parentCode ?? "root"}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          id: `GRP-${groups.size + 1}`,
          kind: "scope_overlap",
          parentCode: parentCode ?? null,
          affectedCodes,
          affectedNodeIds: siblingNodes.map(node => node.nodeId),
          issueCount: 0,
          problem:
            `Os irmãos de ${parentCode ?? "estrutura"} possuem evidências de sobreposição textual e precisam ter fronteiras de escopo mutuamente exclusivas.`,
          evidence: [],
          requiredAction:
            "Revisar inclusões e exclusões de todos os irmãos envolvidos, preservando a cobertura do pai e separando responsabilidades duplicadas.",
          unresolvedDecisions: [],
        };
        groups.set(key, group);
      }

      group.issueCount += 1;
      group.evidence.push(issue.message);
      for (const node of siblingNodes) {
        if (!group.affectedCodes.includes(node.code)) group.affectedCodes.push(node.code);
        if (!group.affectedNodeIds.includes(node.nodeId)) group.affectedNodeIds.push(node.nodeId);
      }
      continue;
    }

    const issueNode =
      (issue.entityRef ? nodes.find(node => String(node.nodeId) === String(issue.entityRef)) : undefined) ??
      issueNodes[0];

    if (
      (issue.code === "eap_leaf_not_ready" ||
        issue.code === "eap_decomposition_basis_missing") &&
      issueNode
    ) {
      const parentCode = issueNode.parentCode ?? issueNode.code;
      const key = `missing_dictionary:${parentCode}`;
      let group = groups.get(key);

      if (!group) {
        group = {
          id: `GRP-${groups.size + 1}`,
          kind: "missing_dictionary",
          parentCode: issueNode.parentCode,
          affectedCodes: [issueNode.code],
          affectedNodeIds: [issueNode.nodeId],
          issueCount: 0,
          problem:
            `Há folhas ou nós sob ${parentCode} com campos do dicionário ainda incompletos.`,
          evidence: [],
          requiredAction:
            "Preencher em conjunto os campos de escopo que podem ser determinados pelos dados da obra e separar as decisões que dependem do engenheiro.",
          unresolvedDecisions: [],
        };
        groups.set(key, group);
      }

      group.issueCount += 1;
      group.evidence.push(issue.message);
      if (!group.affectedCodes.includes(issueNode.code)) group.affectedCodes.push(issueNode.code);
      if (!group.affectedNodeIds.includes(issueNode.nodeId)) group.affectedNodeIds.push(issueNode.nodeId);

      const missing = leafMissingFields(issueNode);
      if (
        missing.includes("responsável") &&
        !group.unresolvedDecisions.includes(
          "Definir responsáveis reais dos pacotes de trabalho deste conjunto."
        )
      ) {
        group.unresolvedDecisions.push(
          "Definir responsáveis reais dos pacotes de trabalho deste conjunto."
        );
      }
      continue;
    }

    if (issueNode) {
      const key = `issue:${issue.code}:${issueNode.nodeId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: `GRP-${groups.size + 1}`,
          kind: "other",
          parentCode: issueNode.parentCode,
          affectedCodes: [issueNode.code],
          affectedNodeIds: [issueNode.nodeId],
          issueCount: 1,
          problem: issue.message,
          evidence: [issue.message],
          requiredAction: "Analisar a causa e propor uma correção verificável.",
          unresolvedDecisions: [],
        });
      }
    }
  }

  return Array.from(groups.values()).map(group => ({
    ...group,
    affectedCodes: Array.from(new Set(group.affectedCodes)).sort(),
    affectedNodeIds: Array.from(new Set(group.affectedNodeIds)),
    evidence: Array.from(new Set(group.evidence)).slice(0, 12),
  }));
}