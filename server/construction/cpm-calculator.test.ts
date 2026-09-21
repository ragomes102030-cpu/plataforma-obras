import { describe, expect, it } from "vitest";
import { calculateDeterministicCpm } from "./cpm-calculator";
import type {
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";

function activity(id: string, durationDays: number): ScheduleEvidenceActivity {
  return {
    id,
    projectId: 1,
    externalId: id,
    eapRef: "1.1",
    wbsCode: "1.1",
    name: id,
    phase: "Execução",
    startOffset: 0,
    durationDays,
    progress: 0,
    status: "Não iniciado",
    critical: 0,
    sortOrder: 1,
  };
}

function dependency(
  predecessorId: string,
  successorId: string,
  type: ScheduleEvidenceDependency["type"] = "FS",
  lag = 0
): ScheduleEvidenceDependency {
  return {
    id: `${predecessorId}-${successorId}-${type}`,
    projectId: 1,
    externalId: null,
    predecessorId,
    successorId,
    type,
    lag,
  };
}

describe("calculateDeterministicCpm", () => {
  it("calcula rede linear e caminho crítico", () => {
    const result = calculateDeterministicCpm(
      [activity("A", 3), activity("B", 5), activity("C", 2)],
      [dependency("A", "B"), dependency("B", "C")]
    );

    expect(result.valid).toBe(true);
    expect(result.schedule?.projectDuration).toBe(10);
    expect(result.schedule?.criticalPath).toEqual(["A", "B", "C"]);
  });

  it("calcula rede paralela e folga", () => {
    const result = calculateDeterministicCpm(
      [activity("A", 3), activity("B", 5), activity("C", 2)],
      [dependency("A", "B"), dependency("A", "C")]
    );

    expect(result.schedule?.projectDuration).toBe(8);
    expect(
      result.schedule?.activities.find(item => item.id === "C")
    ).toMatchObject({
      totalFloat: 3,
      critical: false,
    });
  });

  it("não calcula quando a rede possui ciclo", () => {
    const result = calculateDeterministicCpm(
      [activity("A", 1), activity("B", 1)],
      [dependency("A", "B"), dependency("B", "A")]
    );

    expect(result.valid).toBe(false);
    expect(result.schedule).toBeNull();
    expect(result.issues[0]?.code).toBe("dependency_cycle");
  });

  it("aplica FF com lag", () => {
    const result = calculateDeterministicCpm(
      [activity("A", 4), activity("B", 3)],
      [dependency("A", "B", "FF", 2)]
    );

    expect(
      result.schedule?.activities.find(item => item.id === "B")
    ).toMatchObject({
      earlyStart: 3,
      earlyFinish: 6,
    });
  });
});
