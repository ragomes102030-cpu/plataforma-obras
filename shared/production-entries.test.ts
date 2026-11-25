import { describe, expect, it } from "vitest";
import { isClearlyQaExampleNote, selectConfirmedProductionEntries } from "./production-entries";

describe("selectConfirmedProductionEntries", () => {
  it("does not count drafts as executed production", () => {
    const entries = [
      { id: 1, quantity: "12.000", status: "confirmada" },
      { id: 2, quantity: "8.000", status: "rascunho" },
    ];

    expect(selectConfirmedProductionEntries(entries)).toEqual([entries[0]]);
  });

  it("does not count a confirmed entry with an incompatible unit", () => {
    const entries = [
      { id: 1, quantity: "12.000", status: "confirmada", unidadeCompativel: false },
      { id: 2, quantity: "8.000", status: "confirmada", unidadeCompativel: true },
    ];

    expect(selectConfirmedProductionEntries(entries)).toEqual([entries[1]]);
  });

  it("does not count a confirmed QA example as real production", () => {
    const entries = [
      { id: 1, quantity: "12.000", status: "confirmada", exemplo: 1 },
      { id: 2, quantity: "8.000", status: "confirmada", exemplo: 0 },
    ];

    expect(selectConfirmedProductionEntries(entries)).toEqual([entries[1]]);
  });

  it("recognizes an explicit QA simulation note with accents and casing", () => {
    expect(isClearlyQaExampleNote("SIMULAÇÃO QA — dado sintético, não execução real.")).toBe(true);
    expect(isClearlyQaExampleNote("Premissa QA: quantitativo para cenário.")).toBe(true);
    expect(isClearlyQaExampleNote("Boletim de medição de campo 04/2026.")).toBe(false);
  });
});
