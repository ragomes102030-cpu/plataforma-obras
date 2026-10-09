import { describe, expect, it } from "vitest";
import { buildSCurve, type CurveActivity } from "./s-curve";

function act(
  id: string,
  duration: number,
  plannedPercent: number,
  actualPercent: number,
  earlyStart = 0
): CurveActivity {
  return { id, duration, plannedPercent, actualPercent, earlyStart };
}

describe("buildSCurve", () => {
  it("acumula planejado e realizado em uma curva em S", () => {
    // A comeca no dia 0, B so comeca no dia 10: a curva tem degrau, e e isso
    // que distingue a curva S de uma reta.
    const result = buildSCurve([act("A", 10, 100, 100), act("B", 10, 100, 50, 10)]);
    expect(result.points[0].day).toBe(0);
    expect(result.points[0].planned).toBe(0);
    // Dia 10: A terminou e B comecou -> metade da obra planejada.
    expect(result.points[10].planned).toBeCloseTo(50, 5);
    // Realizado no dia 10: A inteira (100). B acabou de COMECAR no dia 10 —
    // no instante em que comeca, nada dela foi executado. Somar "metade de B"
    // aqui seria contar execucao que nao aconteceu; a realizacao de B so
    // aparece a partir do dia 11.
    expect(result.points[10].actual).toBeCloseTo(50, 5);
    // Dia 11: A esgotada (50) e B com 1 dia de 10 executados = 10% de 50 = 5.
    expect(result.points[11].actual).toBeCloseTo(52.5, 5);
    // Dia 20: as duas concluidas -> 100 planejado, e B so contributes 50.
    expect(result.points[20].planned).toBeCloseTo(100, 5);
    expect(result.points[20].actual).toBeCloseTo(75, 5);
  });

  it("reporta desvio em dias no fim, não só em percentual", () => {
    // B deveria estar 100% mas está em 50%: meio período de atraso.
    const result = buildSCurve([act("A", 10, 100, 100), act("B", 10, 100, 50)]);
    expect(result.finalPlanned).toBeCloseTo(100, 5);
    expect(result.finalActual).toBeCloseTo(75, 5);
    expect(result.status).toBe("atrasado");
  });

  it("distingue adiantado de no prazo", () => {
    const noPiso = buildSCurve([act("A", 10, 100, 100)]);
    expect(noPiso.status).toBe("no_prazo");

    const adiantado = buildSCurve([act("A", 10, 100, 120)]);
    expect(adiantado.status).toBe("adiantado");
  });

  it("linha de base reta quando todas as atividades começam juntas", () => {
    // Duas frentes que partem no dia 0 correm em PARALELO: a obra dura 5 dias,
    // nao 10. A curva sobe de 0 a 100 e satura. E o comportamento correto —
    // esperar 50 no meio, ou um ponto no dia 10, seria inventar prazo.
    const result = buildSCurve([act("A", 5, 100, 100), act("B", 5, 100, 100)]);
    expect(result.duration).toBe(5);
    expect(result.points).toHaveLength(6);
    expect(result.points[5].planned).toBeCloseTo(100, 5);
    expect(result.status).toBe("no_prazo");
  });

  it("não divide por zero em projeto sem peso de plannedPercent", () => {
    const result = buildSCurve([act("A", 5, 0, 0)]);
    expect(Number.isFinite(result.finalPlanned)).toBe(true);
    expect(Number.isFinite(result.finalActual)).toBe(true);
  });

  it("rejeita peso planejado negativo, que é dado corrompido", () => {
    expect(() => buildSCurve([act("A", 5, -10, 0)])).toThrow();
  });

  it("rejeita realizado negativo: valor negativo não é resultado de obra", () => {
    expect(() => buildSCurve([act("A", 5, 100, -10)])).toThrow();
  });

  it("rejeita duração negativa", () => {
    expect(() => buildSCurve([act("A", -3, 100, 0)])).toThrow();
  });

  it("aceita peso acima de 100: é peso relativo, não percentual de share", () => {
    // Atividade que domina o valor da obra pode valer mais que 100.
    const result = buildSCurve([act("A", 5, 140, 100), act("B", 5, 60, 100)]);
    expect(result.finalPlanned).toBeCloseTo(100, 5);
  });

  it("aceita sobre-execução acima de 100% e reporta adiantado", () => {
    // 130% executado é resultado real: reforma, aditivo, retrabalho.
    const result = buildSCurve([act("A", 10, 100, 130)]);
    expect(Number.isNaN(result.finalActual)).toBe(false);
    expect(result.finalActual).toBeGreaterThan(100);
    expect(result.status).toBe("adiantado");
  });
});
