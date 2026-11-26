import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoteiroPlanejamentoServicos, type RoteiroPlanejamentoServicosProps } from "./RoteiroPlanejamentoServicos";

const base: RoteiroPlanejamentoServicosProps = {
  readiness: {
    eapApproved: false,
    activityCount: 0,
    durationsComplete: false,
    networkValid: false,
    plannedStartDefined: false,
    cpmCurrent: false,
    baselineActive: false,
    totalActivities: 0,
    activitiesWithUpdate: 0,
  },
  forecast: {
    loading: false,
    available: false,
    plannedFinishDate: null,
    forecastFinishDate: null,
    activitiesWithUpdate: 0,
    totalActivities: 0,
    outOfSequenceActivityIds: [],
    warnings: [],
    unavailableReason: null,
  },
  onOpen: () => undefined,
};

describe("roteiro inicial do planejamento por serviços", () => {
  it("leva uma obra nova à EAP e deixa claro que orçamento é opcional", () => {
    const html = renderToStaticMarkup(createElement(RoteiroPlanejamentoServicos, base));
    expect(html).toContain("Como planejar esta obra");
    expect(html).toContain("Orçamento opcional");
    expect(html).toContain("unidade repetitiva só é exigida para a Linha de Balanço");
    expect(html).toContain("EAP");
    expect(html).toContain('data-next-action="eap"');
  });

  it("direciona a definição de data inicial quando falta âncora para o CPM", () => {
    const html = renderToStaticMarkup(createElement(RoteiroPlanejamentoServicos, {
      ...base,
      readiness: {
        eapApproved: true,
        activityCount: 12,
        durationsComplete: true,
        networkValid: true,
        plannedStartDefined: false,
        cpmCurrent: false,
        baselineActive: false,
        totalActivities: 12,
        activitiesWithUpdate: 0,
      },
    }));
    expect(html).toContain("Definir a data inicial e calcular o CPM");
    expect(html).toContain('data-next-action="escopo"');
  });

  it("leva um plano pronto para a atualização dos serviços em campo", () => {
    const html = renderToStaticMarkup(createElement(RoteiroPlanejamentoServicos, {
      ...base,
      readiness: {
        eapApproved: true,
        activityCount: 3,
        durationsComplete: true,
        networkValid: true,
        plannedStartDefined: true,
        cpmCurrent: true,
        baselineActive: true,
        totalActivities: 3,
        activitiesWithUpdate: 1,
      },
      forecast: {
        ...base.forecast,
        available: true,
        plannedFinishDate: "2029-05-04",
        forecastFinishDate: "2029-05-07",
        totalActivities: 3,
        activitiesWithUpdate: 1,
      },
    }));
    expect(html).toContain("Atualizar os serviços em campo");
    expect(html).toContain("1 de 3 serviços atualizados");
    expect(html).toContain("Previsão pelos relatos: 07/05/2029");
    expect(html).not.toContain("Cenário conservador sem relatos");
    expect(html).toContain('data-next-action="gantt"');
  });

  it("explica qual bloqueio impede a previsão pelos relatos", () => {
    const html = renderToStaticMarkup(createElement(RoteiroPlanejamentoServicos, {
      ...base,
      readiness: {
        eapApproved: true,
        activityCount: 1,
        durationsComplete: true,
        networkValid: true,
        plannedStartDefined: true,
        cpmCurrent: true,
        baselineActive: true,
        totalActivities: 1,
        activitiesWithUpdate: 1,
      },
      forecast: {
        ...base.forecast,
        totalActivities: 1,
        activitiesWithUpdate: 1,
        unavailableReason: "Término indisponível: ligação elétrica está bloqueada sem estimativa de duração restante ou término.",
      },
    }));
    expect(html).toContain("Previsão pelos relatos indisponível");
    expect(html).toContain("ligação elétrica está bloqueada sem estimativa");
  });

  it("identifica o término como cenário conservador quando ainda não há relato de campo", () => {
    const html = renderToStaticMarkup(createElement(RoteiroPlanejamentoServicos, {
      ...base,
      readiness: {
        eapApproved: true,
        activityCount: 2,
        durationsComplete: true,
        networkValid: true,
        plannedStartDefined: true,
        cpmCurrent: true,
        baselineActive: true,
        totalActivities: 2,
        activitiesWithUpdate: 0,
      },
      forecast: {
        ...base.forecast,
        available: true,
        plannedFinishDate: "2029-05-04",
        forecastFinishDate: "2029-05-17",
        totalActivities: 2,
        activitiesWithUpdate: 0,
        warnings: [{
          code: "COBERTURA_INCOMPLETA",
          activityIds: ["1", "2"],
          message: "2 serviços sem relato conservam a duração planejada; isso não confirma execução.",
        }],
      },
    }));

    expect(html).toContain("Cenário conservador sem relatos: 17/05/2029");
    expect(html).toContain("Prazo no cenário sem relatos");
    expect(html).toContain("não confirma atraso nem execução");
  });
});
