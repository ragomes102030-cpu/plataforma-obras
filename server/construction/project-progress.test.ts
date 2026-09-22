import { describe, expect, it } from "vitest";
import { deriveProjectProgress } from "./project-progress";

describe("deriveProjectProgress", () => {
  it("retorna 0 quando nao ha atividades", () => {
    expect(deriveProjectProgress([])).toBe(0);
  });

  it("retorna a media simples quando duracoes sao zero", () => {
    expect(
      deriveProjectProgress([
        { progress: 0, durationDays: 0 },
        { progress: 100, durationDays: 0 },
      ])
    ).toBe(50);
  });

  it("pondera pela duracao da atividade", () => {
    // 10 dias a 0% + 10 dias a 100% = 50%
    expect(
      deriveProjectProgress([
        { progress: 0, durationDays: 10 },
        { progress: 100, durationDays: 10 },
      ])
    ).toBe(50);
    // atividade longa concluida domina: 90 dias 100% + 10 dias 0% = 90%
    expect(
      deriveProjectProgress([
        { progress: 100, durationDays: 90 },
        { progress: 0, durationDays: 10 },
      ])
    ).toBe(90);
  });

  it("ignora duracao negativa no peso (usa 0) e cai na media simples", () => {
    expect(
      deriveProjectProgress([
        { progress: 100, durationDays: -5 },
        { progress: 0, durationDays: 0 },
      ])
    ).toBe(50);
  });

  it("prende o resultado em 0–100 mesmo com progresso fora da faixa", () => {
    expect(
      deriveProjectProgress([{ progress: 150, durationDays: 10 }])
    ).toBe(100);
    expect(
      deriveProjectProgress([{ progress: -20, durationDays: 10 }])
    ).toBe(0);
  });

  it("arredonda para inteiro", () => {
    expect(
      deriveProjectProgress([
        { progress: 33, durationDays: 1 },
        { progress: 33, durationDays: 1 },
        { progress: 34, durationDays: 1 },
      ])
    ).toBe(33);
  });
});
