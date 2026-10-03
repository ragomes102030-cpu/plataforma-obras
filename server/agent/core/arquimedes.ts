import { z } from "zod";
import {
  buildEapMacroRequest,
  buildEapRequest,
  buildEapSubtreeRequest,
  buildEapSelfHealingRequest,
  type EapReviewAudit,
} from "./prompt-builder";
import { loadEapSkills } from "./skill-loader";
import { validateAndNormalizeEapProposal } from "../../construction/eap-validator";
import { validateEapForBaseline } from "../../construction/eap-approval-validator";
import type {
  ArquimedesEapProposal,
  ArquimedesLlmProvider,
  ArquimedesLlmRequest,
  ArquimedesProjectContext,
} from "./types";

const MAX_INCREMENTAL_NODES = 120;
const MAX_MACRO_ROOTS = 8;
const MAX_SUBTREE_NODES = 20;
const SUBTREE_CONCURRENCY = 2;

function auditExistingEap(context: ArquimedesProjectContext): EapReviewAudit {
  const nodes = context.wbs;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const childrenByParent = new Map<number, typeof nodes>();

  for (const node of nodes) {
    if (node.parentId != null) {
      const children = childrenByParent.get(node.parentId) ?? [];
      children.push(node);
      childrenByParent.set(node.parentId, children);
    }
  }

  const codeCounts = new Map<string, number>();
  for (const node of nodes) {
    codeCounts.set(node.code, (codeCounts.get(node.code) ?? 0) + 1);
  }

  const issues: EapReviewAudit["issues"] = [];

  for (const node of nodes) {
    if ((codeCounts.get(node.code) ?? 0) > 1) {
      issues.push({
        code: node.code,
        type: "duplicate_code",
        detail: "Código repetido na EAP.",
      });
    }

    if (node.parentId != null && !byId.has(node.parentId)) {
      issues.push({
        code: node.code,
        type: "missing_parent",
        detail: "O pai informado não existe na EAP carregada.",
      });
    }

    const parent = node.parentId == null ? null : byId.get(node.parentId);
    if (parent && node.level !== parent.level + 1) {
      issues.push({
        code: node.code,
        type: "invalid_level",
        detail: "O nível do nó não corresponde ao nível do pai.",
      });
    }
  }

  const leaves = nodes.filter(node => !childrenByParent.has(node.id));
  const candidateIds = new Set<number>();

  // Folhas e seus pais são os principais candidatos para julgamento de
  // granularidade e cobertura de escopo. Achados estruturais também entram.
  for (const leaf of leaves) {
    candidateIds.add(leaf.id);
    if (leaf.parentId != null) candidateIds.add(leaf.parentId);
  }

  for (const issue of issues) {
    const node = nodes.find(item => item.code === issue.code);
    if (node) {
      candidateIds.add(node.id);
      if (node.parentId != null) candidateIds.add(node.parentId);
    }
  }

  const candidateNodes = nodes
    .filter(node => candidateIds.has(node.id))
    .sort((left, right) => left.id - right.id)
    .slice(0, 48)
    .map(node => ({
      ...node,
      description: node.description?.slice(0, 800),
      inclusions: node.inclusions?.slice(0, 800),
      exclusions: node.exclusions?.slice(0, 800),
      acceptanceCriteria: node.acceptanceCriteria?.slice(0, 800),
    }));

  const compactTree = nodes
    .map(node => ({
      id: node.id,
      code: node.code,
      name: node.name,
      parentCode: node.parentId == null ? null : byId.get(node.parentId)?.code ?? null,
      level: node.level,
      nodeType: node.nodeType,
    }))
    .sort((left, right) => compareEapCodes(left.code, right.code));

  return {
    summary: {
      totalNodes: nodes.length,
      leafNodes: leaves.length,
      structuralIssues: issues.length,
      candidateNodes: candidateNodes.length,
    },
    issues: Array.from(
      new Map(issues.map(issue => [issue.code + ":" + issue.type, issue])).values()
    ).slice(0, 40),
    candidateNodes,
    compactTree,
  };
}

function compareEapCodes(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const av = a[index] ?? -1;
    const bv = b[index] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      () => worker()
    )
  );

  return results;
}

function validateIncrementalTree(
  macro: ArquimedesEapProposal,
  expansions: ArquimedesEapProposal[],
): ArquimedesEapProposal {
  if (
    macro.nodes.length < 3 ||
    macro.nodes.length > MAX_MACRO_ROOTS ||
    macro.nodes.some(
      node =>
        node.operation !== "create" ||
        node.parentCode !== null ||
        node.nodeType !== "grupo" ||
        !node.code ||
        !/^\d+$/.test(node.code)
    )
  ) {
    throw new Error(
      "A macroestrutura da EAP não respeitou o contrato de raízes simples, distintas e sem folhas detalhadas."
    );
  }

  const rootCodes = new Set<string>();
  for (const node of macro.nodes) {
    if (rootCodes.has(node.code!)) {
      throw new Error("A macroestrutura repetiu o código de raiz " + node.code + ".");
    }
    rootCodes.add(node.code!);
  }

  const combinedNodes: ArquimedesEapProposal["nodes"] = [...macro.nodes];
  const combinedCodes = new Set(rootCodes);

  for (let index = 0; index < expansions.length; index++) {
    const root = macro.nodes[index];
    const expansion = expansions[index];

    for (const node of expansion.nodes) {
      if (
        node.operation !== "create" ||
        !node.code ||
        !node.parentCode ||
        !node.code.startsWith(root.code + ".")
      ) {
        throw new Error(
          "O ramo " +
            root.code +
            " retornou um nó fora da sua subárvore ou não marcado como criação."
        );
      }

      if (combinedCodes.has(node.code)) {
        throw new Error("A proposta incremental repetiu o código " + node.code + ".");
      }

      const parent = node.parentCode;
      if (
        parent !== root.code &&
        !expansion.nodes.some(candidate => candidate.code === parent)
      ) {
        throw new Error(
          "O nó " +
            node.code +
            " referencia " +
            parent +
            ", mas esse pai não foi produzido no ramo " +
            root.code +
            "."
        );
      }

      if (node.code.split(".").length !== parent.split(".").length + 1) {
        throw new Error(
          "O nó " +
            node.code +
            " não está no nível imediatamente abaixo de " +
            parent +
            "."
        );
      }

      combinedCodes.add(node.code);
      combinedNodes.push(node);
    }
  }

  if (combinedNodes.length > MAX_INCREMENTAL_NODES) {
    throw new Error(
      "A proposta incremental gerou " +
        combinedNodes.length +
        " nós, acima do limite seguro de " +
        MAX_INCREMENTAL_NODES +
        "."
    );
  }

  return {
    action: "propose_eap",
    basis: Array.from(
      new Set([
        ...macro.basis,
        ...expansions.flatMap(expansion => expansion.basis),
      ])
    ).slice(0, 20),
    assumptions: Array.from(
      new Set([
        ...macro.assumptions,
        ...expansions.flatMap(expansion => expansion.assumptions),
      ])
    ).slice(0, 30),
    missingInformation: Array.from(
      new Set([
        ...macro.missingInformation,
        ...expansions.flatMap(expansion => expansion.missingInformation),
      ])
    ).slice(0, 30),
    nodes: [...combinedNodes].sort((left, right) =>
      compareEapCodes(left.code ?? "", right.code ?? "")
    ),
  };
}

function proposalToScopeNodes(proposal: ArquimedesEapProposal, projectId: number) {
  const byCode = new Map<string, number>();
  return proposal.nodes
    .filter(node => node.operation === "create" && node.code)
    .map((node, index) => {
      const id = -(index + 1);
      byCode.set(node.code!, id);
      return { node, id };
    })
    .map(({ node, id }) => ({
      id,
      projectId,
      externalId: null,
      externalUid: null,
      parentId: node.parentCode ? (byCode.get(node.parentCode) ?? null) : null,
      code: node.code!,
      name: node.name,
      level: node.code!.split(".").length,
      nodeType: node.nodeType,
      unit: node.unit ?? null,
      plannedQuantity: node.plannedQuantity ?? null,
      sortOrder: Math.abs(id),
      description: node.description ?? null,
      inclusions: node.inclusions ?? null,
      exclusions: node.exclusions ?? null,
      location: node.location ?? null,
      responsible: node.responsible ?? null,
      acceptanceCriteria: node.acceptanceCriteria ?? null,
      decompositionBasis: node.decompositionBasis ?? null,
      scopeStatus: "rascunho",
    }));
}

function validateGeneratedEap(proposal: ArquimedesEapProposal, projectId: number) {
  const normalized = validateAndNormalizeEapProposal([], proposal);
  const scopeNodes = proposalToScopeNodes(normalized, projectId);
  const baseline = validateEapForBaseline(scopeNodes);
  const issues = [
    ...(normalized.validation?.issues ?? []),
    ...baseline.issues,
  ];
  const deduped = Array.from(new Map(
    issues.map(issue => [
      issue.code + ":" + (issue.entityRef ?? "") + ":" + issue.message,
      issue,
    ])
  ).values());
  return {
    proposal: normalized,
    nodes: scopeNodes,
    valid: !deduped.some(issue => issue.severity === "error") &&
      baseline.readyForBaseline,
    issues: deduped,
  };
}

async function selfHealGeneratedEap(
  context: ArquimedesProjectContext,
  skills: Awaited<ReturnType<typeof loadEapSkills>>,
  provider: ArquimedesLlmProvider,
  initialProposal: ArquimedesEapProposal,
) {
  let proposal = initialProposal;
  const history: Array<{
    attempt: number;
    issueCodes: string[];
    corrected: boolean;
  }> = [];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const validation = validateGeneratedEap(proposal, context.projectId);
    const issueCodes = Array.from(new Set(validation.issues.map(issue => issue.code)));
    if (validation.valid) {
      return {
        proposal: validation.proposal,
        history,
        finalValidation: validation,
        healed: history.length > 0,
      };
    }

    if (attempt === 3) {
      history.push({
        attempt,
        issueCodes,
        corrected: false,
      });
      return {
        proposal: validation.proposal,
        history,
        finalValidation: validation,
        healed: history.some(item => item.corrected),
      };
    }

    history.push({
      attempt,
      issueCodes,
      corrected: false,
    });

    const repairRequest = buildEapSelfHealingRequest(
      context,
      skills,
      validation.proposal,
      validation.issues,
      attempt
    );
    const repairedRaw = await provider.complete(repairRequest);
    const repaired = parseEapProposal(repairedRaw);
    const repairedValidation = validateGeneratedEap(repaired, context.projectId);
    const repairedCodes = new Set(
      repairedValidation.issues.map(issue => issue.code)
    );
    history[history.length - 1]!.corrected =
      repairedValidation.issues.length < validation.issues.length ||
      issueCodes.some(code => !repairedCodes.has(code));
    proposal = repaired;
  }

  throw new Error("Autocorreção da EAP terminou em estado inesperado.");
}

async function proposeEapIncrementally(
  context: ArquimedesProjectContext,
  skills: Awaited<ReturnType<typeof loadEapSkills>>,
  provider: ArquimedesLlmProvider
) {
  const macroRequest = buildEapMacroRequest(context, skills);
  const macroRaw = await provider.complete(macroRequest);
  const macro = parseEapProposal(macroRaw, "macro");

  const perRootBudget = Math.min(
    MAX_SUBTREE_NODES,
    Math.max(
      8,
      Math.floor(
        (MAX_INCREMENTAL_NODES - macro.nodes.length) /
          Math.max(macro.nodes.length, 1)
      )
    )
  );

  const roots = macro.nodes.map(node => ({
    code: node.code!,
    name: node.name,
    rationale: node.rationale,
  }));

  const macroSummary = roots.map(root => ({
    code: root.code,
    name: root.name,
  }));

  const expansions = await mapWithConcurrency(
    roots,
    SUBTREE_CONCURRENCY,
    async root => {
      const request = buildEapSubtreeRequest(
        context,
        skills,
        root,
        macroSummary,
        perRootBudget
      );
      const raw = await provider.complete(request);
      return parseEapProposal(raw, "subtree", root.code);
    }
  );

  const proposal = validateIncrementalTree(macro, expansions);
  const healed = await selfHealGeneratedEap(context, skills, provider, proposal);
  return {
    proposal: healed.proposal,
    request: macroRequest,
    raw: JSON.stringify(healed.proposal),
    healing: healed,
  };
}

export async function proposeEapWithArquimedes(
  context: ArquimedesProjectContext,
  provider: ArquimedesLlmProvider,
  options: {
    mode?: "analisar" | "resolver_bloqueios";
    resolutionIssues?: Array<{ code: string; message: string; entityRef?: string }>;
    resolutionTargets?: ArquimedesLlmRequest["eapResolutionTargets"];
    resolutionPlan?: ArquimedesLlmRequest["eapResolutionPlan"];
    researchEvidence?: ArquimedesLlmRequest["researchEvidence"];
  } = {},
): Promise<{
  raw: string;
  request: ArquimedesLlmRequest;
  healing?: {
    history: Array<{ attempt: number; issueCodes: string[]; corrected: boolean }>;
    healed: boolean;
    finalValidation: ReturnType<typeof validateGeneratedEap>;
  };
}> {
  const skills = await loadEapSkills();

  if (context.wbs.length === 0) {
    return proposeEapIncrementally(context, skills, provider);
  }

  const request = buildEapRequest(
    context,
    skills,
    undefined,
    options.mode ?? "analisar",
    options.resolutionIssues ?? [],
    options.resolutionTargets ?? [],
    options.resolutionPlan ?? [],
    options.researchEvidence ?? []
  );

  // Contrato de fronteira: a revisão existente sempre precisa chegar ao provider
  // como uma requisição completa. Falhar aqui identifica a origem do problema
  // antes de qualquer chamada ao LLM.
  if (
    !request ||
    typeof request.system !== "string" ||
    typeof request.user !== "string" ||
    !Array.isArray(request.skills)
  ) {
    console.error("[Arquimedes][EAP] requisição inválida antes do provider", {
      hasRequest: Boolean(request),
      hasSystem: typeof request?.system === "string",
      hasUser: typeof request?.user === "string",
      skillsIsArray: Array.isArray(request?.skills),
      wbsNodes: context.wbs.length,
    });
    throw new Error(
      "Falha interna ao montar a requisição estruturada da revisão da EAP. Nenhuma alteração foi aplicada à obra."
    );
  }

  let raw = await provider.complete(request);

  // Uma única tentativa de reparo do contrato, somente para revisão/resolução.
  // Nenhuma alteração é aplicada nesta etapa; o reparo apenas transforma uma
  // resposta fora do schema em JSON canônico antes da validação do servidor.
  if (options.mode === "resolver_bloqueios") {
    try {
      parseEapProposal(raw);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "resposta fora do contrato";
      const repairRequest: ArquimedesLlmRequest = {
        ...request,
        system:
          request.system +
          "\n\nREPARO DE CONTRATO: a resposta anterior não atendeu ao schema. " +
          "Retorne SOMENTE um objeto JSON com basis, assumptions, missingInformation, " +
          "resolutionSummary e nodes (array). Para cada update, use o nodeId exato de resolutionTargets. " +
          "Não acrescente explicações fora do JSON.",
        user:
          request.user +
          "\n\nA RESPOSTA ANTERIOR FALHOU NO CONTRATO: " +
          reason +
          "\nConverta a resposta anterior para o contrato canônico. RESPOSTA ANTERIOR:\n" +
          raw.slice(0, 12000),
        maxTokens: Math.max(request.maxTokens ?? 4096, 8192),
      };
      raw = await provider.complete(repairRequest);
    }
  }

  return { raw, request };
}

const stringListSchema = (max: number, itemMax = 3000) =>
  z.preprocess(
    value => {
      if (value == null) return [];
      if (typeof value === "string") return [value];
      return value;
    },
    z.array(z.string().trim().min(1).max(itemMax)).max(max)
  );

const eapReviewNodeSchema = z.object({
  operation: z.enum(["create", "update", "move", "remove"]),
  nodeId: z.number().int().positive().optional(),
  parentCode: z.string().trim().min(1).max(32).nullable(),
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(2).max(220),
  nodeType: z.enum(["grupo", "pacote", "entrega"]),
  location: z.string().trim().max(180).nullable().optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  plannedQuantity: z.number().min(0).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  inclusions: z.string().trim().max(5000).nullable().optional(),
  exclusions: z.string().trim().max(5000).nullable().optional(),
  responsible: z.string().trim().max(180).nullable().optional(),
  acceptanceCriteria: z.string().trim().max(5000).nullable().optional(),
  decompositionBasis: z.enum([
    "project",
    "deliverable",
    "system",
    "discipline",
    "location",
    "phase",
    "component",
    "other",
  ]).optional(),
  rationale: z.string().trim().min(1).max(320),
});

const eapReviewValidationIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  entityRef: z.string().optional(),
});

const eapReviewSchema = z.object({
  basis: stringListSchema(20, 3000),
  assumptions: stringListSchema(30, 2000),
  missingInformation: stringListSchema(30, 1200),
  resolutionSummary: stringListSchema(20, 600).optional(),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(eapReviewValidationIssueSchema).max(80),
  }).optional(),
  nodes: z.array(eapReviewNodeSchema).max(MAX_INCREMENTAL_NODES),
});

const macroNodeSchema = z.object({
  code: z.string().trim().regex(/^\d+$/).optional(),
  name: z.string().trim().min(2).max(220),
  nodeType: z.enum(["grupo", "pacote", "entrega"]).optional(),
  rationale: z.string().trim().max(320).optional(),
});

const macroResponseSchema = z.object({
  basis: stringListSchema(20, 3000),
  assumptions: stringListSchema(30, 2000),
  missingInformation: stringListSchema(30, 1200),
  nodes: z.array(macroNodeSchema).min(1).max(MAX_MACRO_ROOTS),
});

const subtreeNodeSchema = z.object({
  code: z.string().trim().regex(/^\d+(?:\.\d+)+$/),
  parentCode: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(2).max(220),
  nodeType: z.enum(["grupo", "pacote", "entrega"]).optional(),
  location: z.string().trim().max(180).nullable().optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  plannedQuantity: z.number().min(0).nullable().optional(),
  rationale: z.string().trim().max(320).optional(),
});

const subtreeResponseSchema = z.object({
  basis: stringListSchema(20, 3000),
  assumptions: stringListSchema(30, 2000),
  missingInformation: stringListSchema(30, 1200),
  nodes: z.array(subtreeNodeSchema).max(MAX_SUBTREE_NODES),
});

type EapParseStage = "review" | "macro" | "subtree";

function immediateParentCode(code: string) {
  const parts = code.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : null;
}

function compactResolutionSummary(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.slice(0, 40).map(item => {
    const text = typeof item === "string" ? item.trim() : String(item ?? "").trim();
    if (text.length <= 600) return text;

    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);

    let compact = "";
    for (const sentence of sentences) {
      if ((compact ? compact.length + 1 : 0) + sentence.length > 580) break;
      compact += (compact ? " " : "") + sentence;
    }

    if (!compact) compact = text.slice(0, 580).trim();
    return compact + (compact.length < text.length ? "…" : "");
  });
}

export function parseEapProposal(
  raw: string,
  stage: EapParseStage = "review",
  rootCode?: string
): ArquimedesEapProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON inválido.";
    throw new Error(
      "O provedor devolveu uma proposta EAP incompleta ou inválida (" +
        message +
        "). A resposta não foi aplicada à obra."
    );
  }

  if (stage === "macro") {
    const result = macroResponseSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        "A macroestrutura EAP do Arquimedes não atende ao contrato flexível: " +
          (issue?.path.join(".") || "raiz") +
          " — " +
          (issue?.message || "estrutura inválida") +
          "."
      );
    }

    return {
      action: "propose_eap",
      basis: result.data.basis,
      assumptions: result.data.assumptions,
      missingInformation: result.data.missingInformation,
      nodes: result.data.nodes.map((node, index) => ({
        operation: "create" as const,
        parentCode: null,
        code: node.code ?? String(index + 1),
        name: node.name,
        nodeType: node.nodeType ?? "grupo",
        rationale: node.rationale || "Raiz macro da EAP.",
      })),
    };
  }

  if (stage === "subtree") {
    if (!rootCode) throw new Error("Raiz da subárvore é obrigatória.");
    const result = subtreeResponseSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        "A subárvore EAP do Arquimedes não atende ao contrato flexível: " +
          (issue?.path.join(".") || "raiz") +
          " — " +
          (issue?.message || "estrutura inválida") +
          "."
      );
    }

    return {
      action: "propose_eap",
      basis: result.data.basis,
      assumptions: result.data.assumptions,
      missingInformation: result.data.missingInformation,
      nodes: result.data.nodes.map(node => ({
        operation: "create" as const,
        parentCode: node.parentCode ?? immediateParentCode(node.code),
        code: node.code,
        name: node.name,
        nodeType: node.nodeType ?? "pacote",
        location: node.location,
        unit: node.unit,
        plannedQuantity: node.plannedQuantity,
        rationale: node.rationale || "Pacote gerado a partir do escopo informado.",
      })),
    };
  }

  const normalizedReview =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
      ? (() => {
          const record = parsed as Record<string, unknown>;
          const normalizedSummary = compactResolutionSummary(record.resolutionSummary);
          const withSummary = {
            ...record,
            ...(Array.isArray(normalizedSummary)
              ? { resolutionSummary: normalizedSummary }
              : {}),
          };
          if (Array.isArray(record.nodes)) return withSummary;
          const alternative = record.updates ?? record.corrections ?? record.actions;
          return Array.isArray(alternative)
            ? { ...withSummary, nodes: alternative }
            : withSummary;
        })()
      : parsed;

  const result = eapReviewSchema.safeParse(normalizedReview);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      "A proposta EAP do Arquimedes não atende ao contrato estruturado: " +
        (issue?.path.join(".") || "raiz") +
        " — " +
        (issue?.message || "estrutura inválida") +
        "."
    );
  }

  return {
    action: "propose_eap",
    basis: result.data.basis,
    assumptions: result.data.assumptions,
    missingInformation: result.data.missingInformation,
    ...(result.data.resolutionSummary ? { resolutionSummary: result.data.resolutionSummary } : {}),
    ...(result.data.researchEvidence ? { researchEvidence: result.data.researchEvidence } : {}),
    ...(result.data.validation ? { validation: result.data.validation } : {}),
    nodes: result.data.nodes,
  };
}
