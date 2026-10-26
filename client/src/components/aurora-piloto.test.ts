import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import {prepararLinhaBalancoAurora} from "./AuroraLinhaBalanco";

const linha=(codigo:string,atividade:string,pavimento:string|null,frente:string):EntradaDaLinha=>({
 codigo,atividade,pavimento,frente,inicio:"2026-11-03",duracao:10,
 quantidade:80,unidade:"m²",executado:27,marco:false
});

describe("piloto visual AURORA TESTE: integridade de dados e operação manual",()=>{
 it("não inventa término nem percentuais: utiliza os finais oficiais recebidos",()=>{
  const l=[linha("1.1","Alvenaria","P01","Torre"),linha("1.2","Alvenaria","P02","Torre")];
  const r=prepararLinhaBalancoAurora(l,{"1.1":"2026-11-18","1.2":"2026-12-08"});
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
  const r=prepararLinhaBalancoAurora([a,b,c],{"1.1":"2026-11-18","1.2":"2026-12-08","1.3":"2026-12-05"});
  expect(r.semLocal).toBe(1);
  expect(r.locais).toEqual(["P01"]);
  expect(r.series.flatMap(s=>s.pontos.map(p=>p.codigo))).toEqual(["1.2"]);
  expect(prepararLinhaBalancoAurora([b],{}).series).toHaveLength(0);
 });
 it("mantém opt-in exclusivamente para AURORA TESTE e permite voltar à UI clássica",()=>{
  const home=readFileSync(path.resolve(process.cwd(),"client/src/pages/Home.tsx"),"utf8");
  const view=readFileSync(path.resolve(process.cwd(),"client/src/components/VisualizacaoPlanejamento.tsx"),"utf8");
  expect(home).toContain('obra?.code === "OB-PUPOCN"');
  expect(home).toContain('get("layout") === "aurora"');
  expect(home).toContain('url.searchParams.delete("layout")');
  expect(view).toContain('pilotoAurora ? (');
  expect(view).toContain("<AuroraLinhaBalanco");
  expect(view).toContain('aba:"atividades"');
  expect(view).toContain("function LinhaDeBalanco");
  expect(view).toContain("function Gantt");
 });
});
