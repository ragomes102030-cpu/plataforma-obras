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

const EMBEDDED_EAP_FALLBACK = [
  "Construa a EAP a partir do escopo e dos entregáveis registrados. A EAP deve cobrir 100% do escopo incluído, sem duplicar trabalho entre irmãos; critérios lexicais são indícios, não prova de sobreposição.",
  "Preserve a hierarquia atual e os códigos existentes. Prefira corrigir inclusões, exclusões e critérios de aceitação quando isso bastar; não mova, remova ou crie nós para esconder alertas.",
  "Não invente lote, dimensões, quantidades, solução técnica, materiais, responsáveis reais, aprovações ou requisitos contratuais. Registre como pendência toda decisão que dependa de informação ausente.",
  "Diferencie fato do banco, inferência técnica e informação pendente. Proponha somente alterações concretas sustentadas pelos dados; não afirme que foram aplicadas até confirmação de persistência.",
  "Uma proposta deve ser validada contra a versão de trabalho vigente e aplicada como rascunho por ação explícita do engenheiro. Nunca aprove a EAP nem crie baseline automaticamente.",
  "Use somente ferramentas internas disponíveis. MCP externo é complementar e não é pré-requisito para analisar ou propor uma revisão.",
].join("\n");

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
  const loaded: Array<ArquimedesSkill | null> = await Promise.all(SKILL_FILES.map(async relativePath => {
    try {
      return {
        id: relativePath.replace(/\.md$/, "").replaceAll("/", "."),
        version: "1.0.0",
        domain: relativePath.includes("/eap/") ? "planejamento.eap" : "planejamento",
        purpose: "Conhecimento profissional versionado do Arquimedes.",
        content: await fs.readFile(path.join(SKILLS_ROOT, relativePath), "utf8"),
        mode: skillMode(relativePath),
        mcpDependencies: skillMcpDependencies(relativePath),
      } satisfies ArquimedesSkill;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
  }));

  const available = loaded.filter((skill): skill is ArquimedesSkill => skill !== null);
  if (available.length === SKILL_FILES.length) return available;

  // Deploys que não incluem os arquivos markdown ainda devem conseguir operar.
  // Um fallback compacto preserva as regras essenciais sem repetir o mesmo
  // conteúdo quinze vezes no contexto do modelo.
  return [...available, {
    id: "planejamento.eap.base_embutida",
    version: "1.0.0",
    domain: "planejamento.eap",
    purpose: "Regras essenciais embutidas para operação sem arquivos de skills locais.",
    content: EMBEDDED_EAP_FALLBACK,
    mode: "hibrida",
    mcpDependencies: [],
  }];
}
