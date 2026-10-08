import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("formal scope agent context regression", () => {
  it("passes the persisted work type and declared scope into operational Arquimedes context", () => {
    const source = readFileSync(join(process.cwd(), "server/orchestrator.ts"), "utf8");
    expect(source).toContain("context.project.tipoDeObra");
    expect(source).toContain("context.project.descricao");
    expect(source).toContain("registro local do projeto");
    expect(source).toContain("a falha do MCP não prova ausência de escopo");
    expect(source).toContain("ESCOPO FORMAL CANÔNICO DO REGISTRO LOCAL");
    expect(source).toContain("context.project.descricao?.trim().slice(0, 3000)");
  });
});
