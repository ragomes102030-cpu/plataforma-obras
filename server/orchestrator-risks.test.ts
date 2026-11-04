import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Arquimedes e riscos persistentes", () => {
  const source = readFileSync("server/orchestrator.ts", "utf8");

  it("expõe consulta local de riscos também no modo de análise", () => {
    expect(source).toContain("name: \"consultar_riscos_locais\"");
    expect(source).toContain("listLocalAgentRisks");
    expect(source).toContain("\"consultar_riscos_locais\",");
  });
});
