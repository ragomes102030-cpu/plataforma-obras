import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gerarSvgGantt } from "./gantt-export-svg";

const tela=readFileSync(resolve("client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
const lob=readFileSync(resolve("client/src/components/AuroraLinhaBalanco.tsx"),"utf8");
const estilo=readFileSync(resolve("client/src/planilha.css"),"utf8");

describe("Padrão visual permanente: Gantt MS Project / Primavera e LOB escadinha",()=>{
  it("Gantt mostra o serviço na barra e mantém as ligações habilitadas",()=>{
    expect(tela).toContain("data-testid=\"gantt-bar-service-label\"");
    expect(tela).toContain("{no.nome}");
    expect(tela).toContain("larguraBarra < 106");
    expect(tela).toContain("const [mostrarSetas, setMostrarSetas] = useState(true);");
    expect(tela).toContain('data-testid="gantt-dependency-path"');
    expect(estilo).toContain(".pg-barra-nome");
  });
  it("LOB mantém vínculos reais visíveis e nomes completos para degraus",()=>{
    expect(lob).toContain("const [mostrarVinculos, setMostrarVinculos] = useState(true);");
    expect(lob).toContain("const nomeCurto = b.serie.nome;");
    expect(lob).toContain('data-testid="lob-dependency-path"');
    expect(lob).toContain('data-testid="lob-step-bar"');
    expect(lob).toContain("calcularVinculosExibidos(dependencias");
  });
  it("SVG exportado inclui nome do serviço e ligação ortogonal com seta",()=>{
    const svg=gerarSvgGantt({
      titulo:"QA HORIZONTE", inicio:"2026-11-09", totalDias:40, pxDia:10, hoje:"2026-11-09",
      linhas:[
        {activityId:1,codigo:"1.1",nome:"Estrutura do pavimento",inicio:"2026-11-09",fim:"2026-11-20",duracao:10,progresso:0,critica:true,marco:false,resumo:false,profundidade:2},
        {activityId:2,codigo:"1.2",nome:"Alvenaria do pavimento",inicio:"2026-11-23",fim:"2026-12-04",duracao:10,progresso:0,critica:true,marco:false,resumo:false,profundidade:2},
      ],
      vinculos:[{de:"1",para:"2",tipo:"FS"}],
    });
    expect(svg).toContain('data-gantt-service-label="true"');
    expect(svg).toContain("Estrutura do pavimento");
    expect(svg).toContain("Alvenaria do pavimento");
    expect(svg).toContain('marker-end="url(#gantt-export-arrow)"');
    expect(svg).toContain('stroke="#a9362a"');
  });
});
