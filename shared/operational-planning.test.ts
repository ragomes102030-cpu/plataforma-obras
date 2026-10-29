import { describe, expect, it } from "vitest";
import {
  selectOperationalPlanning,
  selectOperationalScheduleRows,
} from "./operational-planning";

describe("selectOperationalPlanning", () => {
  it("excludes QA activities and only the edges attached to them", () => {
    const result = selectOperationalPlanning(
      [
        { id: 1, exemplo: 0 },
        { id: 2, exemplo: 1 },
        { id: 3, exemplo: 0 },
      ],
      [
        { predecessorId: 1, successorId: 2 },
        { predecessorId: 1, successorId: 3 },
      ]
    );

    expect(result.activities.map(activity => activity.id)).toEqual([1, 3]);
    expect(result.dependencies).toEqual([
      { predecessorId: 1, successorId: 3 },
    ]);
    expect(result.excludedExampleActivities).toBe(1);
    expect(result.excludedExampleDependencies).toBe(1);
  });

  it("keeps dependencies with genuinely missing endpoints for validation", () => {
    const result = selectOperationalPlanning(
      [{ id: 1, exemplo: 0 }],
      [{ predecessorId: 1, successorId: 99 }]
    );

    expect(result.dependencies).toEqual([
      { predecessorId: 1, successorId: 99 },
    ]);
    expect(result.excludedExampleDependencies).toBe(0);
  });
});

describe("selectOperationalScheduleRows", () => {
  const rows = [
    { codigo: "1.1", nome: "Concreto" },
    { codigo: "QA-01", nome: "Atividade de teste" },
  ];

  it("omits example rows from operational schedule views", () => {
    expect(selectOperationalScheduleRows(rows, new Set(["QA-01"]))).toEqual([
      rows[0],
    ]);
  });

  it("preserves rows when no example codes are available", () => {
    expect(selectOperationalScheduleRows(rows)).toEqual(rows);
  });
});
