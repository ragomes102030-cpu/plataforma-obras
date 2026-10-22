import { describe, expect, it } from "vitest";
import {
  deslocamentoEmDiasUteis,
  duracaoEmDiasUteis,
  fimDoPlanoEmDias,
  planejadoNoDia,
} from "@shared/posicao-no-plano";

const cpm = (earlyStart: number, durationDays = 10, plannedQuantity = 100) => ({
  startOffset: 0,
  durationDays,
  plannedQuantity,
  earlyStart,
  cpmCalculatedAt: new Date("2026-10-01"),
});

const semCpm = (startOffset: number, durationDays = 10, plannedQuantity = 100) => ({
  startOffset,
  durationDays,
  plannedQuantity,
  earlyStart: null,
  cpmCalculatedAt: null,
});

describe("deslocamentoEmDiasUteis", () => {
  it("usa o earlyStart quando o CPM rodou", () => {
    // A AURORA real: startOffset zerado em tudo, earlyStart sequenciado.
    expect(deslocamentoEmDiasUteis(cpm(125))).toBe(125);
  });

  it("ignora o startOffset zerado quando existe CPM", () => {
    const atividade = { ...cpm(418), startOffset: 0 };
    expect(deslocamentoEmDiasUteis(atividade)).toBe(418);
  });

  it("cai no startOffset quando o CPM nunca rodou", () => {
    expect(deslocamentoEmDiasUteis(semCpm(30))).toBe(30);
  });

  it("não devolve negativo nem NaN", () => {
    expect(deslocamentoEmDiasUteis({ startOffset: -5, durationDays: 3, plannedQuantity: 1 })).toBe(0);
    expect(
      deslocamentoEmDiasUteis({
        startOffset: Number.NaN,
        durationDays: null,
        plannedQuantity: null,
      })
    ).toBe(0);
  });
});

describe("duracaoEmDiasUteis", () => {
  it("usa a duração informada", () => {
    expect(duracaoEmDiasUteis(cpm(0, 120))).toBe(120);
  });

  it("sem duração, ocupa um dia", () => {
    expect(duracaoEmDiasUteis(cpm(0, 0))).toBe(1);
  });
});

describe("fimDoPlanoEmDias", () => {
  it("não estica o eixo somando earlyStart com duração em dias corridos", () => {
    // 0..119 e 578..579: o plano termina no índice 579, não em 580 dias
    // "corridos" que viram 700 no calendário.
    const atividades = [cpm(0, 120, 50), cpm(578, 2, 50)];
    expect(fimDoPlanoEmDias(atividades)).toBe(579);
  });

  it("plano vazio termina no dia zero", () => {
    expect(fimDoPlanoEmDias([])).toBe(0);
  });
});

describe("planejadoNoDia", () => {
  it("já começa com um dia de trabalho no primeiro dia", () => {
    expect(planejadoNoDia([cpm(0, 10)], 0)).toBe(10);
  });

  it("chega a 100% no último dia útil", () => {
    expect(planejadoNoDia([cpm(0, 10)], 9)).toBe(100);
  });

  it("passa de 50% ao fim da primeira metade", () => {
    expect(planejadoNoDia([cpm(0, 10)], 5)).toBe(60);
  });

  it("pondera pela quantidade planejada", () => {
    // 100 unidades concluídas + 300 que acabaram de começar (1 de 10 dias):
    // (100 × 100% + 300 × 10%) / 400 = 32,5%.
    const atividades = [cpm(0, 10, 100), cpm(9, 10, 300)];
    expect(planejadoNoDia(atividades, 9)).toBe(32.5);
  });

  it("atividade que ainda não começou não soma", () => {
    expect(planejadoNoDia([cpm(100, 10)], 50)).toBe(0);
  });

  it("sem quantidade em nenhuma atividade devolve 0 em vez de NaN", () => {
    const atividades = [cpm(0, 10, 0), cpm(5, 10, 0)];
    expect(planejadoNoDia(atividades, 7)).toBe(0);
  });

  it("nunca passa de 100 nem fica abaixo de 0", () => {
    expect(planejadoNoDia([cpm(0, 1)], 5000)).toBe(100);
    expect(planejadoNoDia([cpm(50, 1)], 0)).toBe(0);
  });
});
