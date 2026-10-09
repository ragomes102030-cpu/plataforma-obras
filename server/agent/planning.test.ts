import { describe, it, expect } from "vitest";
import { gerarPlanoAcao, formatarPlanoAcao } from "./planning";
import type { ProjectModel } from "../../shared/project-model";

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
  dependencies: [
    {
      id: 1,
      projectId: 7,
      externalId: "dep1",
      predecessorId: 1,
      successorId: 1,
      type: "FS",
      lag: 0,
      versionId: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ],
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

describe("gerarPlanoAcao", () => {
  it("deve gerar plano com passos ordenados", () => {
    const plano = gerarPlanoAcao(mockModel, "analise", "Analisar estrutura da obra");
    expect(plano.intencao).toBe("analise");
    expect(plano.objetivo).toBe("Analisar estrutura da obra");
    expect(plano.passos.length).toBeGreaterThan(0);
    expect(plano.passos[0].ordem).toBe(1);
  });

  it("deve incluir ferramentas necessárias quando há atividades", () => {
    const plano = gerarPlanoAcao(mockModel, "analise", "Verificar cronograma");
    expect(plano.ferramentasNecessarias).toContain("validar_estrutura");
    expect(plano.ferramentasNecessarias).toContain("listar_atividades");
  });

  it("deve incluir riscos quando EAP está vazia", () => {
    const emptyModel = { ...mockModel, eap: [] };
    const plano = gerarPlanoAcao(emptyModel, "analise", "Analisar obra sem EAP");
    expect(plano.riscos.length).toBeGreaterThan(0);
    expect(plano.riscos[0]).toContain("EAP vazia");
  });

  it("deve incluir riscos quando orçamento está vazio", () => {
    const emptyBudget = { ...mockModel, budget: { version: null, items: [] } };
    const plano = gerarPlanoAcao(emptyBudget, "analise", "Analisar obra sem orçamento");
    expect(plano.riscos.length).toBeGreaterThan(0);
    expect(plano.riscos[0]).toContain("Sem orçamento");
  });

  it("deve incluir validar_dependencias quando há dependências", () => {
    const plano = gerarPlanoAcao(mockModel, "analise", "Validar dependências");
    expect(plano.ferramentasNecessarias).toContain("validar_dependencias");
  });

  it("deve funcionar com modelo completamente vazio", () => {
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
    const plano = gerarPlanoAcao(emptyModel, "analise", "Analisar obra vazia");
    expect(plano.passos.length).toBeGreaterThan(0);
    expect(plano.riscos.length).toBeGreaterThan(0);
  });
});

describe("formatarPlanoAcao", () => {
  it("deve formatar plano como texto legível", () => {
    const plano = gerarPlanoAcao(mockModel, "analise", "Analisar obra");
    const texto = formatarPlanoAcao(plano);
    expect(texto).toContain("PLANO DE AÇÃO ESTRUTURADO");
    expect(texto).toContain("Intenção: analise");
    expect(texto).toContain("Objetivo: Analisar obra");
    expect(texto).toContain("Passos:");
    expect(texto).toContain("Ferramentas necessárias:");
  });

  it("deve incluir riscos no texto formatado", () => {
    const emptyModel = { ...mockModel, eap: [] };
    const plano = gerarPlanoAcao(emptyModel, "analise", "Analisar obra sem EAP");
    const texto = formatarPlanoAcao(plano);
    expect(texto).toContain("Riscos identificados:");
  });

  it("deve incluir premissas no texto formatado", () => {
    const plano = gerarPlanoAcao(mockModel, "analise", "Analisar obra");
    const texto = formatarPlanoAcao(plano);
    expect(texto).toContain("Premissas:");
  });
});
