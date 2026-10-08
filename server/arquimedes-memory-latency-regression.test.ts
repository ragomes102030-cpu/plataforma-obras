import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Arquimedes memory latency guard", () => {
  it("does not inject raw conversation history into the default memory context", () => {
    const source = readFileSync(join(process.cwd(), "server/agent/memory.ts"), "utf8");
    expect(source).toContain('["conversa_sistema", "historico_execucao"]');
    expect(source).toContain("MEMORY_CACHE_TTL_MS = 15_000");
    expect(source).toContain("memoryRecallCache");
    expect(source).toContain("invalidateMemoryRecallCache");
  });

  it("reduces the default ReAct budget for analytical chat", () => {
    const source = readFileSync(join(process.cwd(), "server/orchestrator.ts"), "utf8");
    expect(source).toContain('intent === "analise"');
    expect(source).toContain("? 4");
    expect(source).toContain('intent === "operacao"');
  });

  it("reduz o catálogo de ferramentas no chat analítico", () => {
    const source = readFileSync(join(process.cwd(), "server/orchestrator.ts"), "utf8");
    expect(source).toContain("analysisToolAllowlist");
    expect(source).toContain('intent === "analise"');
    expect(source).toContain('engineering_gap_analysis');
  });
});
