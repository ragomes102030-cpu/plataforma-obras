import { describe, expect, it } from "vitest";
import { simulateScheduleRisk } from "./monte-carlo-service";

/**
 * Contrato do adaptador: o que a tela manda tem de chegar no simulador.
 *
 * O bug que estes testes travam é silencioso: se a faixa vinda do banco for
 * descartada no caminho, a simulação continua funcionando e devolvendo números
 * plausíveis — só que ignorando o risco que o planejador declarou.
 */

const dependencias = [{ predecessorId: 1, successorId: 2, type: "FS" as const, lag: 0 }];

const comFaixa = [
  { id: 1, wbsCode: "1.1", name: "Fundação", durationDays: 20, durationOptimisticDays: 15, durationPessimisticDays: 45 },
  { id: 2, wbsCode: "1.2", name: "Estrutura", durationDays: 30, durationOptimisticDays: 25, durationPessimisticDays: 55 },
];

const semFaixa = [
  { id: 1, wbsCode: "1.1", name: "Fundação", durationDays: 20, durationOptimisticDays: null, durationPessimisticDays: null },
  { id: 2, wbsCode: "1.2", name: "Estrutura", durationDays: 30, durationOptimisticDays: null, durationPessimisticDays: null },
];

describe("simulateScheduleRisk", () => {
  it("informa a cobertura de faixa declarada", () => {
    expect(simulateScheduleRisk(comFaixa, dependencias, { iterations: 300 }).threePointCoverage).toEqual({
      declared: 2,
      total: 2,
    });
    expect(simulateScheduleRisk(semFaixa, dependencias, { iterations: 300 }).threePointCoverage).toEqual({
      declared: 0,
      total: 2,
    });
  });

  it("faixa declarada produz cauda pior que o percentual genérico", () => {
    const generico = simulateScheduleRisk(semFaixa, dependencias, { iterations: 1500, uncertainty: 0.2, seed: 7 });
    const declarado = simulateScheduleRisk(comFaixa, dependencias, { iterations: 1500, uncertainty: 0.2, seed: 7 });
    expect(declarado.p80).toBeGreaterThan(generico.p80);
  });

  it("mistura atividades com e sem faixa sem perder nenhuma da conta", () => {
    const misto = [
      { id: 1, wbsCode: "1.1", name: "Fundação", durationDays: 20, durationOptimisticDays: 18, durationPessimisticDays: 40 },
      { id: 2, wbsCode: "1.2", name: "Estrutura", durationDays: 30 },
    ];
    const r = simulateScheduleRisk(misto, dependencias, { iterations: 500 });
    expect(r.threePointCoverage.declared).toBe(1);
    expect(r.threePointCoverage.total).toBe(2);
    expect(r.deterministicDuration).toBe(50);
  });

  it("é determinístico para a mesma semente, mesmo com faixas", () => {
    const a = simulateScheduleRisk(comFaixa, dependencias, { iterations: 400, seed: 99 });
    const b = simulateScheduleRisk(comFaixa, dependencias, { iterations: 400, seed: 99 });
    expect(a.p80).toBe(b.p80);
    expect(a.p50).toBe(b.p50);
  });

  it("rotula a atividade com o código do WBS para a tela não mostrar id", () => {
    const r = simulateScheduleRisk(comFaixa, dependencias, { iterations: 200 });
    expect(r.criticality.map(item => item.label)).toContain("1.1 — Fundação");
  });
});
