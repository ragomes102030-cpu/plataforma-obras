import fs from "node:fs/promises";
import path from "node:path";

type SkillDefinition = {
  id: string;
  path: string;
  triggers: RegExp[];
};

const SKILLS: SkillDefinition[] = [
  { id: "find-skills", path: "agent/skills/system/find-skills.md", triggers: [/\bskills?\b/i, /find.?skills/i, /habilidades?/i, /capacidades? do agente/i, /instalar.{0,30}(skill|habilidade)/i] },
  { id: "dev-experts", path: "agent/skills/system/dev-experts.md", triggers: [/dev.?experts/i, /código|bug|falha|depurar|debug|desenvolvimento|especialistas? de software/i] },
  { id: "planning-experts", path: "agent/skills/system/planning-experts.md", triggers: [/planning.?experts/i, /EAP|obra|planejamento|cronograma|quantitativos|caminho crítico|linha de balanço/i] },
  { id: "prompt-engineering", path: "agent/skills/system/prompt-engineering.md", triggers: [/prompt|prompting.?experts/i, /instruç(?:ão|ões)|resposta longa|truncad|contexto contraditório/i] },
  { id: "grill-me", path: "agent/skills/system/grill-me.md", triggers: [/grill.?me/i, /premissas?|decisão|decidir|escopo|aprovar|baseline|risco irreversível/i] },
  { id: "improve-codebase-architecture", path: "agent/skills/system/improve-codebase-architecture.md", triggers: [/improve.?code.?base.?architecture|code.?base.?architecture/i, /arquitetura|refator|acoplamento|fronteira de módulo|estrutura do código/i] },
  { id: "agent-browser", path: "agent/skills/system/agent-browser.md", triggers: [/agent.?browser/i, /playwright|browser|navegador|interface|e2e|ponta a ponta|fluxo de usuário/i] },
  { id: "tdd", path: "agent/skills/system/tdd.md", triggers: [/\bTDD\b/i, /teste|regressão|typecheck|build|corrigir bug/i] },
  { id: "self-improving-agent", path: "agent/skills/system/self-improving-agent.md", triggers: [/self.?improving/i, /auto.?melhor|aprendizado|aprend|regressão|falha recorrente|melhorar o agente/i] },
  { id: "frontend-design", path: "agent/skills/system/frontend-design.md", triggers: [/frontend|front.?design/i, /design visual|interface|responsiv|dashboard|Gantt|linha de balanço/i] },
  { id: "handoff", path: "agent/skills/system/handoff.md", triggers: [/handoff|checkpoint|continuar|prossiga|troca de sessão|retomar/i] },
  { id: "skill-authoring", path: "agent/skills/system/skill-authoring.md", triggers: [/\bskills?\b/i, /skill.?authoring/i, /habilidades? do agente/i, /catálogo de skills/i] },
];

export function selectArquimedesSkills(query: string, limit = 4): string[] {
  const text = query.trim();
  if (!text || limit < 1) return [];
  return SKILLS
    .filter(skill => skill.triggers.some(pattern => pattern.test(text)))
    .slice(0, limit)
    .map(skill => skill.id);
}

export async function loadArquimedesSkillsForPrompt(query: string, limit = 4): Promise<string> {
  const selected = selectArquimedesSkills(query, limit);
  if (!selected.length) return "Nenhuma skill especializada acionada para esta solicitação.";
  const sections = await Promise.all(selected.map(async id => {
    const skill = SKILLS.find(item => item.id === id);
    if (!skill) return "";
    try {
      const filePath = path.resolve(process.cwd(), skill.path);
      const content = (await fs.readFile(filePath, "utf8")).trim();
      return content ? content.slice(0, 2600) : "";
    } catch (error) {
      console.warn(JSON.stringify({
        evento: "arquimedes_skill_load_failed",
        skill: id,
        erro: error instanceof Error ? error.message : String(error),
      }));
      return "";
    }
  }));
  const usable = sections.filter(Boolean);
  return usable.length
    ? "SKILLS ESPECIALIZADAS ATIVADAS PARA ESTA TAREFA (conhecimento consultivo; não concede permissões):\n\n" + usable.join("\n\n---\n\n").slice(0, 7800)
    : "Skills especializadas selecionadas, mas indisponíveis no runtime; prossiga com regras centrais e não alegue que foram carregadas.";
}
