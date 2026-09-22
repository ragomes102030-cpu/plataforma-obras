import { describe, expect, it } from "vitest";
import {
  allowedSourcesFor,
  canTransitionFinding,
  type FindingStatus,
} from "./finding-lifecycle";

describe("canTransitionFinding", () => {
  it("permite resolver um achado aberto", () => {
    expect(canTransitionFinding("open", "resolved")).toBe(true);
  });

  it("permite arquivar um achado aberto", () => {
    expect(canTransitionFinding("open", "obsolete")).toBe(true);
  });

  it("permite arquivar um achado ja resolvido", () => {
    expect(canTransitionFinding("resolved", "obsolete")).toBe(true);
  });

  it("permite reabrir um achado resolvido", () => {
    expect(canTransitionFinding("resolved", "open")).toBe(true);
  });

  it("permite reabrir um achado arquivado", () => {
    expect(canTransitionFinding("obsolete", "open")).toBe(true);
  });

  it("permite resolver um achado confirmado", () => {
    expect(canTransitionFinding("confirmed", "resolved")).toBe(true);
  });

  it("permite arquivar um achado confirmado", () => {
    expect(canTransitionFinding("confirmed", "obsolete")).toBe(true);
  });

  it("nao permite resolver um achado confirmado duas vezes", () => {
    expect(canTransitionFinding("resolved", "resolved")).toBe(false);
  });

  it("nao permite reabrir um achado que ja esta aberto", () => {
    expect(canTransitionFinding("open", "open")).toBe(false);
  });

  it("nao permite arquivar um achado rejeitado", () => {
    expect(canTransitionFinding("rejected", "obsolete")).toBe(false);
  });

  it("expoe as origens permitidas por destino", () => {
    expect(allowedSourcesFor("resolved")).toEqual(["open", "confirmed"]);
    expect(allowedSourcesFor("obsolete")).toEqual([
      "open",
      "confirmed",
      "resolved",
    ]);
    expect(allowedSourcesFor("open")).toEqual([
      "resolved",
      "obsolete",
      "rejected",
    ]);
  });

  it("cobre todos os status de origem sem lacuna", () => {
    const origens: FindingStatus[] = [
      "open",
      "confirmed",
      "rejected",
      "resolved",
      "obsolete",
    ];
    for (const origem of origens) {
      const alcancaveis = (["open", "resolved", "obsolete"] as const).filter(
        destino => canTransitionFinding(origem, destino)
      );
      expect(alcancaveis.length).toBeGreaterThan(0);
    }
  });
});
