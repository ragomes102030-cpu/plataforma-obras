import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import {LobDistribuicaoPainel} from "./LobDistribuicaoPainel";
const linha=(id:number,nome:string,q:number):EntradaDaLinha=>({
 activityId:id,codigo:"1.2",atividade:nome,frente:"Estrutura",pavimento:null,
 inicio:"2026-11-01",duracao:10,quantidade:q,unidade:"m²",executado:0,
});
describe("Distribuição LOB — interface identifica atividades por ID",()=>{
 it("mantém dois serviços do mesmo código com seus nomes e quantitativos independentes",()=>{
   const html=renderToStaticMarkup(createElement(LobDistribuicaoPainel,{
     atividades:[{id:10,wbsCode:"1.2"},{id:11,wbsCode:"1.2"},{id:12,wbsCode:"1.2"}],
     linhas:[linha(10,"Serviço A",100),linha(11,"Serviço B",200)],
     finsCalculados:{"10":"2026-11-10","11":"2026-11-10"},
     unidades:[{id:1,code:"P01",name:"Pavimento 01",unitType:"pavimento"},
       {id:2,code:"QA",name:"Setor didático",unitType:"setor"}],
     distribuicoes:[{id:1,activityId:10,unitId:1,plannedQuantity:"25",startDate:"2026-11-01",finishDate:"2026-11-05"}],
     editavel:true,salvando:false,onSalvar:()=>{},onRemover:()=>{},
   }));
   expect(html).toContain('value="10">1.2 · Serviço A');
   expect(html).toContain('value="11">1.2 · Serviço B');
   expect(html).not.toContain('value="12"');
   expect(html).not.toContain('Setor didático');
   expect(html).toContain("25 / 100");
   expect(html).toContain("0 / 200");
 });
});
