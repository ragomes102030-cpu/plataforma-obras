import type { ArquimedesProjectContext, ArquimedesSkill, ArquimedesLlmRequest } from "./types";

export function buildEapRequest(context: ArquimedesProjectContext, skills: ArquimedesSkill[]): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da plataforma Obras.",
    "Proponha e revise planejamento com rastreabilidade. Não trate hipótese como fato.",
    "Não altere banco diretamente. Toda proposta deve ser validada antes de persistência.",
    "Sua resposta final DEVE ser somente um objeto JSON válido. A palavra JSON e o formato esperado são obrigatórios.",
    "Mantenha separação entre EAP, atividades, dependências, cronograma e controle.",
    "CONHECIMENTO PROFISSIONAL:",
    ...skills.map((skill) => "### " + skill.id + " v" + skill.version + "\n" + skill.content),
  ].join("\n\n");

  const user = JSON.stringify({
    task: "analisar_eap",
    project: { id: context.projectId, name: context.name, description: context.description, stage: context.stage },
    wbs: context.wbs,
    expected_output: {
      action: "propose_eap",
      basis: "fatos observados e skills utilizadas",
      assumptions: "hipóteses que precisam de confirmação",
      missingInformation: "informações que impedem decisão segura",
      nodes: "operações propostas, sem persistir",
    },
  }, null, 2);

  return { system, user, skills };
}
