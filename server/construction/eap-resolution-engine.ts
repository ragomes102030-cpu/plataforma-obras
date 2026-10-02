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
      const parentCode =
        issueNodes.find(node => node.parentCode)?.parentCode ??
        (codes.length >= 3 ? codes[codes.length - 1]!.split(".").slice(0, -1).join(".") : null);
      const affectedCodes = issueNodes.map(node => node.code).sort();
      const key = `scope_overlap:${parentCode ?? "root"}:${affectedCodes.join(",")}`;

      let group = groups.get(key);
      if (!group) {
        group = {
          id: `GRP-${groups.size + 1}`,
          kind: "scope_overlap",
          parentCode: parentCode ?? null,
          affectedCodes,
          affectedNodeIds: issueNodes.map(node => node.nodeId),
          issueCount: 0,
          problem:
            "Os irmãos possuem evidências de sobreposição textual e precisam ter fronteiras de escopo mutuamente exclusivas.",
          evidence: [],
          requiredAction:
            "Revisar inclusões e exclusões do conjunto, preservando cobertura do pai e separando responsabilidades duplicadas sem inventar escopo.",
          unresolvedDecisions: [],
        };
        groups.set(key, group);
      }

      group.issueCount += 1;
      group.evidence.push(issue.message);
      for (const node of issueNodes) {
        if (!group.affectedCodes.includes(node.code)) group.affectedCodes.push(node.code);
        if (!group.affectedNodeIds.includes(node.nodeId)) group.affectedNodeIds.push(node.nodeId);
      }
      continue;
    }

    const issueNode =
      (issue.entityRef ? nodes.find(node => String(node.nodeId) === String(issue.entityRef)) : undefined) ??
      issueNodes[0];

    if (issue.code === "eap_leaf_not_ready" && issueNode) {
      const missing = leafMissingFields(issueNode);
      const key = `missing_dictionary:${issueNode.nodeId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: `GRP-${groups.size + 1}`,
          kind: "missing_dictionary",
          parentCode: issueNode.parentCode,
          affectedCodes: [issueNode.code],
          affectedNodeIds: [issueNode.nodeId],
          issueCount: 1,
          problem: `${issueNode.code} ainda não possui todos os campos necessários do dicionário da EAP.`,
          evidence: [issue.message],
          requiredAction:
            "Preencher os campos de escopo que podem ser determinados pelos dados da obra e separar explicitamente as decisões que dependem do engenheiro.",
          unresolvedDecisions: missing.includes("responsável")
            ? ["Definir responsável do pacote com base em uma pessoa/equipe real da obra."]
            : [],
        });
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