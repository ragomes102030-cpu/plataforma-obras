import { describe, it, expect } from "vitest";
import { persistCpmResult, type CpmPersisterDb } from "./cpm-persister";
import type { ScheduleResult } from "../../shared/cpm";

function schedule(activities: ScheduleResult["activities"]): ScheduleResult {
  return {
    activities,
    projectDuration: 5,
    criticalPath: activities.filter(activity => activity.critical).map(activity => activity.id),
    infeasibleActivities: [],
  };
}

describe("persistCpmResult", () => {
  it("persists the CPM result for the requested project and plan version", async () => {
    let executeCalls = 0;
    const db = {
      execute: async () => {
        executeCalls += 1;
        return { rowCount: 1 };
      },
    } as unknown as CpmPersisterDb;

    const result = await persistCpmResult(
      db,
      42,
      7,
      schedule([
        {
          id: "101",
          duration: 5,
          earlyStart: 0,
          earlyFinish: 5,
          lateStart: 0,
          lateFinish: 5,
          totalFloat: 0,
          freeFloat: 0,
          critical: true,
          infeasible: false,
        },
      ])
    );

    expect(result).toBe(1);
    expect(executeCalls).toBe(1);
  });

  it("does not issue database updates for an empty CPM result", async () => {
    let executeCalls = 0;
    const db = {
      execute: async () => {
        executeCalls += 1;
        return { rowCount: 1 };
      },
    } as unknown as CpmPersisterDb;

    const result = await persistCpmResult(db, 42, 7, schedule([]));

    expect(result).toBe(0);
    expect(executeCalls).toBe(0);
  });

  it("skips activity IDs that cannot be represented as integers", async () => {
    let executeCalls = 0;
    const db = {
      execute: async () => {
        executeCalls += 1;
        return { rowCount: 1 };
      },
    } as unknown as CpmPersisterDb;

    const result = await persistCpmResult(
      db,
      42,
      7,
      schedule([
        {
          id: "not-an-integer",
          duration: 5,
          earlyStart: 0,
          earlyFinish: 5,
          lateStart: 0,
          lateFinish: 5,
          totalFloat: 0,
          freeFloat: 0,
          critical: true,
          infeasible: false,
        },
      ])
    );

    expect(result).toBe(0);
    expect(executeCalls).toBe(0);
  });
  it("does not count an activity when the UPDATE matches no database row", async () => {
    const db = {
      execute: async () => ({ rowCount: 0 }),
    } as unknown as CpmPersisterDb;

    const result = await persistCpmResult(
      db,
      42,
      7,
      schedule([
        {
          id: "101",
          duration: 5,
          earlyStart: 0,
          earlyFinish: 5,
          lateStart: 0,
          lateFinish: 5,
          totalFloat: 0,
          freeFloat: 0,
          critical: true,
          infeasible: false,
        },
      ])
    );

    expect(result).toBe(0);
  });

});
