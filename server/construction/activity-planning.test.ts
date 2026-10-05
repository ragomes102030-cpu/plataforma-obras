import { describe, expect, it } from "vitest";
import { isTerminalEapNode, resolveActivityDuration } from "./activity-planning";

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
