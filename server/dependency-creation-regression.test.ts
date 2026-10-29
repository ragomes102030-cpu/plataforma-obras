import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync("server/routers.ts", "utf-8");
const cpmCalculator = readFileSync("server/construction/cpm-calculator.ts", "utf-8");

describe("criação incremental de dependências", () => {
  it("aceita vínculos parciais sem afrouxar o gate final do CPM", () => {
    const start = router.indexOf("createDependency: protectedProcedure");
    const end = router.indexOf("createDependencies: protectedProcedure", start);
    const createDependency = router.slice(start, end);
    expect(createDependency).toContain("{ allowIncomplete: true }");
    expect(createDependency).toContain('issue.code === "disconnected_network"');
    expect(cpmCalculator).toMatch(/validateDependencies\(activities, dependencies\)/);
    expect(cpmCalculator).not.toContain("allowIncomplete");
  });
});
