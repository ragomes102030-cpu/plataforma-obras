export type ArquimedesCapabilityKind = "skill" | "ability";

export type ArquimedesSkillCapability = {
  id: string;
  name: string;
  version: string;
  domain: string;
  status: "installed" | "available";
  description: string;
  dependencies: string[];
  defaultEnabled: boolean;
  removable: boolean;
};

export type ArquimedesAbility = {
  id: string;
  name: string;
  status: "active" | "propose";
  description: string;
  skills: string[];
  mcps: string[];
  dependencies: string[];
  defaultEnabled: boolean;
  removable: boolean;
};

export type ArquimedesCapabilityDefinition = {
  id: string;
  kind: ArquimedesCapabilityKind;
  name: string;
  version: string;
  domain: string;
  description: string;
  dependencies: string[];
  defaultInstalled: boolean;
  defaultEnabled: boolean;
  removable: boolean;
};

export const ARQUIMEDES_SKILLS: ArquimedesSkillCapability[] = [
  {
    id: "eap-decomposicao",
    name: "Decomposição profissional de EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Estrutura o escopo em níveis controláveis e orientados à execução.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "eap-regra-100",
    name: "Regra dos 100%",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Verifica cobertura integral do escopo e coerência da decomposição.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "eap-pacotes-trabalho",
    name: "Pacotes de trabalho",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Define pacotes mensuráveis, atribuíveis e controláveis.",
    dependencies: ["eap-decomposicao"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "eap-validacao",
    name: "Validação de EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Usa os validadores determinísticos para conferir estrutura e dicionário.",
    dependencies: ["eap-decomposicao", "eap-regra-100"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "eap-criterios-parada",
    name: "Critérios de parada da EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Define quando uma decomposição já está suficientemente detalhada para controle.",
    dependencies: ["eap-decomposicao", "eap-pacotes-trabalho"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "eap-dicionario",
    name: "Dicionário da EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Orienta escopo, inclusões, exclusões, responsável e critérios de aceite.",
    dependencies: ["eap-decomposicao"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "orcamento-reforma",
    name: "Orçamento de reformas",
    version: "0.1.0",
    domain: "planejamento.orcamento",
    status: "available",
    description: "Prepara composição de custos, quantitativos, referências e BDI para reformas.",
    dependencies: ["eap-validacao", "eap-dicionario"],
    defaultEnabled: false,
    removable: true,
  },
  {
    id: "planejamento-frentes",
    name: "Planejamento de frentes",
    version: "0.1.0",
    domain: "planejamento.producao",
    status: "available",
    description: "Organiza equipes, ritmo, sequência e frentes repetitivas.",
    dependencies: ["eap-pacotes-trabalho"],
    defaultEnabled: false,
    removable: true,
  },
];

export const ARQUIMEDES_ABILITIES: ArquimedesAbility[] = [
  {
    id: "analisar-obra",
    name: "Analisar obra",
    status: "active",
    description: "Investiga o contexto da obra e consulta as fontes necessárias antes de responder.",
    skills: ["eap-validacao"],
    mcps: ["EAP", "Cronograma", "Gantt / LOB"],
    dependencies: ["eap-validacao"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "auditar-eap",
    name: "Auditar EAP",
    status: "active",
    description: "Cruza estrutura, escopo, quantitativos e validações para encontrar lacunas.",
    skills: ["eap-decomposicao", "eap-regra-100", "eap-dicionario"],
    mcps: ["EAP"],
    dependencies: ["eap-decomposicao", "eap-regra-100", "eap-dicionario"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "organizar-frente",
    name: "Organizar frente de serviço",
    status: "active",
    description: "Analisa atividades, dependências, ritmo e Linha de Balanço para propor uma frente.",
    skills: ["eap-pacotes-trabalho"],
    mcps: ["EAP", "Cronograma", "Gantt / LOB"],
    dependencies: ["eap-pacotes-trabalho"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "planejar-reforma",
    name: "Planejar reforma ponta a ponta",
    status: "propose",
    description: "Componha EAP, quantitativos, orçamento, cronograma e monitoramento em uma jornada assistida.",
    skills: [
      "eap-decomposicao",
      "eap-validacao",
      "orcamento-reforma",
      "planejamento-frentes",
    ],
    mcps: ["EAP", "Cronograma", "Gantt / LOB"],
    dependencies: ["orcamento-reforma", "planejamento-frentes"],
    defaultEnabled: false,
    removable: true,
  },
];

export const ARQUIMEDES_PERMISSION_MATRIX = [
  { name: "Consulta de dados da obra", level: "automática", description: "Leitura e validação em fontes homologadas." },
  { name: "Proposta de planejamento", level: "automática", description: "Arquimedes pode calcular e propor sem alterar o plano." },
  { name: "Correção inequívoca", level: "controlada", description: "Liberada quando a regra e a evidência tornam a correção determinística." },
  { name: "Alteração de alto impacto", level: "confirmação", description: "Exige aprovação explícita antes de executar." },
  { name: "Exclusão / destruição", level: "confirmação explícita", description: "Nunca é executada como efeito colateral." },
  { name: "Alteração de código", level: "controlada", description: "Somente na branch de trabalho configurada e com proteção de concorrência." },
] as const;

export const ARQUIMEDES_CAPABILITIES: ArquimedesCapabilityDefinition[] = [
  ...ARQUIMEDES_SKILLS.map(skill => ({
    id: skill.id,
    kind: "skill" as const,
    name: skill.name,
    version: skill.version,
    domain: skill.domain,
    description: skill.description,
    dependencies: skill.dependencies,
    defaultInstalled: skill.status === "installed",
    defaultEnabled: skill.defaultEnabled,
    removable: skill.removable,
  })),
  ...ARQUIMEDES_ABILITIES.map(ability => ({
    id: ability.id,
    kind: "ability" as const,
    name: ability.name,
    version: "1.0.0",
    domain: "habilidades.arquimedes",
    description: ability.description,
    dependencies: ability.dependencies,
    defaultInstalled: ability.status === "active",
    defaultEnabled: ability.defaultEnabled,
    removable: ability.removable,
  })),
];
