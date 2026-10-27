import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A interface clássica é única: ela incorpora a LOB vertical com datas reais.
 * Não ressuscitar o gráfico legado que usava disciplinas como locais físicos.
 */
describe("Linha de Balanço — regressão da interface clássica", () => {
  const view = fs.readFileSync(
    path.resolve(process.cwd(), "client/src/components/VisualizacaoPlanejamento.tsx"), "utf8"
  );
  const component = fs.readFileSync(
    path.resolve(process.cwd(), "client/src/components/AuroraLinhaBalanco.tsx"), "utf8"
  );
  const model = fs.readFileSync(
    path.resolve(process.cwd(), "client/src/components/linha-balanco-modelo.ts"), "utf8"
  );

  it("usa somente a LOB vertical no cronograma clássico", () => {
    expect(view).toContain("<LinhaBalancoVertical");
    expect(view).not.toContain("function LinhaDeBalanco");
    expect(view).toContain("finsCalculados={finsCalculados}");
    expect(component).toContain("tempo vertical e locais horizontais");
    expect(component).toContain("const yData =");
    expect(component).toContain("const xLocal =");
  });

  it("exibe ritmo real por serviço e pavimento, com filtro manual", () => {
    expect(component).toContain("seriesRitmoVisiveis.map");
    expect(component).toContain("locaisDoGrafico.map");
    expect(component).toContain("Mostrar todas as frentes");
    expect(component).toContain("<polyline");
    expect(component).toContain("onAbrirAtividades");
  });

  it("não substitui pavimento por disciplina nem inventa término calculado", () => {
    expect(model).toContain("const local = String(l.pavimento");
    expect(model).not.toContain("l.pavimento || l.frente");
    expect(model).toContain("finsCalculados[l.codigo]");
    expect(component).not.toContain("const pxPerDay =");
  });
});
