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
 * Os dados locais (plataforma) são a fonte primária e autoritativa. O MCP é
 * enriquecimento: só é consultado quando o local não tem dados para o item
 * pedido, e a indisponibilidade do MCP nunca pode derrubar a resposta local.
 * Para desligar o enriquecimento, passar `allowFallback = false`.
 */
export class EvidenceSourceRouter implements EvidenceSource {
  constructor(
    private readonly local: EvidenceSource,
    private readonly fallback?: EvidenceSource,
    private readonly allowFallback = true
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

    let fallback: EvidenceResult<T>;
    try {
      fallback = await fallbackResult();
    } catch (error) {
      // Enriquecimento indisponível é degradação, não falha: o local continua valendo.
      return {
        ...local,
        source: "local_db+mcp",
        errors: [
          ...local.errors,
          {
            code: "mcp_fallback_unavailable",
            message: `Fonte de enriquecimento MCP indisponível (${
              error instanceof Error ? error.message : String(error)
            }); dados locais preservados.`,
            retryable: true,
          },
        ],
      };
    }

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
            "A fonte local não possuía dados para este item; a resposta veio do enriquecimento MCP.",
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
