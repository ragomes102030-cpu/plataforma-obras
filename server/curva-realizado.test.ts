import { describe, expect, it } from "vitest";
import { acumularRealizado, realizadoNoDia, type PesoDaAtividade } from "@shared/curva-realizado";

/**
 * O caso AURORA TESTE: 10 atividades em 100% (4.500 m² cada), todas de peso 4%
 * da obra, confirmadas entre 03/10 e 25/10, enquanto o CPM coloca essas
 * atividades adiante no calendário. A curva antiga respondia 0,0% de realizado.
 */

const pesos = new Map<string, PesoDaAtividade>([
  ["1.2.3", { peso: 4, planejado: 4500 }],
  ["1.2.4", { peso: 6, planejado: 1000 }],
]);

const diaFixo = (data: string) => Number(data.slice(8, 10)) - 1; // 03/10 -> dia 2

describe("acumularRealizado", () => {
  it("realizado é datado pelo lançamento, não pelo cronograma", () => {
    const pontos = acumularRealizado(
      [{ codigo: "1.2.3", quantidade: 4500, data: "2026-10-03" }],
      pesos,
      diaFixo
    );
    expect(realizadoNoDia(pontos, 2)).toBeCloseTo(4, 5);
    expect(realizadoNoDia(pontos, 1)).toBe(0);
  });

  it("soma por dia e mantém o acumulado", () => {
    const pontos = acumularRealizado(
      [
        { codigo: "1.2.3", quantidade: 4500, data: "2026-10-03" },
        { codigo: "1.2.4", quantidade: 500, data: "2026-10-05" },
      ],
      pesos,
      diaFixo
    );
    expect(realizadoNoDia(pontos, 2)).toBeCloseTo(4, 5);
    expect(realizadoNoDia(pontos, 10)).toBeCloseTo(7, 5);
  });

  it("quantidade parcial pesa proporcionalmente", () => {
    const pontos = acumularRealizado(
      [{ codigo: "1.2.4", quantidade: 250, data: "2026-10-03" }],
      pesos,
      diaFixo
    );
    expect(realizadoNoDia(pontos, 2)).toBeCloseTo(1.5, 5);
  });

  it("excedente não passa de 100% da atividade", () => {
    const pontos = acumularRealizado(
      [{ codigo: "1.2.3", quantidade: 9000, data: "2026-10-03" }],
      pesos,
      diaFixo
    );
    expect(realizadoNoDia(pontos, 2)).toBeCloseTo(4, 5);
  });

  it("lançamento sem código (vínculo perdido) não vira progresso", () => {
    const pontos = acumularRealizado(
      [{ codigo: null, quantidade: 4500, data: "2026-10-03" }],
      pesos,
      diaFixo
    );
    expect(pontos).toEqual([{ dia: 0, percentual: 0 }]);
  });

  it("atividade sem peso no orçamento é ignorada", () => {
    const pontos = acumularRealizado(
      [{ codigo: "9.9.9", quantidade: 10, data: "2026-10-03" }],
      pesos,
      diaFixo
    );
    expect(realizadoNoDia(pontos, 10)).toBe(0);
  });

  it("lançamento antes do início cai no dia 0 (aparece, não desaparece)", () => {
    const pontos = acumularRealizado(
      [{ codigo: "1.2.3", quantidade: 4500, data: "2026-09-20" }],
      pesos,
      () => -11
    );
    expect(pontos).toEqual([{ dia: 0, percentual: 4 }]);
  });

  it("sempre começa em 0% no dia 0", () => {
    expect(acumularRealizado([], pesos, diaFixo)).toEqual([{ dia: 0, percentual: 0 }]);
  });
});
