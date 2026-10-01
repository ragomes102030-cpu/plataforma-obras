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
    "Se a EAP estiver vazia ou incompleta, use a descrição da obra como escopo inicial e proponha somente o que puder ser sustentado pelo contexto; marque toda hipótese e dado ausente.",
    "A EAP é uma estrutura de escopo, não uma lista de serviços de catálogo nem uma lista de atividades de cronograma.",
    "Use o tipo de obra como contexto para a decomposição, mas não substitua o escopo descrito por um template genérico. Se houver conflito entre tipo e descrição, registre a dúvida.",
    "Decomponha somente até o nível em que o escopo se torne controlável. Use localização, sistema, disciplina, fase ou componente quando isso melhorar o controle.",
    "Ao revisar uma EAP existente, compare o estado atual com o escopo informado e proponha create, update, move ou remove com justificativa. Não trate uma EAP estruturalmente válida como necessariamente adequada ao escopo.",
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
      tipoDeObra: context.tipoDeObra,
      stage: context.stage,
    },
    wbs: context.wbs,
  }, null, 2);

  return { system, user, skills };
}
