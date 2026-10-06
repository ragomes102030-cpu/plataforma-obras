import { describe, expect, it } from "vitest";
import { isStoredCpmCurrent } from "./cpm-validity";

describe("CPM freshness contract", () => {
  const activity = (updatedAt: string, cpmCalculatedAt: string | null) => ({
    durationDays: 5,
    updatedAt,
    cpmCalculatedAt,
  });

  it("is current immediately after calculation", () => {
    expect(isStoredCpmCurrent([
      activity("2026-10-06T10:00:00Z", "2026-10-06T10:00:01Z"),
    ])).toBe(true);
  });

  it("becomes stale when a schedule input changes after CPM", () => {
    expect(isStoredCpmCurrent([
      activity("2026-10-06T10:00:02Z", "2026-10-06T10:00:01Z"),
    ])).toBe(false);
  });

  it("requires recalculation for every activity in the network", () => {
    expect(isStoredCpmCurrent([
      activity("2026-10-06T10:00:00Z", "2026-10-06T10:00:01Z"),
      activity("2026-10-06T10:00:00Z", null),
    ])).toBe(false);
  });

  it("treats a relationship mutation as stale when the API advances updatedAt", () => {
    const afterDependencyChange = [
      activity("2026-10-06T10:00:05Z", "2026-10-06T10:00:01Z"),
      activity("2026-10-06T10:00:05Z", "2026-10-06T10:00:01Z"),
    ];
    expect(isStoredCpmCurrent(afterDependencyChange)).toBe(false);
  });
});
