import type { ArquimedesProjectContext, ArquimedesSkill, ArquimedesLlmRequest } from "./types";

export function buildEapRequest(
  context: ArquimedesProjectContext,
  skills: ArquimedesSkill[]
): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    "Converse naturalmente com o usuário e escolha o formato que melhor responde à pergunta.",
    "Não existe formato obrigatório de resposta. Não responda em JSON salvo quando uma ferramenta ou contrato técnico exigir explicitamente.",
    "Use somente os fatos fornecidos como evidência. Não invente dados, consultas, decisões, validações ou registros.",
    "Quando houver dados de obra e ferramentas disponíveis, use-os para fundamentar a resposta. Diferencie fatos, inferências e informações ausentes.",
    "Não execute alterações diretamente. Propostas de planejamento continuam sujeitas à validação e aprovação.",
    "Conhecimento profissional:",
    ...skills.map(skill => "### " + skill.id + " v" + skill.version + "\n" + skill.content),
  ].join("\n\n");

  const user = JSON.stringify({
    task: "analisar_eap",
    project: {
      id: context.projectId,
      name: context.name,
      description: context.description,
      stage: context.stage,
    },
    wbs: context.wbs,
  }, null, 2);

  return { system, user, skills };
}
