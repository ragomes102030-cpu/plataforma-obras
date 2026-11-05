type ConsultaDaObra = {
  invalidate: (input: { projectId: number }) => Promise<unknown>;
};

type LeiturasDoPlanejamento = {
  planning: { list: ConsultaDaObra; grade: ConsultaDaObra };
  projects: { wbs: ConsultaDaObra };
  eap: { validateWbsStructure: ConsultaDaObra; eapArquimedesReview: ConsultaDaObra };
  agent: { snapshot: ConsultaDaObra; agentPlanVersions: ConsultaDaObra };
};

/** Uma alteração versionada precisa atualizar o fluxo global e as abas abertas. */
export async function revalidarPlanejamentoDaObra(utils: LeiturasDoPlanejamento, projectId: number) {
  const input = { projectId };
  await Promise.all([
    utils.planning.list.invalidate(input),
    utils.planning.grade.invalidate(input),
    utils.projects.wbs.invalidate(input),
    utils.eap.validateWbsStructure.invalidate(input),
    utils.eap.eapArquimedesReview.invalidate(input),
    utils.agent.snapshot.invalidate(input),
    utils.agent.agentPlanVersions.invalidate(input),
  ]);
}
