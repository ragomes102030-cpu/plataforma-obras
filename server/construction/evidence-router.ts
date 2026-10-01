import type {
  EapEvidenceNode,
  EvidenceResult,
  EvidenceSource,
  EvidenceWarning,
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";

function hasData<T>(result: EvidenceResult<T>) {
  return result.data !== null && result.errors.length === 0;
}

/**
 * Local platform data is authoritative. MCP evidence is opt-in and must not
 * become an implicit runtime dependency of the core platform.
 */
export class EvidenceSourceRouter implements EvidenceSource {
  constructor(
    private readonly local: EvidenceSource,
    private readonly fallback?: EvidenceSource
  ) {}

  private async choose<T>(
    localResult: Promise<EvidenceResult<T>>,
    fallbackResult: () => Promise<EvidenceResult<T>>,
    fallbackCode: string
  ): Promise<EvidenceResult<T>> {
    const local = await localResult;
    if (hasData(local) && !Array.isArray(local.data)) return local;
    if (hasData(local) && Array.isArray(local.data) && local.data.length > 0) {
      return local;
    }
    if (!this.allowFallback || !this.fallback) return local;

    const fallback = await fallbackResult();
    if (!hasData(fallback)) {
      return {
        ...local,
        source: "local_db+mcp",
        warnings: [...local.warnings, ...fallback.warnings],
        errors: [...local.errors, ...fallback.errors],
      };
    }

    return {
      ...fallback,
      warnings: [
        ...fallback.warnings,
        {
          code: fallbackCode,
          message:
            "A fonte local não possuía dados suficientes; foi usada explicitamente a fonte de fallback MCP.",
        },
      ],
    };
  }

  getEapTree(projectId: number): Promise<EvidenceResult<EapEvidenceNode[]>> {
    return this.choose(
      this.local.getEapTree(projectId),
      () => this.fallback!.getEapTree(projectId),
      "local_empty_fallback"
    );
  }

  getEapNode(
    projectId: number,
    ref: string
  ): Promise<EvidenceResult<EapEvidenceNode | null>> {
    return this.choose(
      this.local.getEapNode(projectId, ref),
      () => this.fallback!.getEapNode(projectId, ref),
      "local_node_fallback"
    );
  }

  listActivities(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceActivity[]>> {
    return this.choose(
      this.local.listActivities(projectId),
      () => this.fallback!.listActivities(projectId),
      "local_empty_fallback"
    );
  }

  listDependencies(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceDependency[]>> {
    return this.choose(
      this.local.listDependencies(projectId),
      () => this.fallback!.listDependencies(projectId),
      "local_empty_fallback"
    );
  }
}
