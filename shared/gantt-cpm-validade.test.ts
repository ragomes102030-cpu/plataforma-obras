import { describe,expect,it } from "vitest";
import { avaliarCpmGantt } from "./gantt-cpm-validade";
const a=(v:{durationDays?:number;cpmCalculatedAt?:string|null;updatedAt?:string}={})=>({
 durationDays:v.durationDays??4,
 cpmCalculatedAt:v.cpmCalculatedAt===undefined?"2026-10-27T12:30:00Z":v.cpmCalculatedAt,
 updatedAt:v.updatedAt??"2026-10-27T12:00:00Z",
});
describe("CPM no Gantt — gate de toda a rede",()=>{
 it("não considera vazio, parcial ou duração inválida como CPM válido",()=>{
   expect(avaliarCpmGantt([]).valido).toBe(false);
   expect(avaliarCpmGantt([a(),a({cpmCalculatedAt:null})])).toMatchObject({
     valido:false,semCalculo:1,total:2,
   });
   expect(avaliarCpmGantt([a({durationDays:0})]).duracoesInvalidas).toBe(1);
 });
 it("reprova atualização posterior em qualquer atividade",()=>{
   expect(avaliarCpmGantt([a(),a({updatedAt:"2026-10-27T13:00:00Z"})])).toMatchObject({
     valido:false,desatualizadas:1,
   });
 });
 it("valida quando todas têm CPM íntegro e vigente",()=>{
   expect(avaliarCpmGantt([a(),a()]).valido).toBe(true);
 });
});
