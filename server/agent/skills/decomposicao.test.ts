import { describe, it, expect } from "vitest";
import decomposicaoSkill from "./decomposicao";
import type { SkillContext } from "./types";

const context: SkillContext = {};

describe("decomposicao skill", () => {
  it("deve validar escopo muito curto", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "obra" },
      context
    );
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it("deve validar pavimentos < 1", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de edifício comercial", pavimentos: 0 },
      context
    );
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Número de pavimentos deve ser >= 1.");
  });

  it("deve validar blocos < 1", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de edifício comercial", blocos: 0 },
      context
    );
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Número de blocos deve ser >= 1.");
  });

  it("deve decompor por pavimento quando pavimentos > 1", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de edifício comercial", pavimentos: 5 },
      context
    );
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as { estrutura: string[]; nivelRecomendado: number };
    expect(data.estrutura.some(e => e.includes("Pavimento"))).toBe(true);
    expect(data.nivelRecomendado).toBe(3);
  });

  it("deve decompor por bloco quando blocos > 1", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de conjunto habitacional", blocos: 3 },
      context
    );
    expect(result.success).toBe(true);
    const data = result.data as { estrutura: string[]; nivelRecomendado: number };
    expect(data.estrutura.some(e => e.includes("Bloco"))).toBe(true);
    expect(data.nivelRecomendado).toBe(3);
  });

  it("deve decompor por frente quando frentes fornecidas", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de rodovia", frentes: ["Trecho 1", "Trecho 2"] },
      context
    );
    expect(result.success).toBe(true);
    const data = result.data as { estrutura: string[]; nivelRecomendado: number };
    expect(data.estrutura.some(e => e.includes("Trecho 1"))).toBe(true);
    expect(data.estrutura.some(e => e.includes("Trecho 2"))).toBe(true);
    expect(data.nivelRecomendado).toBe(3);
  });

  it("deve gerar aviso quando nenhuma dimensão de localização é fornecida", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de galpão industrial" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });

  it("deve gerar aviso para edificacao sem pavimentos", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de edifício residencial", tipoDeObra: "edificio" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes("pavimentos"))).toBe(true);
  });

  it("deve aceitar escopo válido sem dimensões", async () => {
    const result = await decomposicaoSkill.execute(
      { escopo: "Construção de galpão industrial de 5000m²" },
      context
    );
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });
});
