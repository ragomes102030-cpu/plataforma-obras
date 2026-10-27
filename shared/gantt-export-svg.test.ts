import { describe,expect,it } from "vitest";
import { gerarSvgGantt } from "./gantt-export-svg";
const entrada = {
 titulo:"AURORA & TESTE <QA>",inicio:"2026-10-01",totalDias:45,pxDia:7,hoje:"2026-10-27",
 linhas:[
  {codigo:"1",nome:"Estrutura <concreto>",inicio:"2026-10-02",fim:"2026-10-30",duracao:18,progresso:25,critica:false,marco:false,resumo:true,profundidade:0},
  {codigo:"1.1",nome:"Vigas & pilares",inicio:"2026-10-23",fim:"2026-10-29",duracao:3,progresso:40,critica:true,marco:false,resumo:false,profundidade:1},
  {codigo:"2.1",nome:"Entrega",inicio:"2026-11-03",fim:"2026-11-03",duracao:1,progresso:0,critica:false,marco:true,resumo:false,profundidade:1},
 ],
 vinculos:[{de:"1.1",para:"2.1",tipo:"FS"}],
};
describe("SVG exportado do Gantt",()=>{
 it("inclui EAP e atividades, barras, progressos, marcos, calendários e ligações",()=>{
   const svg=gerarSvgGantt(entrada);
   expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
   expect(svg).toContain("AURORA &amp; TESTE &lt;QA&gt;");
   expect(svg).toContain("Estrutura &lt;concreto&gt;");
   expect(svg).toContain("Vigas &amp; pilares");
   expect(svg).toContain("Entrega");
   expect(svg).toContain("<polygon");
   expect(svg).toContain('<rect x="');
   expect(svg).toContain('<path d="M ');
   expect(svg).toContain('40%');
   expect(svg).toContain("out");
   expect(svg).toContain("nov");
   expect(svg).not.toContain("<QA>");
 });
 it("não exporta ligações de atividades ocultas pela filtragem",()=>{
   const svg=gerarSvgGantt({...entrada,linhas:[entrada.linhas[1]!]});
   expect(svg).not.toContain("Entrega");
   expect(svg).toContain("Vigas");
   expect(svg).not.toContain('<circle cx="');
 });
});
