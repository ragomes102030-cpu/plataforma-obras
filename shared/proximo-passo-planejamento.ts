import { avaliarCpmGantt, type RegistroCpm } from "./gantt-cpm-validade";

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
  const versao = plano.currentVersionNumber ? ` v${plano.currentVersionNumber}` : "";
  const atividades = plano.activities.filter(a => Number(a.exemplo ?? 0) !== 1);
  if (!plano.eapApproved && !plano.canCreateActivities) return {
    titulo: `Revisar EAP${versao}`, aba: "eap" as const,
    mensagem: "Revise o escopo e aprove a versão atual para liberar a baseline do cronograma.",
  };
  if (!atividades.length) return {
    titulo: "Definir atividades", aba: "atividades" as const,
    mensagem: "A EAP está aprovada. Defina atividades e durações fundamentadas para os pacotes.",
  };
  const cpm = avaliarCpmGantt(atividades);
  if (cpm.duracoesInvalidas) return {
    titulo: "Completar durações", aba: "atividades" as const,
    mensagem: `${cpm.duracoesInvalidas} atividade(s) precisam de duração válida.`,
  };
  if (!plano.networkValidation?.valid) return {
    titulo: "Revisar dependências", aba: "dependencias" as const,
    mensagem: plano.networkValidation?.issues[0]?.message ?? "Valide a rede de precedências antes do CPM.",
  };
  if (!cpm.valido) return {
    titulo: "Calcular CPM", aba: "cpm" as const,
    mensagem: "A rede está validada. Calcule o CPM para atualizar datas, folgas e caminho crítico.",
  };
  if (!plano.eapApproved) return {
    titulo: "Revisar versão do plano", aba: "baseline" as const,
    mensagem: "O escopo herdado está preservado e o CPM está atual. Revise e aprove a versão de trabalho para capturar a baseline.",
  };
  const vigentes = plano.baselines.filter(b => b.status === "ativa");
  if (vigentes.length !== 1 || vigentes[0].versionId !== plano.approvedVersionId) return {
    titulo: "Capturar baseline", aba: "baseline" as const,
    mensagem: "EAP aprovada e CPM atual. Revise o cronograma e capture a referência desta versão.",
  };
  return {
    titulo: "Acompanhar execução", aba: "producao" as const,
    mensagem: "Baseline vigente registrada. Acompanhe produção, restrições e desvios do planejamento.",
  };
}
