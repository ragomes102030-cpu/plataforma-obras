import { describe, expect, it } from "vitest";
import { hojeNoBrasil, isoToLocalDate } from "./calendario-obra";

/**
 * `hojeNoBrasil` existe porque o servidor roda em UTC.
 *
 * Sem ele, às 22h de Brasília o painel já anunciava o dia seguinte: "custo até
 * 22/10" no dia 21, e nota lançada hoje caía fora do corte de "hoje". Data de
 * obra é data do canteiro, não do datacenter.
 */
describe("hojeNoBrasil", () => {
  it("às 22h de Brasília ainda é o dia anterior no calendário da obra", () => {
    // 22/10 01:00 UTC = 21/10 22:00 em São Paulo (UTC−3)
    expect(hojeNoBrasil(new Date("2026-10-22T01:00:00Z"))).toBe("2026-10-21");
  });

  it("vira o dia quando vira a meia-noite em São Paulo", () => {
    // 22/10 03:00 UTC = 22/10 00:00 em São Paulo
    expect(hojeNoBrasil(new Date("2026-10-22T03:00:00Z"))).toBe("2026-10-22");
  });

  it("meio-dia UTC é o mesmo dia nos dois fusos", () => {
    expect(hojeNoBrasil(new Date("2026-10-21T12:00:00Z"))).toBe("2026-10-21");
  });

  it("atravessa a virada de ano no fuso da obra", () => {
    // 01/01/2027 02:00 UTC = 31/12/2026 23:00 em São Paulo
    expect(hojeNoBrasil(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });

  it("sempre devolve yyyy-mm-dd com zero à esquerda", () => {
    expect(hojeNoBrasil(new Date("2026-03-05T15:00:00Z"))).toBe("2026-03-05");
  });
});

describe("isoToLocalDate", () => {
  it("devolve meia-noite local, não UTC", () => {
    const data = isoToLocalDate("2026-02-26");
    expect(data.getFullYear()).toBe(2026);
    expect(data.getMonth()).toBe(1);
    expect(data.getDate()).toBe(26);
    expect(data.getHours()).toBe(0);
  });
});
