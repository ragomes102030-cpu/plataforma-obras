import { describe,expect,it } from "vitest";
import type { LinhaDesvio } from "./desvios-baseline";
import { prepararBarrasBaselineGantt } from "./gantt-baseline-visual";
import type { WorkCalendar } from "./work-calendar";

const calendario:WorkCalendar={weekPattern:{workingWeekdays:[1,2,3,4,5]},exceptions:[]};
const atividade=(codigo:string,inicio:number|null,fim:number|null,delta:number|null=0):LinhaDesvio=>({
  chave:codigo,atividadeId:1,wbsCode:codigo,nome:"Serviço "+codigo,
  situacao:delta===null?"nova":delta>0?"atrasada":delta<0?"adiantada":"igual",
  baselineInicio:inicio,baselineFim:fim,
  atualInicio:0,atualFim:2,deltaInicio:0,deltaFim:delta,
});
describe("Gantt — baseline sobreposta ao calendário",()=>{
  it("converte índices CPM úteis em dias civis, com término exclusivo",()=>{
    const r=prepararBarrasBaselineGantt([
      atividade("1.1",0,2,2),atividade("1.2",1,4,-1)
    ],"2026-10-23",calendario); // 23/10 é sexta-feira
    expect(r.get("1.1")).toMatchObject({
      inicio:"2026-10-23",fim:"2026-10-26",deltaFim:2
    });
    expect(r.get("1.2")).toMatchObject({
      inicio:"2026-10-26",fim:"2026-10-28",deltaFim:-1
    });
  });
  it("aceita marco de índice único e não transforma 0 em ausência",()=>{
    const r=prepararBarrasBaselineGantt([atividade("A",0,0,0)],"2026-10-23",calendario);
    expect(r.get("A")).toMatchObject({inicio:"2026-10-23",fim:"2026-10-23",deltaFim:0});
  });
  it("não inventa datas para escopo novo, índices inválidos ou sem código",()=>{
    const semCodigo={...atividade("x",0,1),wbsCode:null};
    const r=prepararBarrasBaselineGantt([
      atividade("novo",null,null,null),
      atividade("invalido",5,3),atividade("negativo",-1,3),semCodigo,
      atividade("ok",1,2),
    ],"2026-10-23",calendario);
    expect([...r.keys()]).toEqual(["ok"]);
    expect(prepararBarrasBaselineGantt([atividade("ok",1,2)],"invalida",calendario).size).toBe(0);
  });
  it("respeita exceções do calendário real",()=>{
    const personalizado:WorkCalendar={
      weekPattern:calendario.weekPattern,
      exceptions:[{date:"2026-10-26",type:"national_holiday"}],
    };
    const r=prepararBarrasBaselineGantt([atividade("1.1",0,2)],"2026-10-23",personalizado);
    expect(r.get("1.1")?.fim).toBe("2026-10-27");
  });
});
