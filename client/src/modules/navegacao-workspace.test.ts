import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ABAS } from "./abas";
import { VISTAS_DO_WORKSPACE, pertenceAoWorkspace } from "./navegacao-workspace";

describe("workspace manual do planejamento", () => {
  it("navega entre oito módulos reais, não entre demos ou telas fictícias", () => {
    expect(VISTAS_DO_WORKSPACE.map(item => item.aba)).toEqual([
      "escopo", "eap", "atividades", "dependencias",
      "cpm", "baseline", "gantt", "linha-balanco",
    ]);
    const ids = ABAS.filter(item => item.status === "pronta").map(item => item.id);
    for (const item of VISTAS_DO_WORKSPACE) expect(ids).toContain(item.aba);
    expect(new Set(VISTAS_DO_WORKSPACE.map(item => item.aba)).size).toBe(8);
  });

  it("o workspace não engole as telas administrativas ou de outras áreas", () => {
    expect(pertenceAoWorkspace("eap")).toBe(true);
    expect(pertenceAoWorkspace("gantt")).toBe(true);
    expect(pertenceAoWorkspace("linha-balanco")).toBe(true);
    for (const aba of ["dashboard", "comando", "catalogo", "producao", "financeiro", "suprimentos"]) {
      expect(pertenceAoWorkspace(aba)).toBe(false);
    }
  });

  it("a navegação fica na aplicação real e somente chama a troca manual de aba", () => {
    const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(home).toContain('aria-label="Módulos do planejamento"');
    expect(home).toContain('onClick={() => irParaAba(destino)}');
    expect(home).toContain('aria-current={aba === destino ? "page" : undefined}');
    expect(home).toContain("VISTAS_DO_WORKSPACE.map");
    expect(home).toContain('className={`arquimedes-content${emWorkspacePlanejamento ? " planejamento-area" : ""}`}');
    expect(home).toContain("<PainelPlanejamento projetoId={projetoId} />");
    expect(home).toContain("<AbaEap projetoId={projetoId} tipoDeObra={tipoDeObra} />");
    expect(home).toContain('<VisualizacaoPlanejamento projetoId={projetoId}');
  });

  it("as melhorias de CSS estão confinadas ao workspace e preservam controles", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/workspace-planejamento.css"), "utf8");
    expect(css).toContain(".planejamento-workspace-nav");
    expect(css).toContain(".planejamento-area .eap-workspace-grid");
    expect(css).toContain(".planejamento-area .pl-atividades-table-wrap");
    expect(css).toContain(".planejamento-area .planejamento-profissional");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media(max-width:580px)");
  });
});
