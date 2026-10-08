import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("EAP proposal scope-aware regression", () => {
  it("does not reduce a building scope to a single root node", () => {
    const source = readFileSync(join(process.cwd(), "server", "routers.ts"), "utf8");

    expect(source).toContain("const hasBuildingCue=");
    expect(source).toContain('/(edif[ií]cio|residencial|apartamento|multifamiliar|pavimento|anda(r|res)|torre|condom[ií]nio|pr[eé]dio|shopping|comercial)/i');
    expect(source).toContain('name:"Fundações e contenções"');
    expect(source).toContain('name:"Estrutura de concreto"');
    expect(source).toContain('name:"Vedações e alvenarias"');
    expect(source).toContain('name:"Instalações prediais"');
    expect(source).toContain('name:"Revestimentos e acabamentos"');
    expect(source).toContain('name:"Comissionamento, documentação e entrega"');
    expect(source).toContain('parentCode:"1"');
    expect(source).toContain('sourceRef:"eap-analysis-scope-aware"');
  });

  it("keeps the generic fallback conservative when building cues are absent", () => {
    const source = readFileSync(join(process.cwd(), "server", "routers.ts"), "utf8");
    expect(source).toContain('name:"Infraestrutura"');
    expect(source).toContain('name:"Estrutura e sistemas principais"');
    expect(source).toContain('name:"Vedações e instalações"');
  });
});
