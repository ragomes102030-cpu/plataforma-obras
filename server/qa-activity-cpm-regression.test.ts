import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("operational planning is isolated by plan version", () => {
  const source = fs.readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

  it("selects only the current operational plan version for baseline", () => {
    expect(source).toContain("const versionId = await getOperationalPlanVersionId(db, input.projectId);");
    expect(source).toContain("operationalVersionCondition(versionId)");
    expect(source).toContain("Não há atividades operacionais para congelar como baseline.");
  });

  it("filters CPM dependencies to the same operational activity version", () => {
    expect(source).toContain("const operationalIds = new Set(activities.map(activity => activity.id));");
    expect(source).toContain("operationalDependencyVersionCondition(versionId)");
    expect(source).toContain("operationalIds.has(dependency.predecessorId) && operationalIds.has(dependency.successorId)");
  });

  it("uses the operational version for leveling CPM", () => {
    expect(source).toContain("operationalVersionCondition(versionId)");
    expect(source).toContain("const activityIds = activities.map(activity => activity.id);");
  });
});
