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

function engineeringReasoningKernel() {
  return [
    "MÉTODO DE RACIOCÍNIO DO ARQUIMEDES:",
    "1. Entenda o empreendimento antes de decompor. Identifique objeto, limites de escopo, condicionantes, localização, sistemas, etapas e entregáveis explicitamente descritos.",
    "2. Separe fato de hipótese. Fato é o que o escopo sustenta; hipótese é uma interpretação necessária. Não trate hipótese como dado confirmado.",
    "3. Identifique lacunas relevantes antes de fechar a estrutura. Registre somente informações cuja ausência possa alterar a EAP, seus limites ou a forma de controle.",
    "4. Escolha o critério de decomposição que melhor represente o empreendimento. Use fase, sistema, localização, disciplina, componente ou outro critério coerente; não misture critérios sem necessidade.",
    "5. Decomponha de forma hierárquica e rastreável. Cada nó deve ter um único lugar lógico na estrutura e o conjunto de filhos deve representar integralmente o escopo do pai.",
    "6. Pare no ponto de controle. Um pacote deve ser detalhado o suficiente para ser planejado, orçado, medido e acompanhado, sem virar catálogo de serviços ou lista excessivamente granular.",
    "7. Faça uma verificação final de coerência antes de responder: hierarquia, códigos, duplicidades, cobertura de escopo, nível de detalhe, nomenclatura e aderência às informações fornecidas.",
    "8. Quando houver conflito ou ambiguidade real, sinalize-a em missingInformation ou assumptions em vez de fabricar uma decisão.",
    "9. Use conhecimento de engenharia para organizar e questionar o escopo, não para inventar quantitativos, métodos executivos, normas específicas ou decisões de projeto ausentes.",
    "10. Aplique o método internamente e devolva somente o contrato solicitado. Não exponha cadeia de pensamento detalhada, rascunhos ou raciocínio interno."
  ].join("\n");
}

function structuredRules() {
  return [
    "A resposta desta chamada é um contrato de saída estruturada para uma proposta de EAP.",
    "A resposta final DEVE ser um único objeto JSON válido, sem markdown, sem texto antes ou depois e sem comentários.",
    "Formato esperado: {basis,assumptions,missingInformation,nodes}. O campo action é opcional e, quando presente, é ignorado pelo sistema.",
    'Exemplo mínimo: {"basis":["escopo informado"],"assumptions":[],"missingInformation":[],"nodes":[{"operation":"create","parentCode":null,"code":"1","name":"Implantação","nodeType":"grupo","rationale":"Raiz da obra"}]}',
    "Cada node deve conter operation,parentCode,code quando aplicável,name,nodeType e uma rationale curta; location/unit/plannedQuantity entram somente quando conhecidos.",
    "Não gere explicações longas por nó. Mantenha rationale em uma frase curta, preferencialmente abaixo de 120 caracteres.",
    "Mantenha basis, assumptions e missingInformation objetivos. Registre fatos e lacunas relevantes, não textos narrativos extensos.",
    "Use somente os fatos fornecidos como evidência. Não invente dados, decisões, validações ou registros.",
    "A EAP representa escopo. Não transforme a proposta em catálogo de serviços nem em cronograma.",
    "Use o tipo de obra como contexto, mas não substitua o escopo descrito por um template genérico.",
  ].join("\n");
}

export interface EapReviewAudit {
  summary: {
    totalNodes: number;
    leafNodes: number;
    structuralIssues: number;
    candidateNodes: number;
  };
  issues: Array<{
    code: string;
    type: "duplicate_code" | "missing_parent" | "invalid_level";
    detail: string;
  }>;
  candidateNodes: ArquimedesProjectContext["wbs"];
  compactTree: Array<{
    id: number;
    code: string;
    name: string;
    parentCode: string | null;
    level: number;
    nodeType: "grupo" | "pacote" | "entrega";
  }>;
}

export function buildEapRequest(
  context: ArquimedesProjectContext,
  skills: ArquimedesSkill[],
  audit?: EapReviewAudit
): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    engineeringReasoningKernel(),
    structuredRules(),
    "Ao revisar uma EAP existente, consulte o banco por meio das ferramentas de leitura disponíveis quando precisar de dados adicionais. Você pode navegar pela obra e pela EAP sob demanda; não assuma que o resumo inicial contém tudo.",
    "Concentre-se em cobertura de escopo, nível de decomposição, duplicidades semânticas, nomenclatura, coerência pai/filho e lacunas que possam alterar a EAP. Use consultas somente quando elas reduzirem incerteza real.",
    "O contexto inicial é apenas uma referência. Quando precisar, consulte diretamente os registros atuais da obra antes de propor qualquer alteração.",
    "Se os achados não justificarem mudança, retorne nodes vazio e registre isso em basis. Não invente correções.",
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
      audit: audit ?? null,
    },
    null,
    2
  );

  // A revisão dirigida usa o mapa compacto da EAP e somente os nós candidatos.
  // O orçamento menor reduz latência e evita uma requisição monolítica.
  return { system, user, skills, maxTokens: 4096, databaseContext: { projectId: context.projectId } };
}

export function buildEapMacroRequest(
  context: ArquimedesProjectContext,
  skills: ArquimedesSkill[]
): ArquimedesLlmRequest {
  const system = [
    "Você é Arquimedes, agente de engenharia de planejamento da Plataforma Obras.",
    engineeringReasoningKernel(),
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

  return { system, user, skills, maxTokens: 8192 };
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
    engineeringReasoningKernel(),
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

  return { system, user, skills, maxTokens: 12288 };
}
