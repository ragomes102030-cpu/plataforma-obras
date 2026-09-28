import { describe, expect, it } from "vitest";
import { calculateCpm } from "./cpm";

describe("calculateCpm", () => {
  it("calcula datas, duração e caminho crítico em rede simples", () => {
    const result = calculateCpm(
      [
        { id: "A", duration: 3 },
        { id: "B", duration: 5 },
        { id: "C", duration: 2 },
      ],
      [
        { predecessorId: "A", successorId: "B", type: "FS" },
        { predecessorId: "A", successorId: "C", type: "FS" },
      ]
    );
    expect(result.projectDuration).toBe(8);
    expect(result.activities.find(item => item.id === "B")).toMatchObject({
      earlyStart: 3,
      earlyFinish: 8,
      totalFloat: 0,
      critical: true,
    });
    expect(result.activities.find(item => item.id === "C")).toMatchObject({
      earlyStart: 3,
      earlyFinish: 5,
      totalFloat: 3,
      critical: false,
    });
    expect(result.criticalPath).toEqual(["A", "B"]);
  });

  it("aplica SS e lag de forma determinística", () => {
    const result = calculateCpm(
      [
        { id: "A", duration: 4 },
        { id: "B", duration: 3 },
      ],
      [{ predecessorId: "A", successorId: "B", type: "SS", lag: 2 }]
    );
    expect(result.activities.find(item => item.id === "B")).toMatchObject({
      earlyStart: 2,
      earlyFinish: 5,
    });
    expect(result.projectDuration).toBe(5);
  });

  it("aplica SF usando o início da predecessora", () => {
    const result = calculateCpm(
      [
        { id: "A", duration: 4 },
        { id: "B", duration: 3 },
      ],
      [{ predecessorId: "A", successorId: "B", type: "SF" }]
    );

    expect(result.activities.find(item => item.id === "B")).toMatchObject({
      earlyStart: 0,
      earlyFinish: 3,
    });
  });

  it("rejeita ciclos antes de calcular", () => {
    expect(() =>
      calculateCpm(
        [
          { id: "A", duration: 1 },
          { id: "B", duration: 1 },
        ],
        [
          { predecessorId: "A", successorId: "B", type: "FS" },
          { predecessorId: "B", successorId: "A", type: "FS" },
        ]
      )
    ).toThrow("A rede possui ciclo");
  });

  // ---- free float ----
  it("calcula freeFloat para atividade terminal sem sucessoras", () => {
    const result = calculateCpm(
      [{ id: "A", duration: 2 }],
      []
    );
    // projectDuration = 2, earlyFinish = 2, freeFloat = 0
    expect(result.activities[0].freeFloat).toBe(0);
  });

  it("calcula freeFloat de atividade não crítica com sucessora", () => {
    // A dur=2 -> B dur=3 (FS). A->C dur=1 (FS). C is terminal.
    // A: ES=0, EF=2. B: ES=2, EF=5. C: ES=2, EF=3. projectDuration=max(5,3)=5.
    // freeFloat(A) = min(B.ES, C.ES) - A.EF = min(2,2) - 2 = 0.
    // freeFloat(B) = projectDuration - B.EF = 5 - 5 = 0 (terminal, critical).
    // freeFloat(C) = projectDuration - C.EF = 5 - 3 = 2 (terminal, not critical).
    const result = calculateCpm(
      [{ id: "A", duration: 2 }, { id: "B", duration: 3 }, { id: "C", duration: 1 }],
      [
        { predecessorId: "A", successorId: "B", type: "FS" },
        { predecessorId: "A", successorId: "C", type: "FS" },
      ]
    );
    expect(result.activities.find(item => item.id === "C")!.freeFloat).toBe(2);
    expect(result.activities.find(item => item.id === "B")!.freeFloat).toBe(0);
    expect(result.activities.find(item => item.id === "A")!.freeFloat).toBe(0);
  });

  // ---- mustStartOn constraint ----
  it("mustStartOn força earlyStart = lateStart = mustStartOn", () => {
    const result = calculateCpm(
      [{ id: "A", duration: 3, mustStartOn: 5 }],
      []
    );
    const a = result.activities[0];
    expect(a.earlyStart).toBe(5);
    expect(a.lateStart).toBe(5);
    expect(a.earlyFinish).toBe(8);
    expect(a.totalFloat).toBe(0);
    expect(a.critical).toBe(true);
  });

  it("mustStartOn empurra a sucessora no mesmo índice de dia útil", () => {
    // A dur=2, mustStartOn=5 -> ES=5, EF=7. B (FS) começa em 7.
    const result = calculateCpm(
      [{ id: "A", duration: 2, mustStartOn: 5 }, { id: "B", duration: 3 }],
      [{ predecessorId: "A", successorId: "B", type: "FS" }]
    );
    const a = result.activities.find(item => item.id === "A")!;
    expect(a.earlyStart).toBe(5);
    expect(a.earlyFinish).toBe(7);
    const b = result.activities.find(item => item.id === "B")!;
    expect(b.earlyStart).toBe(7);
    expect(b.earlyFinish).toBe(10);
    expect(result.projectDuration).toBe(10);
  });

  // ---- finishNoLaterThan constraint ----
  it("finishNoLaterThan limita lateFinish quando é mais restritivo que o natural", () => {
    // A dur=2, B dur=3, A->B FS. projectDuration=5.
    // Sem constraint: A lateFinish=2 (B.lateStart=2), A totalFloat=0 (já é crítica).
    // Com finishNoLaterThan=1 em A: A LF=min(2,1)=1, A LS=1-2=-1. totalFloat=-1 (inviável).
    const result = calculateCpm(
      [{ id: "A", duration: 2, finishNoLaterThan: 1 }, { id: "B", duration: 3 }],
      [{ predecessorId: "A", successorId: "B", type: "FS" }]
    );
    const a = result.activities.find(item => item.id === "A")!;
    expect(a.lateFinish).toBe(1);
    expect(a.totalFloat).toBe(-1);
    expect(a.critical).toBe(true); // totalFloat <= 0
  });

  it("freeFloat é presente em todos os resultados", () => {
    const result = calculateCpm(
      [{ id: "A", duration: 2 }, { id: "B", duration: 3 }],
      [{ predecessorId: "A", successorId: "B", type: "FS" }]
    );
    expect(result.activities.find(item => item.id === "A")!.freeFloat).toBe(0);
    expect(result.activities.find(item => item.id === "B")!.freeFloat).toBe(0);
  });
});
