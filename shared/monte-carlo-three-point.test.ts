import { describe, expect, it } from "vitest";
import { simulateMonteCarlo } from "./monte-carlo";
import type { CpmActivity } from "./cpm";

/**
 * Contrato dos três pontos.
 *
 * O ponto destes testes não é conferir a triangular — é garantir que a faixa
 * que o planejador digita na tela realmente chega na simulação e que uma faixa
 * malformada nunca faz a atividade virar duração fixa (risco zero aparente).
 */

const cadeia: CpmActivity[] = [
  { id: "A", duration: 10 },
  { id: "B", duration: 10 },
  { id: "C", duration: 10 },
];

const dependencias = [
  { predecessorId: "A", successorId: "B", type: "FS" as const },
  { predecessorId: "B", successorId: "C", type: "FS" as const },
];

describe("Monte Carlo com duração em três pontos", () => {
  it("sem incerteza e sem faixa, a simulação é determinística", () => {
    const r = simulateMonteCarlo(cadeia, dependencias, { iterations: 500, uncertainty: 0 });
    expect(r.deterministicDuration).toBe(30);
    expect(r.p10).toBe(30);
    expect(r.p90).toBe(30);
    expect(r.stdDev).toBe(0);
  });

  it("a faixa declarada é respeitada mesmo com incerteza do painel zerada", () => {
    const r = simulateMonteCarlo(cadeia, dependencias, {
      iterations: 2000,
      uncertainty: 0,
      estimates: [
        { id: "A", mostLikely: 10, optimistic: 8, pessimistic: 20 },
        { id: "B", mostLikely: 10, optimistic: 9, pessimistic: 16 },
        { id: "C", mostLikely: 10, optimistic: 10, pessimistic: 14 },
      ],
    });
    expect(r.stdDev).toBeGreaterThan(0);
    expect(r.p50).toBeGreaterThanOrEqual(30);
    // Teto teórico: 20 + 16 + 14. Nenhum percentil pode furar isso.
    expect(r.p90).toBeLessThanOrEqual(50);
  });

  it("faixa declarada dá mais dispersão do que o percentual genérico", () => {
    const generico = simulateMonteCarlo(cadeia, dependencias, { iterations: 2000, uncertainty: 0.25 });
    const declarado = simulateMonteCarlo(cadeia, dependencias, {
      iterations: 2000,
      uncertainty: 0.25,
      estimates: [{ id: "C", mostLikely: 10, optimistic: 9, pessimistic: 40 }],
    });
    expect(declarado.p80).toBeGreaterThan(generico.p80);
  });

  it("aceita só um dos lados da faixa e mantém a triangular válida", () => {
    const r = simulateMonteCarlo(cadeia, dependencias, {
      iterations: 1500,
      uncertainty: 0,
      estimates: [{ id: "A", mostLikely: 10, pessimistic: 20 }],
    });
    // Otimista omitido cai em 10 (incerteza 0); pessimista declarado em 20.
    expect(r.p10).toBeGreaterThanOrEqual(30);
    expect(r.p90).toBeLessThanOrEqual(40);
    expect(r.stdDev).toBeGreaterThan(0);
  });

  it("otimista acima da moda é limitado à moda em vez de quebrar o sorteio", () => {
    const r = simulateMonteCarlo(cadeia, dependencias, {
      iterations: 800,
      uncertainty: 0,
      estimates: [{ id: "A", mostLikely: 10, optimistic: 50, pessimistic: 60 }],
    });
    // Sem o clamp, low > mode e a triangular degeneraria em 10 fixo (risco zero).
    expect(r.p10).toBeGreaterThanOrEqual(30);
    expect(r.stdDev).toBeGreaterThan(0);
  });

  it("estimativa de atividade inexistente é ignorada sem alterar o resultado", () => {
    const base = simulateMonteCarlo(cadeia, dependencias, { iterations: 600, uncertainty: 0.2 });
    const comLixo = simulateMonteCarlo(cadeia, dependencias, {
      iterations: 600,
      uncertainty: 0.2,
      estimates: [{ id: "ZZZ", mostLikely: 10, optimistic: 1, pessimistic: 99 }],
    });
    expect(comLixo.p80).toBe(base.p80);
  });

  it("mesma semente e mesma faixa devolvem o mesmo resultado", () => {
    const opts = {
      iterations: 1000,
      seed: 42,
      estimates: [{ id: "B", mostLikely: 10, optimistic: 7, pessimistic: 25 }],
    };
    const a = simulateMonteCarlo(cadeia, dependencias, opts);
    const b = simulateMonteCarlo(cadeia, dependencias, opts);
    expect(a.p80).toBe(b.p80);
    expect(a.p50).toBe(b.p50);
  });
});
