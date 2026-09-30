export type ArquimedesSkillCapability = {
  id: string;
  name: string;
  version: string;
  domain: string;
  status: "installed" | "available";
  description: string;
};

export type ArquimedesAbility = {
  id: string;
  name: string;
  status: "active" | "propose";
  description: string;
  skills: string[];
  mcps: string[];
};

export const ARQUIMEDES_SKILLS: ArquimedesSkillCapability[] = [
  {
    id: "eap-decomposicao",
    name: "Decomposição profissional de EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Estrutura o escopo em níveis controláveis e orientados à execução.",
  },
  {
    id: "eap-regra-100",
    name: "Regra dos 100%",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Verifica cobertura integral do escopo e coerência da decomposição.",
  },
  {
    id: "eap-pacotes-trabalho",
    name: "Pacotes de trabalho",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Define pacotes mensuráveis, atribuíveis e controláveis.",
  },
  {
    id: "eap-validacao",
    name: "Validação de EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Usa os validadores determinísticos para conferir estrutura e dicionário.",
  },
  {
    id: "eap-criterios-parada",
    name: "Critérios de parada da EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Define quando uma decomposição já está suficientemente detalhada para controle.",
  },
  {
    id: "eap-dicionario",
    name: "Dicionário da EAP",
    version: "1.0.0",
    domain: "planejamento.eap",
    status: "installed",
    description: "Orienta escopo, inclusões, exclusões, responsável e critérios de aceite.",
  },
  {
    id: "orcamento-reforma",
    name: "Orçamento de reformas",
    version: "0.1.0",
    domain: "planejamento.orcamento",
    status: "available",
    description: "Preparada para composição de custos, quantitativos e BDI.",
  },
  {
    id: "planejamento-frentes",
    name: "Planejamento de frentes",
    version: "0.1.0",
    domain: "planejamento.producao",
    status: "available",
    description: "Preparada para organizar equipes, ritmo, sequência e frentes repetitivas.",
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
  },
  {
    id: "auditar-eap",
    name: "Auditar EAP",
    status: "active",
    description: "Cruza estrutura, escopo, quantitativos e validações para encontrar lacunas.",
    skills: ["eap-decomposicao", "eap-regra-100", "eap-dicionario"],
    mcps: ["EAP"],
  },
  {
    id: "organizar-frente",
    name: "Organizar frente de serviço",
    status: "active",
    description: "Analisa atividades, dependências, ritmo e Linha de Balanço para propor uma frente.",
    skills: ["eap-pacotes-trabalho"],
    mcps: ["EAP", "Cronograma", "Gantt / LOB"],
  },
  {
    id: "planejar-reforma",
    name: "Planejar reforma ponta a ponta",
    status: "propose",
    description: "Componha EAP, quantitativos, orçamento, cronograma e monitoramento em uma jornada assistida.",
    skills: ["eap-decomposicao", "eap-validacao", "orcamento-reforma", "planejamento-frentes"],
    mcps: ["EAP", "Cronograma", "Gantt / LOB"],
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
