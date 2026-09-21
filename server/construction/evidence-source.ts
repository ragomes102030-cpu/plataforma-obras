import {
  type EapEvidenceNode,
  type EvidenceResult,
  type EvidenceSource,
  type LocalDatabaseReader,
  type ScheduleEvidenceActivity,
  type ScheduleEvidenceDependency,
  unavailableEvidence,
} from "./domain-types";

export class LocalDatabaseEvidenceSource implements EvidenceSource {
  constructor(private readonly reader: LocalDatabaseReader) {}

  async getEapTree(
    projectId: number
  ): Promise<EvidenceResult<EapEvidenceNode[]>> {
    try {
      const data = await this.reader.listEapNodes(projectId);
      return {
        source: "local_db",
        projectId,
        data,
        warnings:
          data.length === 0
            ? [
                {
                  code: "empty_eap",
                  message: "Nenhum nó EAP cadastrado para a obra.",
                },
              ]
            : [],
        errors: [],
      };
    } catch (error) {
      return unavailableEvidence<EapEvidenceNode[]>(projectId, error);
    }
  }

  async getEapNode(
    projectId: number,
    ref: string
  ): Promise<EvidenceResult<EapEvidenceNode | null>> {
    try {
      const data = await this.reader.getEapNode(projectId, ref);
      return {
        source: "local_db",
        projectId,
        data,
        warnings: data
          ? []
          : [
              {
                code: "eap_node_not_found",
                message: `Nó EAP não encontrado: ${ref}.`,
                entityRef: ref,
              },
            ],
        errors: [],
      };
    } catch (error) {
      return unavailableEvidence<EapEvidenceNode | null>(projectId, error);
    }
  }

  async listActivities(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceActivity[]>> {
    try {
      const data = await this.reader.listActivities(projectId);
      return {
        source: "local_db",
        projectId,
        data,
        warnings:
          data.length === 0
            ? [
                {
                  code: "empty_schedule",
                  message: "Nenhuma atividade cadastrada para a obra.",
                },
              ]
            : [],
        errors: [],
      };
    } catch (error) {
      return unavailableEvidence<ScheduleEvidenceActivity[]>(projectId, error);
    }
  }

  async listDependencies(
    projectId: number
  ): Promise<EvidenceResult<ScheduleEvidenceDependency[]>> {
    try {
      const data = await this.reader.listDependencies(projectId);
      return {
        source: "local_db",
        projectId,
        data,
        warnings: [],
        errors: [],
      };
    } catch (error) {
      return unavailableEvidence<ScheduleEvidenceDependency[]>(
        projectId,
        error
      );
    }
  }
}
