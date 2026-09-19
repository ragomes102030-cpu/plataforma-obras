import type { AgentProjectContext } from "../agent";

export const AGENT_SECTIONS = [
  "portfolio",
  "eap",
  "cronograma",
  "producao",
  "medicao",
  "gantt",
  "lob",
  "restricoes",
  "relatorios",
] as const;

export type AgentSection = (typeof AGENT_SECTIONS)[number];

export type AgentWorkspaceView = {
  activeSection: AgentSection;
  activeSubtab?: "gantt" | "table" | "lob";
  selectedActivityId?: number;
  contextMode?: "focused" | "full";
};

export function buildAgentProjectContext(
  project: AgentProjectContext["project"],
  activities: AgentProjectContext["activities"],
  view: AgentWorkspaceView
): AgentProjectContext {
  return {
    project,
    activities,
    workspace: {
      activeSection: view.activeSection,
      activeSubtab: view.activeSubtab,
      selectedActivityId: view.selectedActivityId,
      contextMode: view.contextMode ?? "focused",
    },
  };
}

export function sectionLabel(section: AgentSection) {
  const labels: Record<AgentSection, string> = {
    portfolio: "Painel da obra",
    eap: "EAP",
    cronograma: "Cronograma",
    producao: "Produção",
    medicao: "Medição",
    gantt: "Gantt",
    lob: "Linha de Balanço",
    restricoes: "Restrições",
    relatorios: "Relatórios",
  };
  return labels[section];
}
