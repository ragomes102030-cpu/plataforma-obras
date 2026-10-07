import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("QA activities must not contaminate operational planning", () => {
  const source = fs.readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

  it("excludes exemplo activities from baseline", () => {
    expect(source).toContain("const allActivities = await db.select().from(scheduleActivities)");
    expect(source).toContain("Number(activity.exemplo ?? 0) !== 1");
    expect(source).toContain("Não há atividades operacionais para congelar como baseline.");
  });

  it("filters dependencies to operational activities before CPM", () => {
    expect(source).toContain("const operationalIds = new Set(activities.map(activity => activity.id));");
    expect(source).toContain("operationalIds.has(dependency.predecessorId) && operationalIds.has(dependency.successorId)");
  });

  it("excludes exemplo activities from leveling CPM", () => {
    expect(source).toContain(".filter(activity => Number(activity.exemplo ?? 0) !== 1);");
    expect(source).toContain("const operationalDependencies = dependencies.filter");
  });
});
