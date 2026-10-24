import { describe, expect, it } from "vitest";
import {
  ARQUIMEDES_MEMORY_STATUSES,
  canTransitionMemoryStatus,
} from "./memory";

describe("ciclo de vida da memória do Arquimedes", () => {
  it("uma memória só nasce proposta e pode ser aprovada, rejeitada ou aposentada", () => {
    expect(canTransitionMemoryStatus("proposed", "approved")).toBe(true);
    expect(canTransitionMemoryStatus("proposed", "rejected")).toBe(true);
    expect(canTransitionMemoryStatus("proposed", "obsolete")).toBe(true);
  });

  it("uma memória obsoleta é terminal (não volta atrás)", () => {
    expect(canTransitionMemoryStatus("obsolete", "approved")).toBe(false);
    expect(canTransitionMemoryStatus("obsolete", "proposed")).toBe(false);
  });

  it("não permite transições inexistentes nem status desconhecidos", () => {
    expect(canTransitionMemoryStatus("proposed", "proposed")).toBe(false);
    expect(canTransitionMemoryStatus("approved", "approved")).toBe(false);
    expect(canTransitionMemoryStatus("lido", "approved")).toBe(false);
  });

  it("aprovação e rejeição podem ser revistas (o engenheiro erra)", () => {
    expect(canTransitionMemoryStatus("approved", "rejected")).toBe(true);
    expect(canTransitionMemoryStatus("rejected", "approved")).toBe(true);
  });

  it("expõe os status válidos", () => {
    expect(ARQUIMEDES_MEMORY_STATUSES).toEqual([
      "proposed",
      "approved",
      "rejected",
      "obsolete",
    ]);
  });
});
