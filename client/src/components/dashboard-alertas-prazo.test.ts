import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agregadoDoCronograma, CALENDARIO_CORRIDO, gradeDoCronograma } from "@shared/cronograma-colunas";
import { PainelDoCronograma } from "./PainelDoCronograma";

const mocks = vi.hoisted(() => ({ queries: {} as Record<string, any> }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    planning: {
      list: { useQuery: () => mocks.queries.plano },
      lookahead: { useQuery: () => mocks.queries.lookahead },
      activityScheduleStatusSummary: { useQuery: () => mocks.queries.andamentoPrazo },
      activityScheduleForecast: { useQuery: () => mocks.queries.previsaoPrazo },
      compararComBaseline: { useQuery: () => mocks.queries.baseline },
      validateEngineeringCoherence: { useQuery: () => mocks.queries.coerencia },
    },
    budgets: { list: { useQuery: () => mocks.queries.orcamento } },
    production: { entries: { useQuery: () => mocks.queries.producao } },
  },
}));

vi.mock("./CurvaSControlTower", () => ({ CurvaSControlTower: () => null }));

const atividade = {
  id: 1,
  wbsNodeId: 101,
  wbsCode: "1.1.1",
  name: "Compatibilizar e liberar projetos",
  phase: "Projetos",
  durationDays: 5,
  earlyStart: 0,
  plannedQuantity: 100,
  unit: "m2",
  budgetItemId: null,
  physicalWeight: null,
  physicalWeightEvidence: null,
  physicalWeightApprovedAt: null,
  cpmCalculatedAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
};

const linhas = gradeDoCronograma(CALENDARIO_CORRIDO, "2026-11-26", [{
  activityId: 1,
  codigo: "1.1.1",
  atividade: "Compatibilizar e liberar projetos",
  frente: "Projetos",
  pavimento: null,
  inicio: "2026-11-13",
  duracao: 5,
  quantidade: 100,
  unidade: "m2",
  executado: 0,
  medicaoConfirmada: false,
}]);

describe("alertas de prazo da Dashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    mocks.queries = {
      plano: {
        data: {
          activities: [atividade],
          hasApprovedEap: true,
          eapApproved: true,
          currentVersionStatus: "aprovado",
          networkValidation: { valid: true },
          baselines: [],
        },
        isPending: false,
        isError: false,
      },
      orcamento: { data: { items: [], total: 0, versions: [], activeVersionId: null }, isPending: false, isError: false },
      producao: { data: [], isPending: false, isError: false },
      lookahead: { data: { available: true, totalBloqueadas: 0, ppcCorrente: null, semanas: [] }, isPending: false, isError: false },
      andamentoPrazo: {
        data: {
          totalActivities: 1,
          activitiesWithUpdate: 0,
          activitiesWithoutUpdate: 1,
          overdueCount: 0,
          statusCounts: { nao_iniciada: 0, em_andamento: 0, concluida: 0, bloqueada: 0 },
          currentStates: [],
          lastPositionDate: null,
        },
        isPending: false,
        isError: false,
      },
      previsaoPrazo: {
        data: {
          available: true,
          plannedFinishDate: "2029-05-04",
          forecastFinishDate: "2029-05-17",
          activitiesWithUpdate: 0,
          totalActivities: 1,
          outOfSequenceActivityIds: [],
          warnings: [],
          unavailableReason: null,
        },
        isPending: false,
        isError: false,
      },
      baseline: { data: { resumo: { atrasoNoFim: null }, linhas: [] }, isPending: false, isError: false },
      coerencia: { data: { issues: [], resumo: { valorEmRisco: 0 } }, isPending: false, isError: false },
    };
  });

  it("não transforma fim planejado passado em atraso observado sem relatos de campo", () => {
    expect(linhas[0]?.status).toBe("Atrasado");

    const html = renderToStaticMarkup(createElement(PainelDoCronograma, {
      projetoId: 26,
      agregado: agregadoDoCronograma(linhas),
      linhas,
      inicioObra: "2026-11-13",
      carregandoGrade: false,
      nomeObra: "Residencial Piazza",
      hojeReferencia: "2026-11-26",
    }));

    expect(html).toContain("0 previsões vencidas");
    expect(html).toContain("0/1 atualizadas");
    expect(html).not.toContain("1 atividade(s) atrasada(s)");
  });

  it("mantém no radar uma previsão vencida informada em campo", () => {
    mocks.queries.andamentoPrazo.data = {
      ...mocks.queries.andamentoPrazo.data,
      activitiesWithUpdate: 1,
      activitiesWithoutUpdate: 0,
      overdueCount: 1,
      statusCounts: { nao_iniciada: 0, em_andamento: 1, concluida: 0, bloqueada: 0 },
      currentStates: [{
        activityId: 1,
        status: "em_andamento",
        positionDate: "2026-11-26",
        actualStartDate: "2026-11-13",
        actualFinishDate: null,
        forecastFinishDate: "2026-11-19",
        remainingDurationDays: 3,
        blockerReason: null,
      }],
    };

    const html = renderToStaticMarkup(createElement(PainelDoCronograma, {
      projetoId: 26,
      agregado: agregadoDoCronograma(linhas),
      linhas,
      inicioObra: "2026-11-13",
      carregandoGrade: false,
      nomeObra: "Residencial Piazza",
      hojeReferencia: "2026-11-26",
    }));

    expect(html).toContain("1 atividade(s) atrasada(s)");
    expect(html).toContain("Maior atraso: 7 dias.");
  });
});
