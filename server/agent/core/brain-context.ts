import fs from "node:fs/promises";
import path from "node:path";

const BOOTSTRAP_PATH = path.resolve(process.cwd(), "docs", "ARQUIMEDES-CEREBRO-BOOTSTRAP.md");
const SKILLS_PATH = path.resolve(process.cwd(), "agent", "skills", "agent-workflows", "skills.md");

export async function loadArquimedesBrainBootstrap(): Promise<string> {
  try {
    const content = await fs.readFile(BOOTSTRAP_PATH, "utf8");
    return content.trim().slice(0, 9000);
  } catch {
    return [
      "Cérebro mestre do Arquimedes indisponível no runtime.",
      "Considere a memória persistente e os dados atuais da obra como fontes de continuidade.",
      "Não invente aprendizados e não aplique alterações sem aprovação explícita."
    ].join("\n");
  }
}

const SKILL_SELECTORS: Array<{ id: string; pattern: RegExp }> = [
  { id: "find-skills", pattern: /skill|habilidade|capacidade|integrar|instalar/i },
  { id: "dev-experts", pattern: /código|bug|erro|desenvolv|backend|frontend|api|deploy|integração/i },
  { id: "planning-experts", pattern: /obra|eap|escopo|quantitativo|orçamento|cronograma|atividade|dependência|cpm|gantt|linha de balanço/i },
  { id: "grill-me", pattern: /premissa|ambígu|risco|requisito|decisão|prossiga|planejar/i },
  { id: "architecture-review", pattern: /arquitetura|refator|causa.raiz|contrato|migraç|acoplamento/i },
  { id: "agent-browser", pattern: /browser|navegador|playwright|interface|ui|fluxo|live|e2e/i },
  { id: "tdd", pattern: /teste|testar|regressão|tdd|corrigir|falha|validar|deploy/i },
  { id: "self-improving-agent", pattern: /aprend|memória|cérebro|melhorar|autoaperfeiço/i },
  { id: "frontend-design", pattern: /frontend|interface|responsiv|acessibilidade|design|tela/i },
  { id: "handoff", pattern: /checkpoint|continuidade|handoff|próximo passo|prossiga/i },
];

export async function loadArquimedesOperationalSkills(taskText: string): Promise<string> {
  try {
    const content = await fs.readFile(SKILLS_PATH, "utf8");
    const sections = content.split(/(?=^## \\d+\\. )/m).filter(section => /^## \\d+\\. /.test(section));
    const byId = new Map<string, string>();
    for (const section of sections) {
      const match = section.match(/^## \\d+\\. ([a-z0-9-]+)/);
      if (match) byId.set(match[1], section.trim());
    }

    const selected = new Set<string>(["find-skills", "handoff"]);
    for (const selector of SKILL_SELECTORS) {
      if (selector.pattern.test(taskText)) selected.add(selector.id);
    }
    if (selected.size <= 2) selected.add("grill-me");

    const priority = [
      "find-skills", "dev-experts", "planning-experts", "grill-me",
      "architecture-review", "agent-browser", "tdd",
      "self-improving-agent", "frontend-design", "handoff"
    ];
    const chosen = priority.filter(id => selected.has(id) && byId.has(id)).slice(0, 4);
    const playbooks = chosen.map(id => byId.get(id)!).join("\\n\\n").slice(0, 4200);
    return [
      "Use apenas os playbooks relevantes abaixo como método operacional. Skill orienta o trabalho, mas não concede permissões nem prova que ferramenta externa esteja conectada.",
      playbooks || "Playbooks detalhados indisponíveis; siga as regras resumidas do bootstrap."
    ].join("\\n\\n");
  } catch {
    return "Playbooks operacionais detalhados indisponíveis; siga as regras resumidas do bootstrap e não afirme que uma skill ou ferramenta foi executada sem evidência.";
  }
}
