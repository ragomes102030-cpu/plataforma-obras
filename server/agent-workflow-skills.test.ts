import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARQUIMEDES_SKILLS } from "./agent/capability-registry";
import { loadArquimedesOperationalSkills } from "./agent/core/brain-context";

const workflowSkillIds = [
  "find-skills",
  "dev-experts",
  "planning-experts",
  "grill-me",
  "architecture-review",
  "agent-browser",
  "tdd",
  "self-improving-agent",
  "frontend-design",
  "handoff",
];

describe("Arquimedes workflow skill pack", () => {
  it("registers the curated workflow skills as installed and enabled by default", () => {
    const byId = new Map(ARQUIMEDES_SKILLS.map(skill => [skill.id, skill]));
    for (const id of workflowSkillIds) {
      const skill = byId.get(id);
      expect(skill, `missing skill: ${id}`).toBeDefined();
      expect(skill?.status, id).toBe("installed");
      expect(skill?.defaultEnabled, id).toBe(true);
    }
  });

  it("documents real browser availability, TDD, safe learning and handoff limits", () => {
    const playbook = readFileSync(
      join(process.cwd(), "agent/skills/agent-workflows/skills.md"),
      "utf8"
    );
    const bootstrap = readFileSync(
      join(process.cwd(), "docs/ARQUIMEDES-CEREBRO-BOOTSTRAP.md"),
      "utf8"
    );
    expect(playbook).toContain("não declarar “testado” sem execução observável.");
    expect(playbook).toContain("observação → evidência → classificação");
    expect(playbook).toContain("exigem autorização explícita");
    expect(bootstrap).toContain("## Skills operacionais transversais");
    expect(bootstrap).toContain("testar como usuário com Playwright/browser real quando disponível");
  });

  it("loads only task-relevant detailed playbooks into runtime context", async () => {
    const skills = await loadArquimedesOperationalSkills(
      "Corrigir bug na EAP, testar com Playwright e criar regressão."
    );
    expect(skills).toContain("## 3. planning-experts");
    expect(skills).toContain("## 6. agent-browser");
    expect(skills).toContain("## 7. tdd");
    expect(skills.length).toBeLessThanOrEqual(4300);
  });

  it("falls back to a useful generic set for short continuation prompts", async () => {
    const skills = await loadArquimedesOperationalSkills("prossiga");
    expect(skills).toContain("## 1. find-skills");
    expect(skills).toContain("## 10. handoff");
    expect(skills).toContain("## 4. grill-me");
  });
});
