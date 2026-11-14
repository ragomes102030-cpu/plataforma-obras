import { describe, expect, it } from "vitest";
import { selecionarSemanaDashboard } from "./dashboard-lookahead";

describe("selecionarSemanaDashboard", () => {
  it("prefere a próxima semana quando a data de referência cai no fim de semana", () => {
    const encerrada = { inicio: "2026-11-09", situacao: "encerrada" as const };
    const futura = { inicio: "2026-11-16", situacao: "futura" as const };

    expect(selecionarSemanaDashboard([encerrada, futura])).toBe(futura);
  });

  it("mantém prioridade para semana corrente e usa encerrada como último recurso", () => {
    const corrente = { situacao: "corrente" as const };
    const futura = { situacao: "futura" as const };
    const encerrada = { situacao: "encerrada" as const };

    expect(selecionarSemanaDashboard([encerrada, corrente, futura])).toBe(corrente);
    expect(selecionarSemanaDashboard([encerrada])).toBe(encerrada);
    expect(selecionarSemanaDashboard([])).toBeUndefined();
  });
});
