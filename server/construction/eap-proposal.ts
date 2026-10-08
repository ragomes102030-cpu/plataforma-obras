import type { ArquimedesEapProposal } from "../agent/core/types";

export type InitialEapProjectScope = {
  name?: string | null;
  descricao?: string | null;
  tipoDeObra?: string | null;
};

const BUILDING_CUE = /(edif[ií]cio|residencial|apartamento|multifamiliar|pavimento|anda(r|res)|torre|condom[ií]nio|pr[eé]dio|shopping|comercial)/i;
const INFRASTRUCTURE_CUE = /(pavimenta[cç][aã]o|infraestrutura vi[aá]ria|rodovia|estrada|saneamento|drenagem|rede de [aá]gua|rede de esgoto)/i;

export function buildInitialEapProposal(
  project: InitialEapProjectScope,
  hasExistingNodes: boolean
): ArquimedesEapProposal {
  const scopeText = [project.name, project.descricao, project.tipoDeObra]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasBuildingCue = BUILDING_CUE.test(scopeText) && !INFRASTRUCTURE_CUE.test(scopeText);

  const phaseNodes = hasBuildingCue
    ? [
        ["1.1", "Serviços preliminares e implantação", "Organiza mobilização, canteiro, locação e preparação inicial da obra."],
        ["1.2", "Fundações e contenções", "Separa a infraestrutura de fundações e contenções, base física da estrutura."],
        ["1.3", "Estrutura de concreto", "Representa a execução da estrutura resistente dos pavimentos e cobertura."],
        ["1.4", "Vedações e alvenarias", "Representa o fechamento dos pavimentos e elementos de vedação."],
        ["1.5", "Instalações prediais", "Agrupa sistemas hidrossanitários, elétricos, incêndio e demais instalações aplicáveis."],
        ["1.6", "Revestimentos e acabamentos", "Agrupa revestimentos, pisos, forros, esquadrias e acabamentos."],
        ["1.7", "Áreas externas e urbanização", "Mantém áreas externas, acessos e elementos de implantação separados das edificações."],
        ["1.8", "Comissionamento, documentação e entrega", "Fecha a obra com testes, correções, documentação e aceite."],
      ]
    : [
        ["1.1", "Serviços preliminares e implantação", "Organiza mobilização, preparação e implantação inicial."],
        ["1.2", "Infraestrutura", "Representa fundações, contenções ou infraestrutura principal conforme o escopo."],
        ["1.3", "Estrutura e sistemas principais", "Representa os sistemas construtivos principais da obra."],
        ["1.4", "Vedações e instalações", "Agrupa fechamentos e instalações aplicáveis ao escopo."],
        ["1.5", "Revestimentos e acabamentos", "Agrupa os serviços de acabamento aplicáveis."],
        ["1.6", "Áreas externas e complementares", "Separa urbanização, acessos e complementos quando aplicáveis."],
        ["1.7", "Comissionamento, documentação e entrega", "Fecha a obra com testes, documentação, correções e aceite."],
      ] as const;

  const nodes = hasExistingNodes
    ? []
    : [
        {
          operation: "create" as const,
          code: "1",
          name: project.name?.trim() || "Escopo da obra",
          nodeType: "grupo" as const,
          parentCode: null,
          rationale: "Raiz única da EAP. Abaixo dela o escopo é decomposto em frentes construtivas macro, evitando que a obra seja apresentada como um único bloco.",
        },
        ...phaseNodes.map(([code, name, rationale]) => ({
          operation: "create" as const,
          code,
          name,
          nodeType: "pacote" as const,
          parentCode: "1",
          decompositionBasis: "phase" as const,
          rationale,
        })),
      ];

  return {
    action: "propose_eap",
    nodes,
    basis: [
      "Descrição e identificação da obra cadastradas",
      "Decomposição inicial por fases/frentes construtivas compatíveis com o tipo de obra",
      "Regra de raiz única com decomposição suficiente para revisão técnica",
    ],
    assumptions: hasBuildingCue
      ? ["A descrição indica uma edificação; a decomposição detalhada por pavimento, sistema e serviço deve ser confirmada na revisão."]
      : ["A tipologia não foi identificada com segurança; a proposta usa uma decomposição macro conservadora para revisão do engenheiro."],
    missingInformation: [
      "Confirmar sistemas especiais, escopo de áreas externas e nível de decomposição desejado antes da aprovação final.",
    ],
    validation: { valid: true, issues: [] },
    resolutionSummary: [],
    researchEvidence: [],
    resolutionPlan: [],
  };
}
