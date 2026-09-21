import { describe, expect, it } from "vitest";
import { LocalDatabaseEvidenceSource } from "./evidence-source";
import type { LocalDatabaseReader } from "./domain-types";

function makeReader(
  overrides: Partial<LocalDatabaseReader> = {}
): LocalDatabaseReader {
  return {
    listEapNodes: async () => [],
    getEapNode: async () => null,
    listActivities: async () => [],
    listDependencies: async () => [],
    ...overrides,
  };
}

describe("LocalDatabaseEvidenceSource", () => {
  it("retorna EAP local com aviso explícito quando a obra está vazia", async () => {
    const source = new LocalDatabaseEvidenceSource(makeReader());

    const result = await source.getEapTree(42);

    expect(result.source).toBe("local_db");
    expect(result.projectId).toBe(42);
    expect(result.data).toEqual([]);
    expect(result.warnings).toEqual([
      { code: "empty_eap", message: "Nenhum nó EAP cadastrado para a obra." },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("preserva os dados locais e declara a origem", async () => {
    const source = new LocalDatabaseEvidenceSource(
      makeReader({
        listActivities: async projectId => [
          {
            id: 1,
            projectId,
            externalId: "atv-1",
            eapRef: "1.1",
            wbsCode: "1.1",
            name: "Mobilização",
            phase: "Preparação",
            startOffset: 0,
            durationDays: 5,
            progress: 0,
            status: "Não iniciado",
            critical: 0,
            sortOrder: 1,
          },
        ],
      })
    );

    const result = await source.listActivities(7);

    expect(result.source).toBe("local_db");
    expect(result.data[0]).toMatchObject({
      projectId: 7,
      externalId: "atv-1",
      name: "Mobilização",
      durationDays: 5,
    });
    expect(result.errors).toEqual([]);
  });

  it("converte indisponibilidade do banco em erro estruturado e recuperável", async () => {
    const source = new LocalDatabaseEvidenceSource(
      makeReader({
        listDependencies: async () => {
          throw new Error("connection refused");
        },
      })
    );

    const result = await source.listDependencies(9);

    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      {
        code: "local_database_unavailable",
        message: "connection refused",
        retryable: true,
      },
    ]);
  });

  it("informa quando uma referência EAP não existe", async () => {
    const source = new LocalDatabaseEvidenceSource(makeReader());

    const result = await source.getEapNode(12, "9.9");

    expect(result.data).toBeNull();
    expect(result.warnings).toEqual([
      {
        code: "eap_node_not_found",
        message: "Nó EAP não encontrado: 9.9.",
        entityRef: "9.9",
      },
    ]);
  });
});
