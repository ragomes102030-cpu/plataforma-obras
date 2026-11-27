import { describe, expect, it } from "vitest";
import {
  prepararInsumosDaCurvaFisica,
  acumularProducaoFisica,
  coberturaDeProducao,
} from "./curva-fisica";

describe("prepararInsumosDaCurvaFisica", () => {
  it("usa somente pesos físicos aprovados, sem depender de orçamento", () => {
    expect(
      prepararInsumosDaCurvaFisica([
        {
          activityId: 101,
          quantidade: 100,
          pesoFisico: 60,
          pesoFisicoAprovado: true,
        },
        {
          activityId: 102,
          quantidade: 10,
          pesoFisico: 40,
          pesoFisicoAprovado: true,
        },
      ])
    ).toEqual({
      disponivel: true,
      porAtividade: new Map([
        [101, { peso: 60, planejado: 100 }],
        [102, { peso: 40, planejado: 10 }],
      ]),
    });
  });

  it("não publica curva quando algum peso ainda não foi aprovado", () => {
    expect(
      prepararInsumosDaCurvaFisica([
        {
          activityId: 101,
          quantidade: 100,
          pesoFisico: 60,
          pesoFisicoAprovado: true,
        },
        {
          activityId: 102,
          quantidade: 10,
          pesoFisico: 40,
          pesoFisicoAprovado: false,
        },
      ])
    ).toEqual({ disponivel: false, motivo: "peso_fisico_pendente" });
  });

  it("não soma atividade sem quantidade mensurável", () => {
    expect(
      prepararInsumosDaCurvaFisica([
        {
          activityId: 101,
          quantidade: null,
          pesoFisico: 100,
          pesoFisicoAprovado: true,
        },
      ])
    ).toEqual({ disponivel: false, motivo: "quantidade_ausente" });
  });
});

describe("cobertura de produção", () => {
  it("conta cada atividade uma só vez e respeita a data da consulta", () => {
    const pesos = new Map([[1, {peso: 60, planejado: 10}], [2, {peso: 40, planejado: 10}]]);
    const entradas = [{activityId: 1, dia: 2}, {activityId: 1, dia: 4}, {activityId: 2, dia: 8}];
    expect(coberturaDeProducao(entradas, pesos, 5)).toEqual({registradas: 1, total: 2, completa: false});
    expect(coberturaDeProducao(entradas, pesos, 8)).toEqual({registradas: 2, total: 2, completa: true});
  });
});

describe("acumularProducaoFisica", () => {
  it("limita a produção acumulada por atividade e mantém identidades distintas", () => {
    const pesos = new Map([
      [1, { peso: 60, planejado: 10 }],
      [2, { peso: 40, planejado: 10 }],
    ]);
    expect(
      acumularProducaoFisica(
        [
          { activityId: 1, quantidade: 8, dia: 1 },
          { activityId: 1, quantidade: 8, dia: 2 },
          { activityId: 2, quantidade: 5, dia: 3 },
        ],
        pesos
      )
    ).toEqual([
      { dia: 1, percentual: 48 },
      { dia: 2, percentual: 60 },
      { dia: 3, percentual: 80 },
    ]);
  });
});
