export type ArquimedesStage =
  | "DESCRITIVO" | "EAP_PROPOSTA" | "EAP_REVISAO" | "ATIVIDADES_PROPOSTA"
  | "DEPENDENCIAS_PROPOSTA" | "CPM_VALIDADO" | "CRONOGRAMA_PROPOSTO"
  | "BASELINE_PROPOSTA" | "GANTT_LOB_PROPOSTO" | "CONTROLE";

export type ArquimedesFindingSeverity = "blocker" | "alert" | "recommendation";

export interface ArquimedesProjectContext {
  projectId: number;
  name: string;
  description?: string | null;
  tipoDeObra?: string | null;
  stage: ArquimedesStage;
  wbs: Array<{
    id: number; code: string; name: string; parentId: number | null; level: number;
    nodeType: "grupo" | "pacote" | "entrega";
    unit?: string | null; plannedQuantity?: number | string | null;
    location?: string | null; responsible?: string | null;
    description?: string | null; inclusions?: string | null; exclusions?: string | null;
    acceptanceCriteria?: string | null;
  }>;
}

export interface ArquimedesSkill {
  id: string; version: string; domain: string; purpose: string; content: string;
}

export interface ArquimedesEapProposal {
  action: "propose_eap";
  basis: string[];
  assumptions: string[];
  missingInformation: string[];
  resolutionSummary?: string[];
  validation?: {
    valid: boolean;
    issues: Array<{
      code: string;
      severity: "error" | "warning";
      message: string;
      entityRef?: string;
    }>;
  };
  nodes: Array<{
    operation: "create" | "update" | "move" | "remove";
    nodeId?: number;
    parentCode: string | null;
    code?: string;
    name: string;
    nodeType: "grupo" | "pacote" | "entrega";
    location?: string | null;
    unit?: string | null;
    plannedQuantity?: number | null;
    description?: string | null;
    inclusions?: string | null;
    exclusions?: string | null;
    responsible?: string | null;
    acceptanceCriteria?: string | null;
    decompositionBasis?: "project" | "deliverable" | "system" | "discipline" | "location" | "phase" | "component" | "other";
    rationale: string;
  }>;
}

export interface ArquimedesLlmRequest {
  system: string;
  user: string;
  skills: ArquimedesSkill[];
  maxTokens?: number;
  databaseContext?: { projectId: number };
  eapReviewMode?: "analisar" | "resolver_bloqueios";
  agentId?: "euclides" | "newton" | "fibonacci" | "gauss" | "hipatia";
  orchestratorId?: "arquimedes";
  eapResolutionTargets?: Array<{
    code: string;
    nodeId: number;
    name: string;
    parentCode: string | null;
    inclusions?: string | null;
    exclusions?: string | null;
    description?: string | null;
  }>;
  researchEvidence?: ArquimedesResearchEvidence[];
}

export interface ArquimedesLlmProvider {
  complete(request: ArquimedesLlmRequest): Promise<string>;
}
