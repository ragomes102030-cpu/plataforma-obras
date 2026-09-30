import fs from "node:fs/promises";
import path from "node:path";
import type { ArquimedesSkill } from "./types";

const SKILLS_ROOT = path.resolve(process.cwd(), "agent", "skills");

const SKILL_FILES = [
  "planejamento/eap/decomposicao.md",
  "planejamento/eap/regra-100-porcento.md",
  "planejamento/eap/pacotes-de-trabalho.md",
  "planejamento/eap/criterios-de-parada.md",
  "planejamento/eap/validacao.md",
] as const;

export async function loadEapSkills(): Promise<ArquimedesSkill[]> {
  return Promise.all(SKILL_FILES.map(async (relativePath) => ({
    id: relativePath.replace(/\.md$/, "").replaceAll("/", "."),
    version: "1.0.0",
    domain: "planejamento.eap",
    purpose: "Conhecimento profissional versionado do Arquimedes.",
    content: await fs.readFile(path.join(SKILLS_ROOT, relativePath), "utf8"),
  })));
}
