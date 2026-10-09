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
    id: "pesquisa-web-evidencias",
    name: "Pesquisa web baseada em evidências",
    version: "1.0.0",
    domain: "inteligencia.pesquisa",
    status: "installed",
    description: "Pesquisa fontes externas antes de propor soluções, separando prática documentada de fatos específicos da obra.",
    dependencies: ["eap-validacao", "eap-dicionario"],
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
    id: "find-skills",
    name: "Descoberta e seleção de Skills",
    version: "1.0.0",
    domain: "agente.skills",
    status: "installed",
    description: "Identifica a habilidade certa para cada tarefa, verifica pré-requisitos e evita instalar competências duplicadas ou irrelevantes.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "dev-experts",
    name: "Especialistas de desenvolvimento",
    version: "1.0.0",
    domain: "agente.desenvolvimento",
    status: "installed",
    description: "Divide tarefas complexas em perspectivas de arquitetura, backend, dados, segurança, testes e UX; Arquimedes consolida conflitos e evidências.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "planning-experts",
    name: "Especialistas de planejamento de obras",
    version: "1.0.0",
    domain: "planejamento.integrado",
    status: "installed",
    description: "Coordena perspectivas de EAP, quantitativos, orçamento, produtividade, CPM, Gantt e Linha de Balanço sem confundir escopo com cronograma.",
    dependencies: ["eap-validacao"],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "grill-me",
    name: "Questionamento crítico de premissas",
    version: "1.0.0",
    domain: "agente.analise",
    status: "installed",
    description: "Testa premissas, ambiguidades, riscos e critérios de sucesso; pergunta apenas quando a resposta altera materialmente a decisão ou segurança.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "architecture-review",
    name: "Melhoria de arquitetura do código",
    version: "1.0.0",
    domain: "desenvolvimento.arquitetura",
    status: "installed",
    description: "Analisa limites de módulos, acoplamento, contratos, migrações e caminhos de regressão antes de propor refatorações.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "agent-browser",
    name: "Agente de navegador e QA",
    version: "1.0.0",
    domain: "desenvolvimento.qa",
    status: "installed",
    description: "Usa automação de navegador real quando disponível para reproduzir fluxos, observar estado, capturar erros e validar comportamento live.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "tdd",
    name: "Desenvolvimento orientado a testes",
    version: "1.0.0",
    domain: "desenvolvimento.testes",
    status: "installed",
    description: "Reproduz a falha, cria teste de regressão, implementa a menor correção e executa typecheck, testes, build e E2E pertinente.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "self-improving-agent",
    name: "Autoaperfeiçoamento com evidências",
    version: "1.0.0",
    domain: "agente.aprendizado",
    status: "installed",
    description: "Transforma falhas confirmadas em aprendizado candidato, regra validada e regressão; não aprende automaticamente de hipótese ou dado de uma única obra.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "frontend-design",
    name: "Design de interface profissional",
    version: "1.0.0",
    domain: "desenvolvimento.frontend",
    status: "installed",
    description: "Projeta interfaces consistentes, responsivas e acessíveis com estados de carregamento, erro, vazio e sucesso, preservando padrões existentes.",
    dependencies: [],
    defaultEnabled: true,
    removable: false,
  },
  {
    id: "handoff",
    name: "Continuidade e passagem de trabalho",
    version: "1.0.0",
    domain: "agente.continuidade",
    status: "installed",
    description: "Fecha cada etapa com estado confirmado, arquivos/commits, testes executados, riscos, bloqueios e próximo passo acionável.",
    dependencies: [],
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
    id: "pesquisar-evidencias",
    name: "Pesquisar evidências para resolver",
    status: "active",
    description: "Agrupa os bloqueios, pesquisa referências externas e entrega ao especialista evidências para propor uma solução em lote.",
    skills: ["eap-validacao", "eap-dicionario", "pesquisa-web-evidencias"],
    mcps: ["Pesquisa Web", "EAP"],
    dependencies: ["pesquisa-web-evidencias"],
    defaultEnabled: true,
    removable: false,
  },
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
