import { z } from "zod";
import {
  buildEapMacroRequest,
  buildEapRequest,
  buildEapSubtreeRequest,
} from "./prompt-builder";
import { loadEapSkills } from "./skill-loader";
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
  return {
    proposal,
    request: macroRequest,
    raw: JSON.stringify(proposal),
  };
}

export async function proposeEapWithArquimedes(
  context: ArquimedesProjectContext,
  provider: ArquimedesLlmProvider,
): Promise<{ raw: string; request: ArquimedesLlmRequest }> {
  const skills = await loadEapSkills();

  if (context.wbs.length === 0) {
    return proposeEapIncrementally(context, skills, provider);
  }

  const request = buildEapRequest(context, skills);
  const raw = await provider.complete(request);
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
  rationale: z.string().trim().min(1).max(320),
});

const eapReviewSchema = z.object({
  basis: stringListSchema(20, 3000),
  assumptions: stringListSchema(30, 2000),
  missingInformation: stringListSchema(30, 1200),
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

  const result = eapReviewSchema.safeParse(parsed);
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
    nodes: result.data.nodes,
  };
}
