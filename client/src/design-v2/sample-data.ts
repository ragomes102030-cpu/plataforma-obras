/**
 * Dados 100% fictícios para revisão de UI. Nenhuma chamada de API.
 * Nunca usar como fonte de dados reais da Plataforma Obras.
 */
export type StageStatus = "Concluída" | "Em andamento" | "Não iniciada" | "Atrasada";
export type Activity = {
  id: string;
  code: string;
  name: string;
  eap: string;
  duration: number;
  start: string;
  end: string;
  progress: number;
  status: StageStatus;
  critical: boolean;
  offset: number;
  span: number;
  owner: string;
  predecessor: string;
  description: string;
};
export type WbsItem = {
  code: string;
  name: string;
  type: "Fase" | "Pacote";
  parent?: string;
  status: "Aprovada" | "Em revisão" | "Pendente";
  completion: string;
};

export const project = {
  name: "Residencial Horizonte",
  code: "DEMO-V2-001",
  location: "Fortaleza, CE",
  description: "Edifício residencial multifamiliar · cenário fictício",
  start: "02/11/2026",
  finish: "30/06/2027",
};

export const wbsItems: WbsItem[] = [
  { code: "1.1", name: "Preparação e mobilização", type: "Fase", status: "Aprovada", completion: "Implantação concluída e liberada." },
  { code: "1.1.1", name: "Canteiro e instalações provisórias", type: "Pacote", parent: "1.1", status: "Aprovada", completion: "Estruturas provisórias inspecionadas." },
  { code: "1.1.2", name: "Locação da obra", type: "Pacote", parent: "1.1", status: "Aprovada", completion: "Gabarito conferido pela engenharia." },
  { code: "1.2", name: "Infraestrutura", type: "Fase", status: "Aprovada", completion: "Fundações liberadas para a superestrutura." },
  { code: "1.2.1", name: "Escavações e contenções", type: "Pacote", parent: "1.2", status: "Aprovada", completion: "Serviços executados e inspecionados." },
  { code: "1.2.2", name: "Blocos de fundação", type: "Pacote", parent: "1.2", status: "Aprovada", completion: "Concretagem e ensaios aceitos." },
  { code: "1.3", name: "Superestrutura", type: "Fase", status: "Em revisão", completion: "Estrutura recebida conforme projeto." },
  { code: "1.3.1", name: "Pilares e vigas do térreo", type: "Pacote", parent: "1.3", status: "Em revisão", completion: "Fôrmas, armação e concretagem liberadas." },
  { code: "1.3.2", name: "Lajes dos pavimentos", type: "Pacote", parent: "1.3", status: "Pendente", completion: "Lajes concretadas e desformadas." },
  { code: "1.4", name: "Vedações e instalações", type: "Fase", status: "Pendente", completion: "Testes de instalações e inspeções aprovados." },
  { code: "1.4.1", name: "Alvenarias internas", type: "Pacote", parent: "1.4", status: "Pendente", completion: "Vedações concluídas e inspecionadas." },
  { code: "1.4.2", name: "Instalações hidrossanitárias", type: "Pacote", parent: "1.4", status: "Pendente", completion: "Testes de estanqueidade aprovados." },
];

export const initialActivities: Activity[] = [
  { id: "AT-001", code: "A01", name: "Montagem do canteiro", eap: "1.1.1", duration: 8, start: "02/11/2026", end: "09/11/2026", progress: 100, status: "Concluída", critical: false, offset: 0, span: 1, owner: "Equipe de produção", predecessor: "—", description: "Instalações provisórias, tapumes e ponto de apoio." },
  { id: "AT-002", code: "A02", name: "Locação e gabarito", eap: "1.1.2", duration: 5, start: "09/11/2026", end: "13/11/2026", progress: 100, status: "Concluída", critical: true, offset: 1, span: 1, owner: "Topografia", predecessor: "AT-001", description: "Locação dos eixos e conferência da referência de nível." },
  { id: "AT-003", code: "A03", name: "Escavações", eap: "1.2.1", duration: 15, start: "16/11/2026", end: "30/11/2026", progress: 65, status: "Em andamento", critical: true, offset: 2, span: 2, owner: "Terraplenagem", predecessor: "AT-002", description: "Escavação e contenção das áreas de fundação." },
  { id: "AT-004", code: "A04", name: "Blocos de fundação", eap: "1.2.2", duration: 22, start: "30/11/2026", end: "21/12/2026", progress: 20, status: "Atrasada", critical: true, offset: 4, span: 3, owner: "Equipe de estrutura", predecessor: "AT-003", description: "Fôrmas, armaduras e concretagem dos blocos." },
  { id: "AT-005", code: "A05", name: "Pilares e vigas do térreo", eap: "1.3.1", duration: 18, start: "21/12/2026", end: "07/01/2027", progress: 0, status: "Não iniciada", critical: true, offset: 7, span: 3, owner: "Equipe de estrutura", predecessor: "AT-004", description: "Fôrmas, armação e concretagem das peças estruturais." },
  { id: "AT-006", code: "A06", name: "Laje do primeiro pavimento", eap: "1.3.2", duration: 12, start: "11/01/2027", end: "22/01/2027", progress: 0, status: "Não iniciada", critical: true, offset: 10, span: 2, owner: "Equipe de estrutura", predecessor: "AT-005", description: "Armação, escoramento e concretagem da laje." },
];

export const weeks = ["02 NOV", "09 NOV", "16 NOV", "23 NOV", "30 NOV", "07 DEZ", "14 DEZ", "21 DEZ", "28 DEZ", "04 JAN", "11 JAN", "18 JAN"];
