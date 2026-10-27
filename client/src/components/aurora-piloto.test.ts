import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import {prepararLinhaBalancoVertical} from "./AuroraLinhaBalanco";
import {usarLayoutProfissional} from "../modules/layout-planejamento";

const linha=(codigo:string,atividade:string,pavimento:string|null,frente:string):EntradaDaLinha=>({
 codigo,atividade,pavimento,frente,inicio:"2026-11-03",duracao:10,
 quantidade:80,unidade:"m²",executado:27,marco:false
});

describe("Gantt e LOB de todas as obras: dados e operação manual",()=>{
 it("não inventa término nem percentuais: utiliza os finais oficiais recebidos",()=>{
  const l=[linha("1.1","Alvenaria","P01","Torre"),linha("1.2","Alvenaria","P02","Torre")];
  const r=prepararLinhaBalancoVertical(l,{"1.1":"2026-11-18","1.2":"2026-12-08"});
  expect(r.locais).toEqual(["P01","P02"]);
  expect(r.series).toHaveLength(1);
  expect(r.series[0]!.pontos.map(p=>p.fim)).toEqual(["2026-11-18","2026-12-08"]);
  expect(r.series[0]!.pontos[0]!.executado).toBe(27);
  expect(r.series[0]!.pontos[0]!.quantidade).toBe(80);
  expect(r.series[0]!.pontos[0]!.unidade).toBe("m²");
 });
 it("não cria locais sintéticos nem séries quando faltam dados suficientes",()=>{
  const a=linha("1.1","Alvenaria",null,"");
  const b=linha("1.2","Alvenaria","P01","");
  const c=linha("1.3","Fundação","P02","");
  c.marco=true;
  const r=prepararLinhaBalancoVertical([a,b,c],{"1.1":"2026-11-18","1.2":"2026-12-08","1.3":"2026-12-05"});
  expect(r.semLocal).toBe(1);
  expect(r.locais).toEqual(["P01"]);
  expect(r.series.flatMap(s=>s.pontos.map(p=>p.codigo))).toEqual(["1.2"]);
  expect(prepararLinhaBalancoVertical([b],{}).series).toHaveLength(0);
 });
 it("usa apenas a interface clássica e mantém a LOB escadinha integrada",()=>{
  expect(usarLayoutProfissional("")).toBe(false);
  expect(usarLayoutProfissional("?layout=aurora")).toBe(false);
  expect(usarLayoutProfissional("?layout=classico")).toBe(false);
  expect(usarLayoutProfissional("?layout=profissional")).toBe(false);
  const home=readFileSync(path.resolve(process.cwd(),"client/src/pages/Home.tsx"),"utf8");
  const view=readFileSync(path.resolve(process.cwd(),"client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
  expect(home).toContain("const layoutProfissional = usarLayoutProfissional()");
  expect(home).not.toContain("Ver layout profissional");
  expect(home).not.toContain("Ver visual clássico");
  expect(home).toContain('layoutProfissional={layoutProfissional}');
  expect(view).toContain("<LinhaBalancoEscadinha");
  expect(view).not.toContain("function LinhaDeBalanco");
  expect(view).toContain('aba:"atividades"');
  expect(view).toContain("function Gantt");
 });

});
