import { describe, expect, it } from "vitest";
import { selectConfirmedProductionEntries } from "./production-entries";

describe("selectConfirmedProductionEntries", () => {
  it("does not count drafts as executed production", () => {
    const entries = [
      { id: 1, quantity: "12.000", status: "confirmada" },
      { id: 2, quantity: "8.000", status: "rascunho" },
    ];

    expect(selectConfirmedProductionEntries(entries)).toEqual([entries[0]]);
  });
});
