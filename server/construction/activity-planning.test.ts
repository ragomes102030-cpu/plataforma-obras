import { describe, expect, it } from "vitest";
import { isTerminalEapNode, normalizePlanningDecimal, resolveActivityDuration } from "./activity-planning";

describe("politica de atividades", () => {
  it("aceita duração explícita positiva", () => {
    expect(resolveActivityDuration({ durationDays: 7 })).toBe(7);
  });

  it("rejeita duração zero", () => {
    expect(() => resolveActivityDuration({ durationDays: 0 })).toThrow(
      "duração positiva"
    );
  });

  it("rejeita duração negativa", () => {
    expect(() => resolveActivityDuration({ durationDays: -3 })).toThrow(
      "duração positiva"
    );
  });

  it("calcula duração por quantidade e produtividade", () => {
    expect(
      resolveActivityDuration({ plannedQuantity: 100, productivity: 20 })
    ).toBe(5);
  });

  it("arredonda duração calculada para cima", () => {
    expect(
      resolveActivityDuration({ plannedQuantity: 101, productivity: 20 })
    ).toBe(6);
  });

  it("rejeita quantidade sem produtividade", () => {
    expect(() =>
      resolveActivityDuration({ plannedQuantity: 100 })
    ).toThrow("quantidade + produtividade");
  });

  it("rejeita produtividade não positiva", () => {
    expect(() =>
      resolveActivityDuration({ plannedQuantity: 100, productivity: 0 })
    ).toThrow("quantidade + produtividade");
  });

  it("reconhece pacote e entrega como folhas terminais", () => {
    expect(isTerminalEapNode("pacote")).toBe(true);
    expect(isTerminalEapNode("entrega")).toBe(true);
    expect(isTerminalEapNode("grupo")).toBe(false);
  });
});

describe("Precisão do planejamento persistido",()=>{
  it("não adiciona um dia por erro de ponto flutuante",()=>{
    expect(resolveActivityDuration({plannedQuantity:0.14,productivity:0.01})).toBe(14);
  });
  it("calcula com os mesmos valores que serão persistidos",()=>{
    expect(resolveActivityDuration({plannedQuantity:1.0004,productivity:0.1004})).toBe(10);
    expect(resolveActivityDuration({plannedQuantity:1.0006,productivity:0.1004})).toBe(11);
  });
  it("rejeita produtividade positiva que arredondaria para zero",()=>{
    expect(()=>resolveActivityDuration({plannedQuantity:1,productivity:0.0001})).toThrow("precisão");
    expect(()=>resolveActivityDuration({durationDays:3,productivity:0.0001})).toThrow("precisão");
  });
  it("rejeita números não finitos ou fora dos limites do banco",()=>{
    expect(()=>normalizePlanningDecimal(Infinity)).toThrow();
    expect(()=>normalizePlanningDecimal(100_000_000_000)).toThrow();
    expect(()=>resolveActivityDuration({plannedQuantity:3_000_000,productivity:0.001})).toThrow("limite");
  });
  it("preserva duração explicitamente informada",()=>{
    expect(resolveActivityDuration({durationDays:7,plannedQuantity:100,productivity:20})).toBe(7);
    expect(normalizePlanningDecimal(0,true)).toBe(0);
  });
});
