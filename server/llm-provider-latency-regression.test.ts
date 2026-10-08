import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("LLM provider latency guard", () => {
  it("caches persisted provider configuration across ReAct rounds", () => {
    const source = readFileSync(join(process.cwd(), "server/llm-provider-gateway.ts"), "utf8");
    expect(source).toContain("STORED_PROVIDER_CACHE_TTL_MS = 300_000");
    expect(source).toContain('LLM_MAX_TOKENS ?? "4096"');
    expect(source).toContain("storedProviderCache");
    expect(source).toContain("storedProviderInFlight");
    expect(source).toContain("storedProviderCache = null");
  });
});
