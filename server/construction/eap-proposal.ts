import type { ArquimedesEapProposal } from "../agent/core/types";

export type InitialEapProjectScope = {
  name?: string | null;
  descricao?: string | null;
  tipoDeObra?: string | null;
};

const BUILDING_CUE = /(edif[ií]cio|residencial|apartamento|multifamiliar|pavimento|anda(r|res)|torre|condom[ií]nio|pr[eé]dio|shopping|comercial)/i;
const INFRASTRUCTURE_CUE = /(pavimenta[cç][aã]o|infraestrutura vi[aá]ria|rodovia|estrada|saneamento|drenagem|rede de [aá]gua|rede de esgoto)/i;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Exclusões declaradas no escopo. A regra é conservadora de propósito: só olha
 * a cláusula explícita ("não inclui..., nem...", "sem...") e casa palavras
 * conhecidas. Fora dela, a palavra "estrutura" pode ser o próprio objeto da
 * obra, e não uma exclusão.
 */
const EXCLUSION_KEYS: Array<{ chave: string; padrao: RegExp }> = [
  { chave: "estrutura", padrao: /estrutur|funda[cç][aã]o|conten[cç][aã]o/ },
  { chave: "fachada", padrao: /fachada/ },
  { chave: "area comum", padrao: /area comum|condominio/ },
  { chave: "cobertura", padrao: /cobertura|telhado/ },
  { chave: "demolicoes", padrao: /demoli/ },
  { chave: "hidraulica", padrao: /hidr[au]|agua|esgoto/ },
  { chave: "eletrica", padrao: /eletric/ },
  { chave: "forros", padrao: /forro|gesso/ },
  { chave: "revestimentos", padrao: /revestimento|piso|parede/ },
  { chave: "esquadrias", padrao: /esquadria|mobiliario|marcenaria/ },
  { chave: "pintura", padrao: /pintura/ },
];

const EXCLUSION_LABELS: Record<string, string> = {
  estrutura: "estrutura",
  fachada: "fachada",
  "area comum": "área comum",
  cobertura: "cobertura",
  demolicoes: "demolições",
  hidraulica: "instalações hidráulicas",
  eletrica: "instalações elétricas",
  forros: "forros/gesso",
  revestimentos: "revestimentos",
  esquadrias: "esquadrias/mobiliário",
  pintura: "pintura",
};

export function extrairExclusoes(descricao: string | null | undefined): string[] {
  const texto = normalizar(descricao ?? "");
  const clausula =
    texto.match(/(nao (?:inclui|contempla|abrange|faz parte)[\s\S]*?)(?:\.|$)/)?.[1] ??
    texto.match(/(sem [\s\S]*?)(?:\.|$)/)?.[1] ??
    "";
  if (!clausula) return [];
  return EXCLUSION_KEYS.filter(item => item.padrao.test(clausula)).map(item => item.chave);
}

type AtividadeSpec = { nome: string; rationale: string };
type FaseSpec = {
  nome: string;
  rationale: string;
  palavrasChave: string[];
  atividades: AtividadeSpec[];
};

/**
 * Reforma de unidade existente não tem fundação, estrutura nova, cobertura nem
 * urbanização. Tem demolição, adequação de instalações, vedações novas, forro,
 * revestimento, esquadria, pintura e entrega. Este é o modelo que deve ser
 * usado quando a tipologia é reforma, mesmo que o escopo cite "apartamento".
 */
const FASES_REFORMA: FaseSpec[] = [
  {
    nome: "Serviços preliminares e proteção",
    rationale: "Mobiliza a equipe e protege o que não será demolido, inclusive áreas comuns do edifício.",
    palavrasChave: [],
    atividades: [
      { nome: "Mobilização, canteiro e sinalização", rationale: "Instala o apoio de obra e organiza o fluxo de materiais e resíduos." },
      { nome: "Proteção do apartamento e das áreas comuns", rationale: "Reduz dano a pisos, elevadores e circulações durante a reforma." },
    ],
  },
  {
    nome: "Demolições e remoções",
    rationale: "Separa a retirada do existente antes de qualquer execução nova.",
    palavrasChave: ["demolicoes"],
    atividades: [
      { nome: "Demolição de alvenarias internas", rationale: "Abre os novos ambientes previstos no escopo." },
      { nome: "Remoção de revestimentos, louças e metais", rationale: "Prepara as bases para as novas instalações e acabamentos." },
      { nome: "Remoção de esquadrias e forros existentes", rationale: "Libera os vãos e tetos para as novas esquadrias e forro." },
    ],
  },
  {
    nome: "Instalações hidrossanitárias",
    rationale: "Adequa água fria, esgoto e ventilação ao novo layout dos banheiros e cozinha.",
    palavrasChave: ["hidraulica"],
    atividades: [
      { nome: "Adequação da rede de água fria", rationale: "Atende às novas posições de louças, metais e máquina de lavar." },
      { nome: "Adequação da rede de esgoto e ventilação", rationale: "Garante caimento, ventilação e conexão correta dos novos pontos." },
      { nome: "Testes de estanqueidade", rationale: "Verifica vedação antes do fechamento de paredes e pisos." },
    ],
  },
  {
    nome: "Instalações elétricas",
    rationale: "Revisa circuitos, quadro e pontos para a nova carga e layout.",
    palavrasChave: ["eletrica"],
    atividades: [
      { nome: "Adequação de circuitos e quadro de distribuição", rationale: "Dimensiona a proteção para as novas cargas e evita sobrecarga." },
      { nome: "Infraestrutura de conduítes, caixas e pontos", rationale: "Deixa a passagem de cabos pronta antes do acabamento." },
    ],
  },
  {
    nome: "Vedações, forros e gesso",
    rationale: "Reconstrói os fechamentos e o teto conforme o novo layout.",
    palavrasChave: ["forros"],
    atividades: [
      { nome: "Alvenaria de vedação e encunhamento", rationale: "Fecha os novos ambientes com estabilidade e prumo." },
      { nome: "Forro de gesso, sancas e iluminação", rationale: "Recebe a iluminação e esconde as instalações no teto." },
    ],
  },
  {
    nome: "Revestimentos",
    rationale: "Aplica pisos e paredes conforme o projeto de interiores.",
    palavrasChave: ["revestimentos"],
    atividades: [
      { nome: "Revestimento cerâmico de piso", rationale: "Entrega a base de piso acabada e nivelada." },
      { nome: "Revestimento cerâmico de parede", rationale: "Acaba as áreas molhadas e as paredes previstas." },
    ],
  },
  {
    nome: "Esquadrias e mobiliário fixo",
    rationale: "Instala os itens de serralheria e marcenaria previstos no escopo.",
    palavrasChave: ["esquadrias"],
    atividades: [
      { nome: "Instalação de esquadrias de alumínio", rationale: "Fecha os vãos com vedação e funcionamento conferidos." },
      { nome: "Instalação de mobiliário fixo da cozinha", rationale: "Monta os móveis planejados sobre a base acabada." },
    ],
  },
  {
    nome: "Pintura e acabamentos finais",
    rationale: "Fecha a superfície e os detalhes antes da limpeza.",
    palavrasChave: ["pintura"],
    atividades: [
      { nome: "Preparação de superfícies e pintura", rationale: "Corrige imperfeições e aplica o acabamento final." },
      { nome: "Rejuntes, silicone e acabamentos", rationale: "Veda juntas e arremata os encontros entre materiais." },
    ],
  },
  {
    nome: "Limpeza, testes e entrega",
    rationale: "Confere o funcionamento, limpa e entrega a unidade.",
    palavrasChave: [],
    atividades: [
      { nome: "Limpeza fina", rationale: "Remove resíduos de obra antes da entrega." },
      { nome: "Testes finais e entrega", rationale: "Valida instalações e registra o aceite do cliente." },
    ],
  },
];

function propostasReforma(project: InitialEapProjectScope, exclusoes: string[]) {
  const fases = FASES_REFORMA.filter(
    fase => !fase.palavrasChave.some(palavra => exclusoes.includes(palavra))
  ).filter(fase => fase.atividades.length > 0);

  const nodes: ArquimedesEapProposal["nodes"] = [
    {
      operation: "create" as const,
      code: "1",
      name: project.name?.trim() || "Escopo da obra",
      nodeType: "grupo" as const,
      parentCode: null,
      rationale: "Raiz única da EAP da reforma, organizada por etapa construtiva.",
    },
  ];

  fases.forEach((fase, indiceFase) => {
    const codigoFase = `1.${indiceFase + 1}`;
    nodes.push({
      operation: "create" as const,
      code: codigoFase,
      name: fase.nome,
      nodeType: "pacote" as const,
      parentCode: "1",
      decompositionBasis: "phase" as const,
      rationale: fase.rationale,
    });
    fase.atividades.forEach((atividade, indiceAtividade) => {
      nodes.push({
        operation: "create" as const,
        code: `${codigoFase}.${indiceAtividade + 1}`,
        name: atividade.nome,
        nodeType: "entrega" as const,
        parentCode: codigoFase,
        decompositionBasis: "system" as const,
        rationale: atividade.rationale,
      });
    });
  });

  return nodes;
}

export function buildInitialEapProposal(
  project: InitialEapProjectScope,
  hasExistingNodes: boolean
): ArquimedesEapProposal {
  const scopeText = [project.name, project.descricao, project.tipoDeObra]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tipoNormalizado = normalizar(project.tipoDeObra ?? "");
  const ehReforma = tipoNormalizado.includes("reforma") || /\breforma\b/.test(normalizar(scopeText));
  const exclusoes = extrairExclusoes(project.descricao);
  const hasBuildingCue = BUILDING_CUE.test(scopeText) && !INFRASTRUCTURE_CUE.test(scopeText);

  if (ehReforma) {
    const nodes = hasExistingNodes ? [] : propostasReforma(project, exclusoes);
    return {
      action: "propose_eap",
      nodes,
      basis: [
        "Tipologia informada: reforma de unidade existente",
        "Escopo lido para demolições, instalações, vedações, revestimentos, esquadrias e pintura",
        exclusoes.length > 0
          ? `Exclusões declaradas no escopo: ${exclusoes.map(chave => EXCLUSION_LABELS[chave] ?? chave).join(", ")}`
          : "Nenhuma exclusão explícita identificada no texto do escopo",
        "Fases de fundação, estrutura nova, cobertura e urbanização não entram em reforma de unidade",
      ],
      assumptions: [
        "Estrutura-base gerada por regras de tipologia e pelas palavras do escopo; não é uma leitura completa do projeto.",
        "Metragens, quantidades e especificações de materiais precisam ser confirmadas na revisão.",
      ],
      missingInformation: [
        "Confirmar metragem por ambiente e se haverá troca de louças e metais.",
        "Confirmar se o mobiliário planejado e a automação fazem parte do contrato.",
        "Confirmar prazo, marcos e necessidade de obra em etapas.",
      ],
      validation: {
        valid: true,
        issues: [
          {
            code: "eap_estrutura_base_por_tipologia",
            severity: "warning",
            message:
              "Estrutura-base gerada por regras; revise e detalhe antes de aprovar. As exclusões do escopo foram consideradas, mas a proposta não substitui a análise do projeto.",
          },
        ],
      },
      resolutionSummary: [],
      researchEvidence: [],
      resolutionPlan: [],
    };
  }

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
