import { describe, expect, it } from "vitest";
import {
  calcularProgressoReal,
  classificarLancamento,
  ehDataFutura,
  type AtividadeParaProgresso,
} from "./producao-progresso";

/**
 * Atividade é linha de UMA versão do plano. Quando a EAP é regerada as linhas
 * ganham outros ids; o lançamento de produção continua apontando para o id
 * antigo. O cálculo antigo somava direto em `entry.activityId`, então 10
 * lançamentos confirmados da AURORA TESTE não mexiam em nada e o cronograma
 * ficava em 0%. A chave correta é o código da EAP.
 */

const atual = (id: number, wbsCode: string, planejado: number): AtividadeParaProgresso => ({
  id,
  versionId: 2,
  wbsCode,
  plannedQuantity: String(planejado),
  unit: "M",
});

const antiga = (id: number, wbsCode: string, planejado: number): AtividadeParaProgresso => ({
  id,
  versionId: 1,
  wbsCode,
  plannedQuantity: String(planejado),
  unit: "M",
});

describe("calcularProgressoReal", () => {
  it("soma lançamento confirmado da própria atividade atual", () => {
    const atividades = [atual(10, "1.1", 100)];
    const mapa = calcularProgressoReal([{ activityId: 10, quantity: 40, status: "confirmada", measurementUnit: "M" }], atividades, 2);
    expect(mapa.get(10)).toEqual({ progress: 40, total: 40, planned: 100 });
  });

  it("lançamento preso na versão anterior conta no código de hoje", () => {
    const atividades = [antiga(139, "1.2.3", 100), atual(517, "1.2.3", 200)];
    const mapa = calcularProgressoReal([{ activityId: 139, quantity: 50, status: "confirmada", measurementUnit: "M" }], atividades, 2);
    // O bug: antes ia para a linha 139 (versão antiga) e a 517 ficava em 0.
    expect(mapa.get(517)).toEqual({ progress: 25, total: 50, planned: 200 });
    expect(mapa.has(139)).toBe(false);
  });

  it("não soma rascunho", () => {
    const atividades = [atual(10, "1.1", 100)];
    const mapa = calcularProgressoReal([{ activityId: 10, quantity: 40, status: "rascunho", measurementUnit: "M" }], atividades, 2);
    expect(mapa.get(10)?.progress).toBe(0);
  });

  it("ignora lançamento cuja atividade foi apagada", () => {
    const atividades = [atual(10, "1.1", 100)];
    const mapa = calcularProgressoReal([{ activityId: 999, quantity: 40, status: "confirmada", measurementUnit: "M" }], atividades, 2);
    expect(mapa.get(10)?.progress).toBe(0);
  });

  it("planejado zero não divide por zero e não inventa porcentagem", () => {
    const atividades = [atual(10, "1.1", 0)];
    const mapa = calcularProgressoReal([{ activityId: 10, quantity: 30, status: "confirmada", measurementUnit: "M" }], atividades, 2);
    expect(mapa.get(10)).toEqual({ progress: 0, total: 30, planned: 0 });
  });

  it("não passa de 100%", () => {
    const atividades = [atual(10, "1.1", 100)];
    const mapa = calcularProgressoReal([{ activityId: 10, quantity: 250, status: "confirmada", measurementUnit: "M" }], atividades, 2);
    expect(mapa.get(10)?.progress).toBe(100);
  });

  it("soma lançamentos de versões diferentes no mesmo código", () => {
    const atividades = [antiga(139, "1.2.3", 100), atual(517, "1.2.3", 100)];
    const mapa = calcularProgressoReal(
      [
        { activityId: 139, quantity: 20, status: "confirmada", measurementUnit: "M" },
        { activityId: 517, quantity: 30, status: "confirmada", measurementUnit: "M" },
      ],
      atividades,
      2
    );
    expect(mapa.get(517)).toEqual({ progress: 50, total: 50, planned: 100 });
  });

  it("devolve as atividades da versão atual que não têm lançamento, em zero", () => {
    const atividades = [atual(10, "1.1", 100), atual(11, "1.2", 50)];
    const mapa = calcularProgressoReal([{ activityId: 10, quantity: 10, status: "confirmada", measurementUnit: "M" }], atividades, 2);
    expect(mapa.get(11)).toEqual({ progress: 0, total: 0, planned: 50 });
  });

  it("sem versão corrente (obra sem versionamento) usa as atividades sem versão", () => {
    const atividades: AtividadeParaProgresso[] = [
      { id: 5, versionId: null, wbsCode: "2.1", plannedQuantity: "10", unit: "M" },
    ];
    const mapa = calcularProgressoReal([{ activityId: 5, quantity: 5, status: "confirmada", measurementUnit: "M" }], atividades, null);
    expect(mapa.get(5)).toEqual({ progress: 50, total: 5, planned: 10 });
  });

  it("exclui quantidade confirmada quando a unidade diverge da unidade planejada", () => {
    const atividades = [atual(10, "1.1", 100)];
    const mapa = calcularProgressoReal(
      [{ activityId: 10, quantity: 12, status: "confirmada", measurementUnit: "un" }],
      atividades,
      2,
    );
    expect(mapa.get(10)).toEqual({ progress: 0, total: 0, planned: 100 });
  });

  it("exclui lançamento marcado como exemplo QA do avanço real", () => {
    const atividades = [atual(10, "1.1", 100)];
    const exemploQa = { activityId: 10, quantity: 40, status: "confirmada", measurementUnit: "M", exemplo: 1 };
    const mapa = calcularProgressoReal([exemploQa], atividades, 2);

    expect(mapa.get(10)).toEqual({ progress: 0, total: 0, planned: 100 });
  });

  it("exclui produção legada vinculada a atividade marcada como exemplo QA", () => {
    const atividades = [{ ...atual(10, "1.1", 100), exemplo: 1 }];
    const lancamento = { activityId: 10, quantity: 40, status: "confirmada", measurementUnit: "M" };
    const mapa = calcularProgressoReal([lancamento], atividades, 2);

    expect(mapa.size).toBe(0);
  });
});

describe("ehDataFutura", () => {
  const agora = new Date("2026-10-22T15:00:00.000Z");

  it("aceita hoje mesmo com a hora corrente já passada", () => {
    expect(ehDataFutura(new Date("2026-10-22T00:00:00.000Z"), agora)).toBe(false);
  });

  it("aceita o passado", () => {
    expect(ehDataFutura(new Date("2026-10-03T00:00:00.000Z"), agora)).toBe(false);
  });

  it("recusa amanhã", () => {
    expect(ehDataFutura(new Date("2026-10-23T00:00:00.000Z"), agora)).toBe(true);
  });

  it("recusa o 25/10 que existia na AURORA", () => {
    expect(ehDataFutura(new Date("2026-10-25T00:00:00.000Z"), agora)).toBe(true);
  });

  it("data inválida não vira bloqueio", () => {
    expect(ehDataFutura(new Date("nao-e-data"), agora)).toBe(false);
  });
});

describe("classificarLancamento", () => {
  const atividades = [antiga(139, "1.2.3", 100), atual(517, "1.2.3", 100), antiga(150, "9.9", 10)];

  it("atividade da versão atual", () => {
    expect(classificarLancamento(517, atividades, 2)).toBe("atual");
  });

  it("versão anterior com código que ainda existe", () => {
    expect(classificarLancamento(139, atividades, 2)).toBe("versao_anterior");
  });

  it("versão anterior cujo código não existe mais", () => {
    expect(classificarLancamento(150, atividades, 2)).toBe("perdido");
  });

  it("atividade apagada", () => {
    expect(classificarLancamento(999, atividades, 2)).toBe("perdido");
  });
});
