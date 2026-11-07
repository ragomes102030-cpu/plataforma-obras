import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { LinhaBalancoEscadinha } from "./AuroraLinhaBalanco";

const lines: EntradaDaLinha[] = [
  { activityId:10, codigo:"1.4.1", atividade:"Pilares",
    frente:"Estrutura", pavimento:null, inicio:"2027-01-01", duracao:28,
    quantidade:200, unidade:"m³", executado:0, marco:false },
  { activityId:11, codigo:"1.5.1", atividade:"Alvenaria",
    frente:"Vedações", pavimento:null, inicio:"2027-02-01", duracao:28,
    quantidade:200, unidade:"m²", executado:0, marco:false },
];
const units=[
  {id:1,code:"P01",name:"1º Pavimento",unitType:"pavimento"},
  {id:2,code:"P02",name:"2º Pavimento",unitType:"pavimento"},
];
const distributions=[
  {id:1,activityId:10,unitId:1,plannedQuantity:"100",startDate:"2027-01-01",finishDate:"2027-01-05"},
  {id:2,activityId:10,unitId:2,plannedQuantity:"100",startDate:"2027-01-06",finishDate:"2027-01-10"},
  {id:3,activityId:11,unitId:1,plannedQuantity:"100",startDate:"2027-01-06",finishDate:"2027-01-09"},
  {id:4,activityId:11,unitId:2,plannedQuantity:"100",startDate:"2027-01-11",finishDate:"2027-01-14"},
];
const render = (deps=[{de:10,para:11,tipo:"FS",lag:0}]) =>
  renderToStaticMarkup(createElement(LinhaBalancoEscadinha,{
    linhas:lines, finsCalculados:{"10":"2027-01-28","11":"2027-02-28"},
    unidades:units,distribuicoes:distributions,
    atividadeIds:lines.map(l=>({id:l.activityId!,wbsCode:l.codigo})),
    dependenciasIds:deps, estadoVinculos:"pronto",
    hoje:"2027-01-03",inicioObra:"2027-01-01",onAbrirAtividades:()=>{},
  }));

describe("LOB parcelada — renderização real do Excel aprovado",()=>{
  it("mostra todos os segmentos, suas datas locais e dois vínculos por pavimento",()=>{
    const html=render();
    expect((html.match(/data-testid="lob-step-bar"/g)??[])).toHaveLength(4);
    expect((html.match(/data-testid="lob-dependency-path"/g)??[])).toHaveLength(2);
    expect((html.match(/data-testid="lob-service-flow"/g)??[])).toHaveLength(2);
    expect(html).toContain('data-testid="lob-show-service-flow"');
    expect(html).toContain("traçado de repetição, não vínculo CPM");
    expect(html).toContain("01/01/2027 a 05/01/2027");
    expect(html).toContain("06/01/2027 a 10/01/2027");
    expect(html).toContain("06/01/2027 a 09/01/2027");
    expect(html).not.toContain("01/01/2027 a 28/01/2027");
    expect(html).toContain("Mostrar vínculos (2)");
    expect(html).toContain('data-testid="lob-link-coverage"');
    expect(html).toContain("1/1 predecessoras representadas");
    expect(html).not.toContain("lob-segmento-10-1</span>");
    expect(html).toContain("1º Pavimento");
    expect(html).toContain("2º Pavimento");
  });
  it("não vincula atividade de fora da população aprovada",()=>{
    const html=render([{de:10,para:98,tipo:"FS",lag:0}]);
    expect(html).not.toContain('data-testid="lob-dependency-path"');
    expect(html).not.toContain("Mostrar vínculos (1)");
    expect(html).not.toContain("1 sem representação neste filtro");
  });
});
