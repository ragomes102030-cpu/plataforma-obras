import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEapSkills } from "./skill-loader";

describe("loadEapSkills", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mantém o agente operacional com regras embutidas quando os markdowns não estão no deploy", async () => {
    const missing = Object.assign(new Error("arquivo ausente"), { code: "ENOENT" });
    vi.spyOn(fs, "readFile").mockRejectedValue(missing);

    const skills = await loadEapSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]?.id).toBe("planejamento.eap.base_embutida");
    expect(skills[0]?.content.toLowerCase()).toContain("não invente lote");
    expect(skills[0]?.mcpDependencies).toEqual([]);
  });

  it("não esconde erros de leitura diferentes de arquivo ausente", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("permissão negada"));

    await expect(loadEapSkills()).rejects.toThrow("permissão negada");
  });
});
