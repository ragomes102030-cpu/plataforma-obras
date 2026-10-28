import {describe,it,expect} from "vitest";
import {chaveExecucaoLocalLob,integrarDistribuicoesLob} from "./lob-distribuicao-modelo";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
const parent:EntradaDaLinha={
 codigo:"1.4.3",atividade:"Lajes",frente:"Estrutura",pavimento:"Estrutura",
 inicio:"2026-11-01",duracao:30,quantidade:100,unidade:"m³",executado:25
};
const units=[
 {id:1,code:"TER",name:"Térreo",unitType:"pavimento"},
 {id:2,code:"P1",name:"1º Pavimento",unitType:"pavimento"},
 {id:3,code:"P2",name:"2º Pavimento",unitType:"pavimento"},
 {id:4,code:"P3",name:"3º Pavimento",unitType:"pavimento"},
];
const ids=[{id:10,wbsCode:"1.4.3"}];
const part=(id:number,unitId:number,quantity:number,startDate:string,finishDate:string)=>({
 id,activityId:10,unitId,plannedQuantity:String(quantity),startDate,finishDate,
});
describe("Distribuição multilocal LOB — não duplica quantitativo, CPM ou EAP",()=>{
 it("distribui um pacote único nos quatro pavimentos sem manter barra duplicada",()=>{
   const d=[part(1,1,25,"2026-11-01","2026-11-05"),
     part(2,2,25,"2026-11-06","2026-11-10"),
     part(3,3,25,"2026-11-11","2026-11-15"),
     part(4,4,25,"2026-11-16","2026-11-20")];
   const input=[parent];
   const r=integrarDistribuicoesLob(input,ids,units,d);
   expect(r.entradas).toHaveLength(4);
   expect(r.pendentes).toHaveLength(1);
   expect(r.pendentes[0]?.atividade).toContain("execução sem local");
   expect(r.pendentes[0]?.executado).toBe(25);
   expect(r.pendentes[0]?.quantidade).toBeNull();
   expect(r.codigosConfirmados.size).toBe(4);
   expect(r.somaPorCodigo.get("1.4.3")).toBe(100000);
   expect(r.entradas.map(l=>l.pavimento)).toEqual(["Térreo","1º Pavimento","2º Pavimento","3º Pavimento"]);
   expect(r.entradas.map(l=>l.duracao)).toEqual([5,5,5,5]);
   expect(r.entradas.every(l=>l.executado===0)).toBe(true);
   expect(input[0]).toEqual(parent);
 });
 it("mantém só o saldo NÃO distribuído no mesmo cronograma",()=>{
   const r=integrarDistribuicoesLob([parent],ids,units,[
     part(1,1,25,"2026-11-01","2026-11-05")]);
   expect(r.entradas).toHaveLength(1);
   expect(r.pendentes).toHaveLength(2);
   expect(r.pendentes.find(l=>l.quantidade===75)?.atividade).toContain("saldo sem local");
   expect(parent.quantidade).toBe(100);
 });
 it("mostra execução medida no local e preserva execução sem unidade no saldo",()=>{
   const r=integrarDistribuicoesLob([parent],ids,units,[
     part(1,1,25,"2026-11-01","2026-11-05")],
     new Map([[chaveExecucaoLocalLob("1.4.3",1),10]]));
   expect(r.entradas[0]?.executado).toBe(10);
   expect(r.pendentes).toHaveLength(2);
   const saldo=r.pendentes.find(l=>l.quantidade===75);
   const execucaoSemLocal=r.pendentes.find(l=>l.atividade.includes("execução sem local"));
   expect(saldo?.executado).toBe(0);
   expect(execucaoSemLocal?.executado).toBe(15);
 });
 it("ignora referências órfãs, datas inválidas e quantidade ausente",()=>{
   const r=integrarDistribuicoesLob([parent],ids,units,[
     part(1,404,25,"2026-11-01","2026-11-04"),
     part(2,1,25,"2026-11-31","2026-12-01"),
     part(3,2,0,"2026-11-02","2026-11-03"),
   ]);
   expect(r.entradas).toHaveLength(0);
   expect(r.pendentes).toEqual([parent]);
 });
});
