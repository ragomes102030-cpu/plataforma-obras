import { describe, it, expect } from "vitest";
import { summarizeProjectModel } from "./project-model";
import type { ProjectModel } from "./project-model";

// ---------------------------------------------------------------------------
// Dados mockados
// ---------------------------------------------------------------------------

const mockModel: ProjectModel = {
  project: {
    id: 7,
    ownerUserId: 1,
    code: "ARQUIMEDES-QA",
    name: "ARQUIMEDES — Ambiente QA",
    location: "Ambiente isolado de testes",
    status: "Planejamento",
    progress: 0,
    descricao: "Obra técnica exclusiva para testes automatizados.",
    tipoDeObra: "edificio",
    plannedStart: new Date("2026-10-01T00:00:00Z"),
    plannedFinish: new Date("2027-03-30T00:00:00Z"),
    baseReferencia: "SEINFRA",
    baseReferenciaRef: "028.1",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    deletedAt: null,
    deletedAtBy: null,
  },
  currentVersion: {
    id: 1,
    projectId: 7,
    versionNumber: 1,
    status: "approved",
    baseVersionId: null,
    createdBy: 1,
    notes: "Versão inicial",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
  },
  eap: [
    {
      id: 1,
      projectId: 7,
      externalId: "1",
      externalUid: "root",
      parentId: null,
      code: "1",
      name: "Obra completa",
      description: null,
      inclusions: null,
      exclusions: null,
      location: null,
      responsible: null,
      acceptanceCriteria: null,
      decompositionBasis: null,
      scopeStatus: "aprovado",
      level: 1,
      nodeType: "grupo",
      unit: null,
      plannedQuantity: null,
      versionId: 1,
      sortOrder: 0,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ],
  activities: [
    {
      id: 1,
      projectId: 7,
      wbsNodeId: 1,
      externalId: "1.1",
      eapRef: null,
      wbsCode: "1.1",
      name: "Demolições",
      phase: "Demolições",
      pavimento: null,
      startOffset: 0,
      durationDays: 5,
      plannedQuantity: "100.000",
      unit: "m3",
      productivity: "20.000",
      budgetItemId: null,
      progress: 0,
      exemplo: 0,
      status: "Não iniciado",
      critical: 0,
      earlyStart: 0,
      earlyFinish: 5,
      lateStart: 0,
      lateFinish: 5,
      totalFloat: 0,
      freeFloat: 0,
      mustStartOn: null,
      finishNoLaterThan: null,
      cpmCalculatedAt: null,
      versionId: 1,
      sortOrder: 0,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
  ],
  dependencies: [],
  budget: {
    version: {
      id: 1,
      projectId: 7,
      name: "Orçamento v1",
      versionNumber: 1,
      status: "aprovado",
      currency: "BRL",
      notes: null,
      createdBy: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
    items: [
      {
        id: 1,
        budgetVersionId: 1,
        wbsNodeId: 1,
        code: "1.1",
        description: "Demolições",
        unit: "m3",
        quantity: "100.000",
        unitPrice: "50.00",
        compositionId: null,
        compositionUnitCost: null,
        productivity: null,
        plannedDurationDays: null,
        source: "SEINFRA",
        referencePeriod: "028.1",
        compositionNote: null,
        isPriceException: false,
        sortOrder: 0,
        createdAt: new Date("2026-10-01T00:00:00Z"),
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      },
    ],
  },
  resources: [],
  production: {
    fronts: [],
    teams: [],
    entries: [
      {
        id: 1,
        projectId: 7,
        frontId: null,
        teamId: null,
        unitId: null,
        activityId: 1,
        productionDate: new Date("2026-10-05T00:00:00Z"),
        quantity: "50.000",
        measurementUnit: "m3",
        notes: null,
        status: "confirmada",
        exemplo: 0,
        createdBy: 1,
        createdAt: new Date("2026-10-05T00:00:00Z"),
        updatedAt: new Date("2026-10-05T00:00:00Z"),
      },
    ],
  },
  baselines: [],
  mcpIntegrations: [],
};

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("summarizeProjectModel", () => {
  it("deve gerar resumo com todos os campos", () => {
    const summary = summarizeProjectModel(mockModel);
    expect(summary).toContain("ARQUIMEDES-QA");
    expect(summary).toContain("1 nó");
    expect(summary).toContain("1 atividade");
    expect(summary).toContain("R$ 5.000,00");
    expect(summary).toContain("50");
  });

  it("deve calcular orçamento total corretamente", () => {
    const summary = summarizeProjectModel(mockModel);
    // 100 m3 × R$ 50,00 = R$ 5.000,00
    expect(summary).toContain("R$ 5.000,00");
  });

  it("deve calcular progresso de produção corretamente", () => {
    const summary = summarizeProjectModel(mockModel);
    // 50 de 100 = 50%
    expect(summary).toContain("50");
  });

  it("deve funcionar com modelo vazio", () => {
    const emptyModel: ProjectModel = {
      ...mockModel,
      eap: [],
      activities: [],
      dependencies: [],
      budget: { version: null, items: [] },
      resources: [],
      production: { fronts: [], teams: [], entries: [] },
      baselines: [],
      mcpIntegrations: [],
    };
    const summary = summarizeProjectModel(emptyModel);
    expect(summary).toContain("0 nós");
    expect(summary).toContain("0 atividades");
    expect(summary).toContain("R$ 0,00");
  });
});
