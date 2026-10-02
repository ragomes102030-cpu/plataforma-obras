export type ArquimedesAgentId =
  | "arquimedes"
  | "euclides"
  | "newton"
  | "fibonacci"
  | "gauss"
  | "hipatia";

export type ArquimedesAgentDefinition = {
  id: ArquimedesAgentId;
  name: string;
  title: string;
  mission: string;
  domain: string;
  reportsTo: "arquimedes" | null;
};

export const ARQUIMEDES_AGENT_REGISTRY: Record<
  ArquimedesAgentId,
  ArquimedesAgentDefinition
> = {
  arquimedes: {
    id: "arquimedes",
    name: "Arquimedes",
    title: "Orquestrador-chefe de Engenharia",
    mission:
      "Entender o objetivo da obra, selecionar especialistas, consolidar evidências, controlar o fluxo de decisão e apresentar uma recomendação rastreável ao engenheiro.",
    domain: "orquestracao",
    reportsTo: null,
  },
  euclides: {
    id: "euclides",
    name: "Euclides",
    title: "Eng. Revisor de EAP",
    mission:
      "Revisar escopo, hierarquia, decomposição, dicionário da EAP e coerência entre pais, filhos e pacotes de trabalho.",
    domain: "eap",
    reportsTo: "arquimedes",
  },
  newton: {
    id: "newton",
    name: "Newton",
    title: "Eng. Planejador de Cronograma",
    mission:
      "Transformar a EAP aprovada em atividades, durações, relações, dependências e análises de caminho crítico de forma rastreável.",
    domain: "cronograma",
    reportsTo: "arquimedes",
  },
  fibonacci: {
    id: "fibonacci",
    name: "Fibonacci",
    title: "Eng. Planejador de Produção",
    mission:
      "Avaliar frentes, ritmos, sequências repetitivas, produção e Linha de Balanço para apoiar a execução.",
    domain: "producao",
    reportsTo: "arquimedes",
  },
  gauss: {
    id: "gauss",
    name: "Gauss",
    title: "Eng. Analista de Quantitativos e Orçamento",
    mission:
      "Cruzar EAP, quantitativos, composições, preços e referências orçamentárias sem inventar dados ausentes.",
    domain: "orcamento",
    reportsTo: "arquimedes",
  },
  hipatia: {
    id: "hipatia",
    name: "Hipátia",
    title: "Auditora Técnica Independente",
    mission:
      "Verificar consistência dos achados dos especialistas, identificar conflitos entre domínios e separar evidência de hipótese.",
    domain: "auditoria",
    reportsTo: "arquimedes",
  },
};

export function getArquimedesAgent(id: ArquimedesAgentId) {
  return ARQUIMEDES_AGENT_REGISTRY[id];
}
