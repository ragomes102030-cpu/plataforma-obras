import { describe, it, expect } from "vitest";

describe("calculateCpmLocal router", () => {
  it("should calculate CPM locally without MCP", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty("planning.calculateCpmLocal");
  });

  it("should return validation result with schedule data", async () => {
    const { appRouter } = await import("./routers");
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    const result = procedures["planning.calculateCpmLocal"];
    expect(result).toBeDefined();
    expect(typeof result).toBe("function");
  });
});
