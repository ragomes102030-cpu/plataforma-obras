import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { agentMemories, projects, wbsNodes } from "../../drizzle/schema";
import type { ArquimedesEapProposal } from "../agent/core/types";
import { getDb } from "../db";
import { validateAndNormalizeEapProposal, validateEap } from "./eap-validator";
import { ensureWritablePlanVersion } from "./plan-versions";
import { badRequest, conflict, forbidden } from "../_core/errors";

const EAP_MEASUREMENT_UNITS = ["m²", "m³", "ml", "un", "pt", "vb", "conj", "kg"] as const;

export const eapProposalInput = z.object({
  action: z.literal("propose_eap"),
  basis: z.array(z.string().max(500)).max(50),
  assumptions: z.array(z.string().max(1000)).max(100),
  missingInformation: z.array(z.string().max(1000)).max(100),
  nodes: z.array(z.object({
    operation: z.enum(["create", "update", "move", "remove"]),
    nodeId: z.number().int().positive().optional(),
    parentCode: z.string().trim().max(32).nullable(),
    code: z.string().trim().max(32).optional(),
    name: z.string().trim().min(2).max(220),
    nodeType: z.enum(["grupo", "pacote", "entrega"]),
    location: z.string().trim().max(180).nullable().optional(),
    unit: z.string().trim().max(32).nullable().optional().refine(
      value => value == null || EAP_MEASUREMENT_UNITS.includes(value as (typeof EAP_MEASUREMENT_UNITS)[number]),
      "Unidade fora do vocabulário de medição aceito para EAP.",
    ),
    plannedQuantity: z.number().min(0).max(99_999_999_999.999)
      .refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7)
      .nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    inclusions: z.string().trim().max(5000).nullable().optional(),
    exclusions: z.string().trim().max(5000).nullable().optional(),
    responsible: z.string().trim().max(180).nullable().optional(),
    acceptanceCriteria: z.string().trim().max(5000).nullable().optional(),
    decompositionBasis: z.enum(["project", "deliverable", "system", "discipline", "location", "phase", "component", "other"]).nullable().optional(),
    rationale: z.string().trim().max(2000),
  })).min(1).max(500),
});

/** Aplica uma proposta validada somente na versão de trabalho da obra. */
export async function applyEapProposalToDraft(args: {
  projectId: number;
  userId: number;
  proposal: ArquimedesEapProposal;
}) {
  const validatedInput = eapProposalInput.safeParse(args.proposal);
  if (!validatedInput.success) throw badRequest("A proposta estruturada da EAP está incompleta ou fora do contrato.");
  args = { ...args, proposal: validatedInput.data as ArquimedesEapProposal };
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado.");
  const [accessibleProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, args.projectId), eq(projects.ownerUserId, args.userId)))
    .limit(1);
  if (!accessibleProject) throw forbidden("Obra não encontrada ou sem permissão de acesso.");

  const writable = await ensureWritablePlanVersion(args.projectId, args.userId);
  const currentNodes = await db
    .select()
    .from(wbsNodes)
    .where(and(eq(wbsNodes.projectId, args.projectId), eq(wbsNodes.versionId, writable.id)));
  const proposal = validateAndNormalizeEapProposal(currentNodes, args.proposal);
  if (!proposal.validation?.valid) {
    throw badRequest("A proposta mudou ou contém inconsistências. Atualize a análise da EAP antes de aplicá-la.");
  }

  const applied = await db.transaction(async tx => {
    const byCode = new Map(currentNodes.map(node => [node.code, node]));
    let created = 0;
    let updated = 0;
    for (const item of proposal.nodes) {
      if (item.operation === "create") {
        const code = item.code;
        if (!code || byCode.has(code)) throw conflict("O código proposto foi ocupado durante a revisão. Atualize a análise da EAP e tente novamente.");
        const parent = item.parentCode ? byCode.get(item.parentCode) : null;
        if (item.parentCode && !parent) throw conflict("O pai da proposta mudou durante a revisão. Atualize a análise da EAP e tente novamente.");
        const [row] = await tx.insert(wbsNodes).values({
          projectId: args.projectId,
          parentId: parent?.id ?? null,
          code,
          name: item.name,
          level: code.split(".").length,
          nodeType: item.nodeType,
          unit: item.unit ?? null,
          plannedQuantity: item.plannedQuantity == null ? null : item.plannedQuantity.toFixed(3),
          decompositionBasis: item.decompositionBasis ?? null,
          description: item.description ?? null,
          inclusions: item.inclusions ?? null,
          exclusions: item.exclusions ?? null,
          location: item.location ?? null,
          responsible: item.responsible ?? null,
          acceptanceCriteria: item.acceptanceCriteria ?? null,
          scopeStatus: "rascunho",
          sortOrder: currentNodes.length + created,
          versionId: writable.id,
        }).returning({ id: wbsNodes.id });
        byCode.set(code, { id: row.id, code } as typeof currentNodes[number]);
        created++;
      } else if (item.operation === "update") {
        const existing = item.nodeId == null ? undefined : currentNodes.find(node => node.id === item.nodeId);
        if (!existing) throw conflict("O item da proposta não pertence mais à versão de trabalho. Atualize a análise da EAP.");
        await tx.update(wbsNodes).set({
          name: item.name,
          nodeType: item.nodeType,
          unit: item.unit !== undefined ? item.unit : existing.unit,
          plannedQuantity: item.plannedQuantity !== undefined ? item.plannedQuantity == null ? null : item.plannedQuantity.toFixed(3) : existing.plannedQuantity,
          description: item.description !== undefined ? item.description : existing.description,
          inclusions: item.inclusions !== undefined ? item.inclusions : existing.inclusions,
          exclusions: item.exclusions !== undefined ? item.exclusions : existing.exclusions,
          location: item.location !== undefined ? item.location : existing.location,
          responsible: item.responsible !== undefined ? item.responsible : existing.responsible,
          acceptanceCriteria: item.acceptanceCriteria !== undefined ? item.acceptanceCriteria : existing.acceptanceCriteria,
          decompositionBasis: item.decompositionBasis !== undefined ? item.decompositionBasis : existing.decompositionBasis,
        }).where(and(eq(wbsNodes.id, existing.id), eq(wbsNodes.projectId, args.projectId), eq(wbsNodes.versionId, writable.id)));
        updated++;
      }
    }
    await tx.update(agentMemories).set({ status: "obsolete", updatedAt: new Date() }).where(and(
      eq(agentMemories.projectId, args.projectId),
      eq(agentMemories.ownerUserId, args.userId),
      eq(agentMemories.category, "eap_proposal"),
      eq(agentMemories.status, "proposed"),
    ));
    return {
      applied: true as const,
      created,
      updated,
      versionId: writable.id,
      versionNumber: writable.versionNumber,
      baselineCreated: false as const,
      approved: false as const,
      validation: proposal.validation,
    };
  });
  const persistedNodes = await db
    .select()
    .from(wbsNodes)
    .where(and(eq(wbsNodes.projectId, args.projectId), eq(wbsNodes.versionId, writable.id)));
  const structuralValidation = validateEap(persistedNodes);
  const persistedByCode = new Map(persistedNodes.map(node => [node.code, node]));
  const persistedById = new Map(persistedNodes.map(node => [node.id, node]));
  const parentIds = new Set(persistedNodes.flatMap(node => node.parentId == null ? [] : [node.parentId]));
  const parentCodeById = new Map(persistedNodes.map(node => [node.id, node.parentId == null ? null : persistedById.get(node.parentId)?.code ?? null]));
  const expectedChangesVerified = proposal.nodes.every(item => {
    const persisted = item.operation === "create"
      ? (item.code ? persistedByCode.get(item.code) : undefined)
      : item.operation === "update"
        ? persistedById.get(item.nodeId ?? -1)
        : undefined;
    if (!persisted) return false;
    if (persisted.name !== item.name || persisted.nodeType !== item.nodeType) return false;
    if (item.operation === "create" && parentCodeById.get(persisted.id) !== item.parentCode) return false;
    if (item.unit !== undefined && (persisted.unit ?? null) !== item.unit) return false;
    if (item.plannedQuantity !== undefined) {
      const actualQuantity = persisted.plannedQuantity == null ? null : Number(persisted.plannedQuantity);
      if (actualQuantity !== item.plannedQuantity) return false;
    }
    for (const field of ["description", "inclusions", "exclusions", "location", "responsible", "acceptanceCriteria", "decompositionBasis"] as const) {
      if (item[field] !== undefined && (persisted[field] ?? null) !== item[field]) return false;
    }
    return true;
  });
  return {
    ...applied,
    verification: {
      persistenceVerified: persistedNodes.length === currentNodes.length + applied.created && expectedChangesVerified,
      expectedChangesVerified,
      nodeCount: persistedNodes.length,
      leafCount: persistedNodes.filter(node => !parentIds.has(node.id)).length,
      structuralErrors: structuralValidation.issues.filter(issue => issue.severity === "error").length,
      structuralWarnings: structuralValidation.issues.filter(issue => issue.severity === "warning").length,
    },
  };
}
