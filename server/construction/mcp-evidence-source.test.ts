import { describe, expect, it } from "vitest";
import type { McpCallResult } from "../integrations/mcp-client";
import {
  ConstructionMcpEvidenceSource,
  McpEvidenceSource,
} from "./mcp-evidence-source";

const eapPayload = {
  raizes: [
    {
      eap_id: "1",
      uid: "root",
      nivel: 1,
      nome: "Edificação",
      filhos: [
        {
          eap_id: "1.1",
          uid: "foundation",
          parent_id: "1",
          nivel: 2,
          nome: "Fundação",
          unidade: "m³",
          quantidade: 180,
          filhos: [],
        },
      ],
    },
  ],
};

const activitiesPayload = {
  atividades: [
    {
      id: "atv-1",
      eap_ref: "1.1",
      nome: "Executar fundações",
      duracao_dias: 20,
      percentual_concluido: 0,
      critica: 1,
    },
  ],
};

const dependenciesPayload = {
  dependencias: [
    {
      id: "dep-1",
      predecessora_id: "atv-1",
      sucessora_id: "atv-2",
      tipo: "TI",
      lag_dias: 2,
    },
  ],
};

describe("McpEvidenceSource", () => {
  it("normaliza EAP hierárquica preservando referências externas", async () => {
    const source = new McpEvidenceSource(
      "external-eap",
      async (_domain, toolName, args) => {
        expect(toolName).toBe("get_eap_tree");
        expect(args).toEqual({ project_id: "external-eap" });
        return { structuredContent: eapPayload };
      }
    );

    const result = await source.getEapTree(10);

    expect(result.source).toBe("mcp");
    expect(result.data).toHaveLength(2);
    expect(result.data?.[1]).toMatchObject({
      externalId: "1.1",
      externalUid: "foundation",
      parentId: "1",
      name: "Fundação",
      plannedQuantity: 180,
    });
  });

  it("normaliza atividades e dependências com tipos de precedência", async () => {
    const source = new ConstructionMcpEvidenceSource(
      { cronograma: "external-schedule" },
      async (_domain, toolName, args) => {
        expect(args).toEqual({ project_id: "external-schedule" });
        return {
          structuredContent:
            toolName === "listar_atividades"
              ? activitiesPayload
              : dependenciesPayload,
        };
      }
    );

    const activities = await source.listActivities(10);
    const dependencies = await source.listDependencies(10);

    expect(activities.data?.[0]).toMatchObject({
      id: "atv-1",
      eapRef: "1.1",
      durationDays: 20,
      critical: 1,
    });
    expect(dependencies.data?.[0]).toMatchObject({
      predecessorId: "atv-1",
      successorId: "atv-2",
      type: "FS",
      lag: 2,
    });
  });

  it("preserva HTTP 502 como erro MCP e não como lista vazia silenciosa", async () => {
    const source = new McpEvidenceSource("external-eap", async () => {
      throw new Error("MCP 502: Bad Gateway");
    });

    const result = await source.getEapTree(10);

    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      {
        code: "mcp_eap_unavailable",
        message: "MCP 502: Bad Gateway",
        retryable: true,
      },
    ]);
  });

  it("marca vínculo ausente sem fazer chamada externa", async () => {
    let called = false;
    const source = new ConstructionMcpEvidenceSource({}, async () => {
      called = true;
      return {} as McpCallResult;
    });

    const result = await source.listActivities(10);

    expect(called).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors[0]).toMatchObject({
      code: "mcp_project_mapping_missing",
      retryable: false,
    });
  });
});
