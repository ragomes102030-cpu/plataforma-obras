import { describe, expect, it } from "vitest";
import { defaultCalendar } from "../../shared/work-calendar";
import {
  computeDesembolso,
  mesAnterior,
  mesDe,
  mesSeguinte,
  planejadoPorMes,
  type AtividadeComCustoPlanejado,
} from "./desembolso";

const cal = defaultCalendar(2026);

function atividade(over: Partial<AtividadeComCustoPlanejado> = {}): AtividadeComCustoPlanejado {
  // 02/02/2026 é segunda-feira: 5 dias úteis caem todos em fevereiro.
  return { id: 1, peso: 1000, startOffset: 0, durationDays: 5, ...over };
}

describe("mesDe / mesAnterior / mesSeguinte", () => {
  it("extrai o mês de uma data ISO", () => {
    expect(mesDe("2026-02-26")).toBe("2026-02");
  });

  it("volta de janeiro para dezembro do ano anterior", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });

  it("avança de dezembro para janeiro do ano seguinte", () => {
    expect(mesSeguinte("2025-12")).toBe("2026-01");
  });

  it("avança dentro do ano", () => {
    expect(mesSeguinte("2026-02")).toBe("2026-03");
  });
});

describe("planejadoPorMes", () => {
  it("coloca todo o valor da atividade no mês em que ela corre", () => {
    const porMes = planejadoPorMes({ plannedStartIso: "2026-02-02", calendar: cal, atividades: [atividade()] });

    expect(porMes.get("2026-02")).toBe(1000);
    expect(porMes.size).toBe(1);
  });

  it("rateia por dia útil quando a atividade cruza a virada do mês", () => {
    // 26/02 (qui), 27/02 (sex), 28/02 sáb e 01/03 dom pulados, 02–04/03.
    const porMes = planejadoPorMes({
      plannedStartIso: "2026-02-26",
      calendar: cal,
      atividades: [atividade()],
    });

    // 1000 / 5 dias = 200 por dia; 2 dias em fevereiro, 3 em março.
    expect(porMes.get("2026-02")).toBe(400);
    expect(porMes.get("2026-03")).toBe(600);
  });

  it("não rateia dia não útil para dentro da atividade", () => {
    // Uma atividade de 1 dia começando na sexta não ganha o fim de semana.
    const porMes = planejadoPorMes({
      plannedStartIso: "2026-02-27",
      calendar: cal,
      atividades: [atividade({ durationDays: 1 })],
    });

    expect(porMes.get("2026-02")).toBe(1000);
    expect(porMes.size).toBe(1);
  });

  it("ignora atividade sem valor planejado", () => {
    const porMes = planejadoPorMes({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade({ peso: 0 })],
    });

    expect(porMes.size).toBe(0);
  });

  it("duração inválida conta como um dia, não como zero", () => {
    const porMes = planejadoPorMes({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade({ durationDays: 0 })],
    });

    expect(porMes.get("2026-02")).toBe(1000);
  });

  it("soma atividades no mesmo mês", () => {
    const porMes = planejadoPorMes({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade({ id: 1 }), atividade({ id: 2, peso: 500 })],
    });

    expect(porMes.get("2026-02")).toBe(1500);
  });
});

describe("computeDesembolso", () => {
  it("sem dado nenhum devolve curva vazia e avisa", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [],
      custoRealPorMes: [],
      hojeMes: "2026-02",
      cpi: null,
    });

    expect(r.meses).toEqual([]);
    expect(r.bac).toBe(0);
    expect(r.alertas).toHaveLength(1);
  });

  it("no mês corrente mostra o que saiu, não a projeção", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade()],
      custoRealPorMes: [{ mes: "2026-02", valor: 600 }],
      hojeMes: "2026-02",
      cpi: null,
    });

    expect(r.meses).toHaveLength(1);
    expect(r.meses[0]).toMatchObject({
      mes: "2026-02",
      situacao: "corrente",
      planejado: 1000,
      realizado: 600,
      projetado: 600,
      desvio: -400,
    });
    expect(r.bac).toBe(1000);
    expect(r.realizadoTotal).toBe(600);
  });

  it("projeta o futuro dividindo pelo CPI — CPI abaixo de 1 encarece, não barateia", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [
        atividade({ id: 1, peso: 1000 }),
        atividade({ id: 2, peso: 1000, startOffset: 20 }), // março
      ],
      custoRealPorMes: [{ mes: "2026-02", valor: 1250 }],
      hojeMes: "2026-02",
      cpi: 0.8,
    });

    const fevereiro = r.meses.find(m => m.mes === "2026-02")!;
    const marco = r.meses.find(m => m.mes === "2026-03")!;

    expect(fevereiro.projetado).toBe(1250);
    expect(marco.situacao).toBe("futuro");
    expect(marco.planejado).toBe(1000);
    // 1000 / 0,80 = 1250 — e não 1000 × 0,80 = 800.
    expect(marco.projetado).toBe(1250);
    expect(r.bac).toBe(2000);
    expect(r.projetadoTotal).toBe(2500);
    expect(r.desvioProjetado).toBe(500);
    expect(r.alertas.join(" ")).toContain("25% acima do planejado");
  });

  it("sem CPI projeta o próprio planejado e diz que não corrigiu", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [
        atividade({ id: 1 }),
        atividade({ id: 2, startOffset: 20 }),
      ],
      custoRealPorMes: [],
      hojeMes: "2026-02",
      cpi: null,
    });

    const marco = r.meses.find(m => m.mes === "2026-03")!;
    expect(marco.projetado).toBe(1000);
    expect(r.alertas.join(" ")).toContain("não existe CPI");
    expect(r.alertas.join(" ")).toContain("só planejamento");
  });

  it("não deixa um CPI quebrado explodir a projeção", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade({ id: 1 }), atividade({ id: 2, startOffset: 20 })],
      custoRealPorMes: [{ mes: "2026-02", valor: 100 }],
      hojeMes: "2026-02",
      cpi: 0.05,
    });

    const marco = r.meses.find(m => m.mes === "2026-03")!;
    // Piso de CPI 0,20 → fator máximo 5×.
    expect(marco.projetado).toBe(5000);
  });

  it("preenche meses vazios para a curva não virar degrau", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade({ id: 1 }), atividade({ id: 2, startOffset: 40 })], // abril
      custoRealPorMes: [],
      hojeMes: "2026-05",
      cpi: null,
    });

    expect(r.meses.map(m => m.mes)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);

    const marco = r.meses.find(m => m.mes === "2026-03")!;
    expect(marco.planejado).toBe(0);
    expect(marco.realizado).toBe(0);
    expect(marco.acumuladoPlanejado).toBe(1000);

    const maio = r.meses.find(m => m.mes === "2026-05")!;
    expect(maio.situacao).toBe("corrente");
    expect(maio.acumuladoPlanejado).toBe(2000);
  });

  it("marca como passado o mês anterior ao corrente", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade({ id: 1 }), atividade({ id: 2, startOffset: 20 })],
      custoRealPorMes: [{ mes: "2026-02", valor: 900 }],
      hojeMes: "2026-03",
      cpi: 1,
    });

    expect(r.meses[0].situacao).toBe("passado");
    expect(r.meses[1].situacao).toBe("corrente");
  });

  it("avisa mês com desembolso muito acima do planejado", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade()],
      custoRealPorMes: [{ mes: "2026-02", valor: 1300 }],
      hojeMes: "2026-03",
      cpi: 0.77,
    });

    // 1300 > 1000 × 1,2
    expect(r.alertas.join(" ")).toContain("20% acima do planejado");
  });

  it("soma vários lançamentos de custo no mesmo mês", () => {
    const r = computeDesembolso({
      plannedStartIso: "2026-02-02",
      calendar: cal,
      atividades: [atividade()],
      custoRealPorMes: [
        { mes: "2026-02", valor: 300 },
        { mes: "2026-02", valor: 450 },
      ],
      hojeMes: "2026-02",
      cpi: 1.25,
    });

    expect(r.meses[0].realizado).toBe(750);
    expect(r.realizadoTotal).toBe(750);
  });
});
