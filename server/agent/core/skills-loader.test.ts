import { describe, expect, it } from "vitest";
import { selectArquimedesSkills } from "./skills-loader";

describe("Arquimedes contextual skills loader", () => {
  it("selects planning skills for EAP work without loading unrelated frontend skills", () => {
    const selected = selectArquimedesSkills("Revise a EAP e o planejamento da obra com regra dos 100%");
    expect(selected).toContain("planning-experts");
    expect(selected).not.toContain("frontend-design");
    expect(selected.length).toBeLessThanOrEqual(4);
  });

  it("selects browser and TDD skills for an end-to-end regression", () => {
    const selected = selectArquimedesSkills("Reproduza o bug com Playwright e crie teste de regressão");
    expect(selected).toContain("agent-browser");
    expect(selected).toContain("tdd");
  });

  it("selects skill discovery and authoring for a skills request", () => {
    const selected = selectArquimedesSkills("Adicionar as melhores skills e atualizar o catálogo do agente");
    expect(selected).toContain("find-skills");
    expect(selected).toContain("skill-authoring");
  });

  it("does not activate skills for an empty or casual query", () => {
    expect(selectArquimedesSkills("")).toEqual([]);
    expect(selectArquimedesSkills("Oi, tudo bem?")).toEqual([]);
  });
});
