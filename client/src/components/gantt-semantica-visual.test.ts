import {describe,expect,it} from "vitest";
import fs from "node:fs";
import path from "node:path";

const raiz=process.cwd();
const componente=fs.readFileSync(path.join(raiz,"client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
const css=fs.readFileSync(path.join(raiz,"client/src/planilha.css"),"utf8");

describe("semântica visual operacional do Gantt",()=>{
  it("rotula hoje e início, sem criar marcador duplicado",()=>{
    expect(componente).toContain("pg-hoje-rotulo");
    expect(componente).toContain("pg-inicio-rotulo");
    expect(componente).toContain("inicioObra !== hoje");
    expect(css).toMatch(/\.pg-hoje-linha\s*\{[^}]*background:/s);
    expect(css).not.toMatch(/\.pg-inicio-obra\s*\{[^}]*dashed/s);
  });
  it("usa tokens, padrão de baseline e estados além da cor",()=>{
    for(const token of ["--gantt-planned","--gantt-critical","--gantt-actual","--gantt-baseline","--gantt-warning","--gantt-milestone"])
      expect(css).toContain(token);
    expect(css).toMatch(/\.pg-baseline-barra[^}]*repeating-linear-gradient/s);
    expect(componente).toContain("Caminho crítico");
    expect(componente).toContain("relacionada");
  });
});
