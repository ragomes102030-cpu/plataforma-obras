import type { RegistroCpm } from "./gantt-cpm-validade";
import { orientarFluxoPlanejamento } from "./planning-guidance";

type Plano = {
  eapApproved: boolean;
  canCreateActivities?: boolean;
  currentVersionNumber: number | null;
  activities: readonly (RegistroCpm & { exemplo?: number | null })[];
  networkValidation: { valid: boolean; issues: readonly { message: string }[] } | null;
  baselines: readonly { status: string; versionId: number | null }[];
  approvedVersionId: number | null;
};

/** Orientação da interface baseada no plano relido, sem avançar o agente. */
export function proximoPassoPlanejamento(plano: Plano) {
  const orientacao = orientarFluxoPlanejamento(plano).primaria;
  if (orientacao) return {
    titulo: orientacao.titulo,
    aba: orientacao.abaDestino,
    mensagem: `${orientacao.oQueAconteceu} ${orientacao.porQueBloqueia}`,
    orientacao,
  };
  return {
    titulo: "Acompanhar execução", aba: "producao" as const,
    mensagem: "Baseline vigente registrada. Acompanhe produção, restrições e desvios do planejamento.",
    orientacao: null,
  };
}
