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
    // O texto foi reescrito: "não declarar 'testado'" virou "não afirmar
    // 'testado'". A intencao — nao rotular como testado sem execucao observavel
    // — e a mesma, e e ela que precisa ficar travada.
    expect(playbook).toMatch(/n(ã|a)o (declarar|afirmar) “testado” sem execu(ç|c)(ã|a)o observ(á|a)vel\./);
    expect(playbook).toContain("observação → evidência → classificação");
    // O texto evoluiu de "exigem autorização explícita" para "sem autorização
    // específica" ao ser reescrito. A intenção verificada e a mesma — mutacao
    // irreversivel em obra real exige autorizacao — e o teste deve travar a
    // INTENCAO, nao a frase exata, senao vira ruido a cada revisao de redacao.
    expect(playbook).toMatch(/sem autoriza(ç|c)(ã|a)o espec(í|i)fica/);
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
