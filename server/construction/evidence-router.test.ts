import { describe, expect, it } from "vitest";
import { EvidenceSourceRouter } from "./evidence-router";
import type { EvidenceSource } from "./domain-types";

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    getEapTree: async () => ({
      source: "local_db",
      projectId: 1,
      data: [],
      warnings: [],
      errors: [],
    }),
    getEapNode: async () => ({
      source: "local_db",
      projectId: 1,
      data: null,
      warnings: [],
      errors: [],
    }),
    listActivities: async () => ({
      source: "local_db",
      projectId: 1,
      data: [],
      warnings: [],
      errors: [],
    }),
    listDependencies: async () => ({
      source: "local_db",
      projectId: 1,
      data: [],
      warnings: [],
      errors: [],
    }),
    ...overrides,
  };
}

describe("EvidenceSourceRouter", () => {
  it("preserva dados locais quando a fonte local possui atividades", async () => {
    const router = new EvidenceSourceRouter(
      source({
        listActivities: async () => ({
          source: "local_db",
          projectId: 1,
          data: [
            {
              id: 1,
              projectId: 1,
              externalId: "local-1",
              eapRef: "1.1",
              wbsCode: "1.1",
              name: "Atividade local",
              phase: "Preparação",
              startOffset: 0,
              durationDays: 2,
              progress: 0,
              status: "Não iniciado",
              critical: 0,
              sortOrder: 1,
            },
          ],
          warnings: [],
          errors: [],
        }),
      }),
      source({
        listActivities: async () => ({
          source: "mcp",
          projectId: 1,
          data: [],
          warnings: [],
          errors: [],
        }),
      })
    );

    const result = await router.listActivities(1);

    expect(result.source).toBe("local_db");
    expect(result.data?.[0].externalId).toBe("local-1");
    expect(result.warnings).toEqual([]);
  });

  it("usa o fallback quando o banco local está vazio e registra a origem", async () => {
    const router = new EvidenceSourceRouter(
      source(),
      source({
        getEapTree: async () => ({
          source: "mcp",
          projectId: 1,
          data: [
            {
              id: 2,
              projectId: 1,
              externalId: "mcp-1",
              externalUid: null,
              parentId: null,
              code: "1",
              name: "EAP MCP",
              level: 1,
              nodeType: "grupo",
              unit: null,
              plannedQuantity: null,
              sortOrder: 1,
            },
          ],
          warnings: [],
          errors: [],
        }),
      })
    );

    const result = await router.getEapTree(1);

    expect(result.source).toBe("mcp");
    expect(result.data?.[0].externalId).toBe("mcp-1");
    expect(result.warnings[0]).toMatchObject({ code: "local_empty_fallback" });
  });

  it("mantém o resultado local e o erro quando nenhuma fonte alternativa está disponível", async () => {
    const router = new EvidenceSourceRouter(
      source({
        listDependencies: async () => ({
          source: "local_db",
          projectId: 1,
          data: null,
          warnings: [],
          errors: [
            {
              code: "local_database_unavailable",
              message: "offline",
              retryable: true,
            },
          ],
        }),
      })
    );

    const result = await router.listDependencies(1);

    expect(result.source).toBe("local_db");
    expect(result.data).toBeNull();
    expect(result.errors[0]?.code).toBe("local_database_unavailable");
  });

  it("preserva o erro do MCP quando o local está vazio e o fallback falha", async () => {
    const router = new EvidenceSourceRouter(
      source(),
      source({
        getEapTree: async () => ({
          source: "mcp",
          projectId: 1,
          data: null,
          warnings: [],
          errors: [
            {
              code: "mcp_eap_unavailable",
              message: "MCP 502: Bad Gateway",
              retryable: true,
            },
          ],
        }),
      })
    );

    const result = await router.getEapTree(1);

    expect(result.source).toBe("local_db+mcp");
    expect(result.data).toEqual([]);
    expect(result.errors).toMatchObject([
      { code: "mcp_eap_unavailable", message: "MCP 502: Bad Gateway" },
    ]);
  });
});
