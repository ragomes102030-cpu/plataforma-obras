import { z } from "zod";
import { loadEapSkills } from "./skill-loader";
import { buildEapRequest } from "./prompt-builder";
import type { ArquimedesEapProposal, ArquimedesLlmProvider, ArquimedesProjectContext } from "./types";

export async function proposeEapWithArquimedes(
  context: ArquimedesProjectContext,
  provider: ArquimedesLlmProvider,
): Promise<{ raw: string; request: ReturnType<typeof buildEapRequest> }> {
  const skills = await loadEapSkills();
  const request = buildEapRequest(context, skills);
  const raw = await provider.complete(request);
  return { raw, request };
}

const eapProposalSchema = z.object({
  action: z.literal("propose_eap"),
  basis: z.array(z.string()).max(20),
  assumptions: z.array(z.string()).max(30),
  missingInformation: z.array(z.string()).max(30),
  nodes: z.array(
    z.object({
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
    })
  ).max(120),
});

export function parseEapProposal(raw: string): ArquimedesEapProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON inválido.";
    throw new Error(
      "O provedor devolveu uma proposta EAP incompleta ou inválida (" + message + "). A resposta não foi aplicada à obra."
    );
  }

  const result = eapProposalSchema.safeParse(parsed);
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

  return result.data;
}
