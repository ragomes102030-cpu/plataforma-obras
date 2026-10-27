import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Linha de Balanço — única escadinha da interface clássica", () => {
  const view=fs.readFileSync(path.resolve(process.cwd(),"client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
  const component=fs.readFileSync(path.resolve(process.cwd(),"client/src/components/AuroraLinhaBalanco.tsx"),"utf8");
  const model=fs.readFileSync(path.resolve(process.cwd(),"client/src/components/linha-balanco-modelo.ts"),"utf8");

  it("usa datas na horizontal e pavimentos na vertical em uma única tela",()=>{
    expect(view).toContain("<LinhaBalancoEscadinha");
    expect(view).not.toContain("function LinhaDeBalanco");
    expect(view).toContain("finsCalculados={finsCalculados}");
    expect(component).toContain("lob-stairs-months");
    expect(component).toContain("lob-stairs-weeks");
    expect(component).toContain("lob-stairs-row");
    expect(component).toContain("lob-stairs-bar");
  });

  it("permite filtros e controle de calendário sem alterar planejamento",()=>{
    expect(component).toContain("seriesVisiveis");
    expect(component).toContain("locaisValidos");
    expect(component).toContain("Zoom do calendário");
    expect(component).toContain("Filtrar pavimento");
    expect(component).toContain("Período dos serviços");
    expect(component).toContain("Exportar CSV");
    expect(component).toContain("onAbrirAtividades");
  });

  it("usa pavimento físico e término oficial; sem série falsa",()=>{
    expect(model).toContain("const local = String(l.pavimento");
    expect(model).not.toContain("l.pavimento || l.frente");
    expect(model).toContain("finsCalculados[l.codigo]");
    expect(component).toContain("repetitivas.length === 0");
    expect(component).not.toContain("export function LinhaBalancoVertical");
  });
});
