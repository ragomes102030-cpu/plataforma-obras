import { describe, expect, it } from "vitest";
import type { AgentProjectContext } from "../../agent";
import { resolveLocalEapToolFallback } from "./local-eap-tool-fallback";

const context: AgentProjectContext = {
  project: {
    code: "OB-ZP1H2K",
    name: "QA EAP SCOPE 2026-10-08",
    location: "Eusébio - CE",
    tipoDeObra: "edificio",
    descricao: "Edifício residencial multifamiliar de seis pavimentos.",
    status: "Planejamento",
    progress: 0,
    plannedStart: "2026-10-08",
    plannedFinish: "2027-04-06",
  },
  activities: [],
  evidence: {
    source: "local_db",
    eapNodeCount: 3,
    activityCount: 0,
    dependencyCount: 0,
    warnings: [],
    errors: [],
    eapSnapshot: [
      { id: 1, code: "1", name: "Edifício", parentId: null, level: 1, nodeType: "grupo", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: null },
      { id: 2, code: "1.1", name: "Estrutura", parentId: 1, level: 2, nodeType: "pacote", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: "phase" },
      { id: 3, code: "1.2", name: "Instalações", parentId: 1, level: 2, nodeType: "pacote", location: null, responsible: null, unit: null, plannedQuantity: null, description: null, inclusions: null, exclusions: null, acceptanceCriteria: null, scopeStatus: "rascunho", decompositionBasis: "phase" },
    ],
  },
};

describe("resolveLocalEapToolFallback", () => {
  it("does not invent an external or internal project ID in the returned local tree", () => {
    const raw = resolveLocalEapToolFallback("get_eap_tree", context);
    const result = JSON.parse(raw!);
    expect(result.projectCode).toBe("OB-ZP1H2K");
    expect(result.nodes[0]).not.toHaveProperty("projectId");
    expect(result.nodes[0]).not.toHaveProperty("externalId");
  });

  it("validates the persisted EAP structure without an external MCP mapping", () => {
    const raw = resolveLocalEapToolFallback("validar_estrutura", context);
    expect(raw).not.toBeNull();
    const result = JSON.parse(raw!);
    expect(result.source).toBe("local_db");
    expect(result.fallback).toBe(true);
    expect(result.totalNodes).toBe(3);
    expect(result.leaves).toBe(2);
    expect(result.dictionaryCoveragePercent).toBe(0);
  });

  it("keeps the 100 percent rule undecidable without structured scope items", () => {
    const raw = resolveLocalEapToolFallback("validar_regra_100_porcento", context);
    const result = JSON.parse(raw!);
    expect(result.status).toBe("indecidivel");
    expect(result.coveragePercent).toBeNull();
    expect(result.scopeItemCount).toBeNull();
    expect(result.message).toContain("descrição textual não fornece denominador auditável");
  });

  it("reports unassigned terminal packages and does not emulate mutations", () => {
    const raw = resolveLocalEapToolFallback("pacotes_sem_dono", context);
    expect(JSON.parse(raw!).unassignedCount).toBe(2);
    expect(resolveLocalEapToolFallback("criar_eap_node", context)).toBeNull();
  });
});
