import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const memory = readFileSync("server/agent/memory.ts", "utf-8");
const orchestrator = readFileSync("server/orchestrator.ts", "utf-8");
const bootstrap = readFileSync("docs/ARQUIMEDES-CEREBRO-BOOTSTRAP.md", "utf-8");

describe("Arquimedes brain conversation continuity", () => {
  it("has a durable conversation recorder in the memory layer", () => {
    expect(memory).toContain("rememberArquimedesConversation");
    expect(memory).toContain('category: "conversa_sistema"');
    expect(memory).toContain('kind: "operational_conversation"');
    expect(memory).toContain('lifecycle: "historical"');
  });

  it("records every authenticated orchestrator conversation after the response", () => {
    expect(orchestrator).toContain("rememberArquimedesConversation");
    expect(orchestrator).toContain("messages,");
    expect(orchestrator).toContain("response: content");
    expect(orchestrator).toContain("if (options.userId && messages.length > 0)");
  });

  it("keeps historical conversation separate from validated knowledge", () => {
    expect(bootstrap).toContain("transcript é histórico recuperável");
    expect(bootstrap).toContain("não pode ser tratado como regra validada");
    expect(bootstrap).toContain("memória nunca");
  });
});
