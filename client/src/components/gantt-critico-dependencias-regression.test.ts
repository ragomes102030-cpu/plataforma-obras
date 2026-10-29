import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("Regressão Gantt — Crítico e ligações",()=>{
 const view=readFileSync(resolve("client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
 const css=readFileSync(resolve("client/src/planilha.css"),"utf8");
 it("não permite que CPM inválido apague todas as atividades",()=>{
   expect(view).toContain("const podeFiltrarCritico = cpmValido && totalCriticas > 0;");
   expect(view).toContain("const soCriticoAtivo = soCritico && podeFiltrarCritico;");
   expect(view).toContain("disabled={!podeFiltrarCritico}");
   expect(view).toContain("linhasCriticasVisiveisGantt(arvore)");
   expect(view).toContain("CPM ausente, incompleto ou desatualizado");
 });
 it("usa mesmo mapa filtrado nas barras, ligações e altura do SVG",()=>{
   expect(view).toContain("gerarSetasVisiveisGantt(dependencias, geometria, codigosCriticos)");
   expect(view).toContain("filtradas.forEach((no, indice)");
   expect(view).toContain("const deslocamentoBaseline = baselinePronta");
   expect(view).toContain("height={Math.max(1, filtradas.length * alturaLinha)}");
   expect(view).toContain('data-testid="gantt-dependency-path"');
 });
 it("mantém atividades de exemplo fora da visão operacional do Gantt",()=>{
   expect(view).toContain("selectOperationalScheduleRows(linhas, codigosDeExemploOperacionais)");
   expect(view).toContain("<Gantt linhas={linhasGantt}");
   expect(view).toContain("dependencias={dependenciasGantt}");
   expect(view).toContain("atividades de exemplo ficam fora do Gantt, dos indicadores e do CPM");
 });
 it("camada de ligações supera fundos das linhas, sem alterar barra ou EAP",()=>{
   expect(css).toContain(".pg-corpo > .pg-setas:not(.pg-avancos){z-index:4");
   expect(css).toContain(".pg-linha {");
   expect(css).toContain(".pg-barra {");
 });
});
