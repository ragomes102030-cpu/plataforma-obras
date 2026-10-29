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
  const escopoNormalizado = normalizar(scopeText);
  const ehReforma = tipoNormalizado.includes("reforma") || /\breforma\b/.test(normalizar(scopeText));
  const exclusoes = extrairExclusoes(project.descricao);
  const hasBuildingCue = BUILDING_CUE.test(scopeText) && !INFRASTRUCTURE_CUE.test(scopeText);
  const estruturaDeConcretoDeclarada = /\bconcreto\b/.test(escopoNormalizado);
  const vedacaoDeAlvenariaDeclarada = /\balvenaria\b/.test(escopoNormalizado);
  const incluiAreasExternas = /areas? externas?|urbanizacao|paisagismo|pavimentacao externa|calcadas?|drenagem externa|redes externas/.test(escopoNormalizado);

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

  const phaseNodes: Array<readonly [string, string, string]> = hasBuildingCue
    ? [
        ["1.1", "Implantação e suporte de obra", "Organiza canteiro, instalações provisórias e preparação do local; confirmar limites do contrato e condições do terreno."],
        ["1.2", "Infraestrutura e fundações", "Abrange a infraestrutura e as fundações; solução e eventual necessidade de contenção dependem de sondagem e projeto."],
        ["1.3", estruturaDeConcretoDeclarada ? "Estrutura de concreto" : "Estrutura resistente (sistema a definir)", estruturaDeConcretoDeclarada ? "O escopo menciona concreto; geometria, dimensionamento e método dependem do projeto estrutural." : "O sistema resistente não foi informado; manter a solução em aberto até o projeto estrutural."],
        ["1.4", vedacaoDeAlvenariaDeclarada ? "Vedações em alvenaria" : "Vedações e envoltória (sistema a definir)", vedacaoDeAlvenariaDeclarada ? "O escopo menciona alvenaria; configuração e especificação dependem do projeto." : "O sistema de vedação e a composição da envoltória não foram informados; confirmar no projeto."],
        ["1.5", "Instalações prediais (sistemas a confirmar)", "Agrupa somente os sistemas aplicáveis definidos no escopo e nos projetos complementares."],
        ["1.6", "Acabamentos e componentes internos (escopo a confirmar)", "O nível de entrega e as especificações de acabamentos ainda precisam ser definidos."],
        ...(incluiAreasExternas ? [["1.7", "Áreas externas e infraestrutura de implantação", "Mantém as áreas externas explicitamente citadas no escopo separadas da edificação; limites e interfaces dependem do levantamento do local."]] as const : []),
        [incluiAreasExternas ? "1.8" : "1.7", "Comissionamento, documentação e entrega", "Organiza verificações, documentação final, correções e aceite conforme os requisitos definidos para a obra."],
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
          rationale: hasBuildingCue
            ? "Raiz única da EAP, decomposta em componentes do escopo. Sistemas e entregas não informados permanecem como decisões pendentes, sem serem presumidos pela tipologia."
            : "Raiz única da EAP. Abaixo dela o escopo é organizado em componentes macro para revisão técnica.",
        },
        ...phaseNodes.map(([code, name, rationale]) => ({
          operation: "create" as const,
          code,
          name,
          nodeType: "pacote" as const,
          parentCode: "1",
          decompositionBasis: hasBuildingCue ? "deliverable" as const : "phase" as const,
          rationale,
        })),
      ];

  return {
    action: "propose_eap",
    nodes,
    basis: [
      "Descrição e identificação da obra cadastradas",
      hasBuildingCue
        ? "Decomposição inicial em componentes de escopo; sistemas não declarados permanecem em aberto."
        : "Decomposição inicial por frentes construtivas compatíveis com o tipo de obra",
      "Regra de raiz única com decomposição suficiente para revisão técnica",
    ],
    assumptions: hasBuildingCue
      ? ["A descrição indica uma edificação; a proposta não presume sistemas construtivos que não foram informados.", "A decomposição por pavimento, sistema e serviço depende dos projetos e do nível de entrega confirmado."]
      : ["A tipologia não foi identificada com segurança; a proposta usa uma decomposição macro conservadora para revisão do engenheiro."],
    missingInformation: hasBuildingCue
      ? [
          "Confirmar lote e sondagem para definir fundações e eventual necessidade de contenção.",
          "Confirmar sistema estrutural e de vedação nos projetos técnicos.",
          "Confirmar instalações aplicáveis, nível de acabamento e critério de entrega.",
          "Definir se projetos, licenças e áreas externas fazem parte do escopo contratado.",
        ]
      : ["Confirmar sistemas especiais, limites de escopo e nível de decomposição desejado antes da aprovação final."],
    validation: { valid: true, issues: [] },
    resolutionSummary: [],
    researchEvidence: [],
    resolutionPlan: [],
  };
}
