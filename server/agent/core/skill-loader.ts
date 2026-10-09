import fs from "node:fs/promises";
import path from "node:path";
import type { ArquimedesSkill, ArquimedesSkillMode } from "./types";

const SKILLS_ROOT = path.resolve(process.cwd(), "agent", "skills");

const SKILL_FILES = [
  "planejamento/eap/decomposicao.md",
  "planejamento/eap/regra-100-porcento.md",
  "planejamento/eap/pacotes-de-trabalho.md",
  "planejamento/eap/criterios-de-parada.md",
  "planejamento/eap/validacao.md",
  "planejamento/eap/revisao-engenheiro.md",
  "planejamento/eap/aprendizado-regressao.md",
  "planejamento/eap/quantitativos.md",
  "planejamento/eap/produtividade.md",
  "planejamento/eap/orcamento.md",
  "planejamento/eap/recursos.md",
  "planejamento/planejamento-geral.md",
  "planejamento/arquitetura-planejamento.md",
  "planejamento/auditoria-planejamento.md",
  "planejamento/visualizacao-planejamento.md",
] as const;

function skillMode(relativePath: string): ArquimedesSkillMode {
  if (relativePath.endsWith("aprendizado-regressao.md")) return "independente";
  if (relativePath.endsWith("arquitetura-planejamento.md")) return "independente";
  return "hibrida";
}

function skillMcpDependencies(relativePath: string): string[] {
  if (relativePath.endsWith("revisao-engenheiro.md")) return ["eap"];
  if (relativePath.endsWith("planejamento-geral.md")) return ["eap", "cronograma"];
  if (relativePath.endsWith("auditoria-planejamento.md")) return ["eap", "cronograma"];
  if (relativePath.endsWith("quantitativos.md")) return ["eap"];
  if (relativePath.endsWith("orcamento.md")) return ["eap"];
  if (relativePath.endsWith("produtividade.md")) return ["eap", "cronograma"];
  if (relativePath.endsWith("recursos.md")) return ["eap", "cronograma"];
  return [];
}

export async function loadEapSkills(): Promise<ArquimedesSkill[]> {
  return Promise.all(SKILL_FILES.map(async (relativePath) => ({
    id: relativePath.replace(/\.md$/, "").replaceAll("/", "."),
    version: "1.0.0",
    domain: relativePath.includes("/eap/") ? "planejamento.eap" : "planejamento",
    purpose: "Conhecimento profissional versionado do Arquimedes.",
    content: await fs.readFile(path.join(SKILLS_ROOT, relativePath), "utf8"),
    mode: skillMode(relativePath),
    mcpDependencies: skillMcpDependencies(relativePath),
  })));
}
