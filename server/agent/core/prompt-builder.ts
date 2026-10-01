import type {
  ArquimedesProjectContext,
  ArquimedesSkill,
  ArquimedesLlmRequest,
} from "./types";

function skillsBlock(skills: ArquimedesSkill[]) {
  return skills
    .map(skill => "### " + skill.id + " v" + skill.version + "\n" + skill.content)
    .join("\n\n");
}

function structuredRules() {
  return [
    "A resposta desta chamada é um contrato de saída estruturada para uma proposta de EAP.",
    "A resposta final DEVE ser um único objeto JSON válido, sem markdown, sem texto antes ou depois e sem comentários.",
    "Formato: {action,basis,assumptions,missingInformation,nodes}.",
    "Cada node deve conter operation,parentCode,code quando aplicável,name,nodeType e uma rationale curta; location/unit/plannedQuantity entram somente quando conhecidos.",
    "Não gere explicações longas por nó. Mantenha rationale em uma frase curta, preferencialmente abaixo de 120 caracteres.",
    "Use somente os fatos fornecidos como evidência. Não invente dados, decisões, validações ou registros.",
    "A EAP representa escopo. Não transforme a proposta em catálogo de serviços nem em cronograma.",
    "Use o tipo de obra como contexto, mas não substitua o escopo descrito por um template genérico.",
  ].join("\n");
}

export function buildEapRequest(
  context: ArquimedesProjectContext,
  skills: ArquimedesSkill[]
): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    structuredRules(),
    "Ao revisar uma EAP existente, compare o estado atual com o escopo informado e proponha create, update, move ou remove com justificativa.",
    "Decomponha somente até o nível em que o escopo se torne controlável. Use localização, sistema, disciplina, fase ou componente quando isso melhorar o controle.",
    "Não execute alterações diretamente. Propostas de planejamento continuam sujeitas à validação e aprovação.",
    "Conhecimento profissional:",
    skillsBlock(skills),
  ].join("\n\n");

  const user = JSON.stringify(
    {
      task: "analisar_eap",
      project: {
        id: context.projectId,
        name: context.name,
        description: context.description,
        tipoDeObra: context.tipoDeObra,
        stage: context.stage,
      },
      wbs: context.wbs,
    },
    null,
    2
  );

  return { system, user, skills, maxTokens: 12288 };
}

export function buildEapMacroRequest(
  context: ArquimedesProjectContext,
  skills: ArquimedesSkill[]
): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    structuredRules(),
    "Esta chamada é SOMENTE para mapear a macroestrutura da EAP.",
    "Retorne entre 3 e 8 nós-raiz.",
    "Todos os nós devem ser operation=create, parentCode=null, nodeType=grupo e possuir code numérico simples: 1, 2, 3...",
    "Não crie folhas detalhadas, serviços ou atividades nesta etapa. Agrupe o empreendimento em grandes blocos de escopo controláveis.",
    "Evite raízes redundantes. Cada raiz deve representar uma parte real e distinta do escopo descrito.",
    "Não use conhecimento de template para criar blocos que não estejam sustentados pelo escopo. Quando houver incerteza, registre em missingInformation.",
    "Conhecimento profissional:",
    skillsBlock(skills),
  ].join("\n\n");

  const user = JSON.stringify(
    {
      task: "mapear_eap_macro",
      project: {
        id: context.projectId,
        name: context.name,
        description: context.description,
        tipoDeObra: context.tipoDeObra,
        stage: context.stage,
      },
    },
    null,
    2
  );

  return { system, user, skills, maxTokens: 4096 };
}

export function buildEapSubtreeRequest(
  context: ArquimedesProjectContext,
  skills: ArquimedesSkill[],
  root: {
    code: string;
    name: string;
    rationale: string;
  },
  macroNodes: Array<{ code: string; name: string }>,
  maxNodesInSubtree = 20
): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    structuredRules(),
    "Esta chamada expande SOMENTE um ramo da EAP. O nó-raiz informado já existe e não deve ser repetido.",
    "Retorne somente descendentes desse ramo, todos operation=create.",
    "Cada node deve ter code descendente do código-raiz, como 1.1, 1.2 ou 1.1.1, e parentCode deve apontar para o pai imediato.",
    "Você pode usar grupo, pacote ou entrega. Pare quando o pacote estiver controlável sem precisar alterar o escopo.",
    "Não transforme cada serviço de catálogo em um nó. Agrupe trabalhos que serão controlados juntos.",
    "Não invente quantitativos. Só preencha unit/plannedQuantity quando forem sustentados pelo texto da obra.",
    "Mantenha o ramo compacto. Não ultrapasse o orçamento de nós indicado na solicitação.",
    "Não crie outro ramo-raiz nem trate atividades do cronograma como EAP.",
    "Conhecimento profissional:",
    skillsBlock(skills),
  ].join("\n\n");

  const user = JSON.stringify(
    {
      task: "expandir_subarvore_eap",
      budget: {
        maxNodesInThisSubtree: maxNodesInSubtree,
      },
      project: {
        id: context.projectId,
        name: context.name,
        description: context.description,
        tipoDeObra: context.tipoDeObra,
        stage: context.stage,
      },
      macroNodes,
      root,
    },
    null,
    2
  );

  return { system, user, skills, maxTokens: 8192 };
}
