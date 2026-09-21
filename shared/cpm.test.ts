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
});
