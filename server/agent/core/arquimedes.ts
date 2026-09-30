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

export function parseEapProposal(raw: string): ArquimedesEapProposal {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Resposta do Arquimedes não é um objeto JSON.");
  const value = parsed as Record<string, unknown>;
  if (value.action !== "propose_eap" || !Array.isArray(value.nodes)) {
    throw new Error("Resposta do Arquimedes não possui o contrato propose_eap.");
  }
  return parsed as ArquimedesEapProposal;
}
