import { describe, expect, it } from "vitest";
import { calcularPrevisaoDePrazo } from "./activity-schedule-forecast";

describe("previsão restante do cronograma", () => {
  it("desloca as sucessoras pelo saldo de uma atividade em andamento", () => {
    const resultado = calcularPrevisaoDePrazo({
      cutoffOffset: 4,
      activities: [
        { id: "concreto", duration: 4, startOffsetDay: 0 },
        { id: "desforma", duration: 3, startOffsetDay: 4 },
      ],
      dependencies: [{ predecessorId: "concreto", successorId: "desforma", type: "FS" }],
      updates: [{ activityId: "concreto", status: "em_andamento", actualStartOffset: 2, remainingDurationDays: 2 }],
    });

    expect(resultado).toMatchObject({ projectFinishOffset: 9, unavailableReason: null });
    expect(resultado.activities).toEqual([
      expect.objectContaining({ id: "concreto", startOffset: 4, finishOffset: 6 }),
      expect.objectContaining({ id: "desforma", startOffset: 6, finishOffset: 9 }),
    ]);
  });

  it("ancora atividade concluída no término real e mantém sucessoras depois do corte", () => {
    const resultado = calcularPrevisaoDePrazo({
      cutoffOffset: 4,
      activities: [
        { id: "fundacao", duration: 5, startOffsetDay: 0 },
        { id: "estrutura", duration: 3, startOffsetDay: 5 },
      ],
      dependencies: [{ predecessorId: "fundacao", successorId: "estrutura", type: "FS" }],
      updates: [{ activityId: "fundacao", status: "concluida", actualStartOffset: 0, actualFinishOffset: 3 }],
    });

    expect(resultado.activities).toEqual([
      expect.objectContaining({ id: "fundacao", startOffset: 3, finishOffset: 3, isMilestone: true }),
      expect.objectContaining({ id: "estrutura", startOffset: 5, finishOffset: 8 }),
    ]);
    expect(resultado.projectFinishOffset).toBe(8);
  });

  it("retém duração das atividades sem relato, sem permitir início antes do corte", () => {
    const resultado = calcularPrevisaoDePrazo({
      cutoffOffset: 5,
      activities: [
        { id: "alvenaria", duration: 2, startOffsetDay: 0 },
        { id: "reboco", duration: 1, startOffsetDay: 2 },
      ],
      dependencies: [{ predecessorId: "alvenaria", successorId: "reboco", type: "FS" }],
      updates: [],
    });

    expect(resultado).toMatchObject({ projectFinishOffset: 8, activitiesWithoutUpdate: 2 });
    expect(resultado.activities.every(activity => activity.startOffset >= 5)).toBe(true);
    expect(resultado.warnings.map(warning => warning.code)).toContain("COBERTURA_INCOMPLETA");
  });

  it("não publica término geral quando há serviço bloqueado sem estimativa", () => {
    const resultado = calcularPrevisaoDePrazo({
      cutoffOffset: 3,
      activities: [{ id: "ligacao", duration: 2, startOffsetDay: 0 }],
      dependencies: [],
      updates: [{ activityId: "ligacao", status: "bloqueada", blockerReason: "Aguardando concessionária" }],
    });

    expect(resultado.projectFinishOffset).toBeNull();
    expect(resultado.unavailableReason).toMatch(/ligacao.*bloquead/i);
  });

  it("sinaliza atividade iniciada antes da janela planejada e recalcula fora de sequência", () => {
    const resultado = calcularPrevisaoDePrazo({
      cutoffOffset: 4,
      activities: [
        { id: "pilar", duration: 5, startOffsetDay: 0 },
        { id: "viga", duration: 3, startOffsetDay: 0 },
      ],
      dependencies: [{ predecessorId: "pilar", successorId: "viga", type: "FS" }],
      updates: [{ activityId: "viga", status: "em_andamento", actualStartOffset: 3, remainingDurationDays: 2 }],
    });

    expect(resultado.outOfSequenceActivityIds).toContain("viga");
    expect(resultado.activities.find(activity => activity.id === "viga"))
      .toMatchObject({ startOffset: 4, finishOffset: 6 });
    expect(resultado.warnings.map(warning => warning.code)).toContain("FORA_DE_SEQUENCIA");
  });

  it("mantém visível uma data limite que a previsão de campo já não consegue cumprir", () => {
    const resultado = calcularPrevisaoDePrazo({
      cutoffOffset: 4,
      activities: [{ id: "impermeabilizacao", duration: 5, startOffsetDay: 0, finishNoLaterThan: 3 }],
      dependencies: [],
      updates: [],
    });

    expect(resultado.projectFinishOffset).toBe(9);
    expect(resultado.warnings.map(warning => warning.code)).toContain("PRAZO_INVIAVEL");
  });
});
