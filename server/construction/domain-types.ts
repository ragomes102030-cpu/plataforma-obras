export type EvidenceSourceKind = "local_db" | "mcp" | "local_db+mcp";

export type EvidenceWarning = {
  code: string;
  message: string;
  entityRef?: string;
};

export type EvidenceError = {
  code: string;
  message: string;
  retryable?: boolean;
};

export type EapEvidenceNode = {
  id: number | string;
  projectId: number;
  externalId: string | null;
  externalUid: string | null;
  parentId: number | string | null;
  code: string;
  name: string;
  level: number;
  nodeType: "grupo" | "pacote" | "entrega";
  unit: string | null;
  plannedQuantity: number | string | null;
  decompositionBasis?: string | null;
  sortOrder: number;
};

export type ScheduleEvidenceActivity = {
  id: number | string;
  projectId: number;
  externalId: string | null;
  eapRef: string | null;
  wbsCode: string;
  name: string;
  phase: string;
  startOffset: number;
  durationDays: number;
  progress: number;
  status: string;
  critical: number;
  sortOrder: number;
  /** Índice do dia útil (CPM) derivado de mustStartOn (timestamp). */
  mustStartOnDay?: number | null;
  /** Índice do dia útil (CPM) derivado de finishNoLaterThan (timestamp). */
  finishNoLaterThanDay?: number | null;
};

export type ScheduleEvidenceDependency = {
  id: number | string;
  projectId: number;
  externalId: string | null;
  predecessorId: number | string;
  successorId: number | string;
  type: "FS" | "SS" | "FF" | "SF";
  lag: number;
};

export type EvidenceResult<T> = {
  source: EvidenceSourceKind;
  projectId: number;
  data: T | null;
  warnings: EvidenceWarning[];
  errors: EvidenceError[];
};

export type LocalDatabaseReader = {
  listEapNodes(projectId: number): Promise<EapEvidenceNode[]>;
  getEapNode(projectId: number, ref: string): Promise<EapEvidenceNode | null>;
  listActivities(projectId: number): Promise<ScheduleEvidenceActivity[]>;
  listDependencies(projectId: number): Promise<ScheduleEvidenceDependency[]>;
};

export type EvidenceSource = {
  getEapTree(projectId: number): Promise<EvidenceResult<EapEvidenceNode[]>>;
  getEapNode(
    projectId: number,
    ref: string
  ): Promise<EvidenceResult<EapEvidenceNode | null>>;
  listActivities(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceActivity[]>>;
  listDependencies(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceDependency[]>>;
};

export function unavailableEvidence<T>(
  projectId: number,
  error: unknown
): EvidenceResult<T> {
  const message =
    error instanceof Error ? error.message : "Banco local indisponível.";
  return {
    source: "local_db",
    projectId,
    data: null,
    warnings: [],
    errors: [{ code: "local_database_unavailable", message, retryable: true }],
  };
}

export function failedEvidence<T>(
  source: EvidenceSourceKind,
  projectId: number,
  code: string,
  error: unknown,
  retryable = true
): EvidenceResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source,
    projectId,
    data: null,
    warnings: [],
    errors: [{ code, message, retryable }],
  };
}
