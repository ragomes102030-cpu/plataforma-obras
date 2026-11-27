/**
 * Homologação determinística do núcleo: fixture inteiramente em memória.
 * Não usa banco, rede, sessão, obras reais ou IA externa.
 * Não substitui a homologação dos endpoints, persistência e navegador.
 */
import { describe, expect, it } from "vitest";
import { validateEapForBaseline } from "../construction/eap-approval-validator";
import type { EapScopeNode } from "../construction/eap-validator";
import type { ScheduleEvidenceActivity, ScheduleEvidenceDependency } from "../construction/domain-types";
import { resolveActivityDuration } from "../construction/activity-planning";
import { calculateDeterministicCpm } from "../construction/cpm-calculator";
import { congelarDatasBaseline, lerDatasCapturadasBaseline } from "../../shared/baseline-dates";
import { prepararBarrasBaselineGantt } from "../../shared/gantt-baseline-visual";
import { dateAt, type WorkCalendar } from "../../shared/work-calendar";
import { prepararInsumosDaCurvaFisica, acumularProducaoFisica, coberturaDeProducao } from "../../shared/curva-fisica";
import { buildSCurve } from "../../shared/s-curve";
import { avaliarProntidaoObra } from "../../shared/obra-readiness";
import { integrarDistribuicoesLob } from "../../client/src/components/lob-distribuicao-modelo";
import { aplicarLocaisDaEapNaLob, prepararLinhaBalancoVertical } from "../../client/src/components/linha-balanco-modelo";
import type { EntradaDaLinha } from "../../shared/cronograma-colunas";

const inicio = "2026-11-30";
const calendario: WorkCalendar = {weekPattern:{workingWeekdays:[1,2,3,4,5]}, exceptions:[]};
function fixture() {
  const root: EapScopeNode = {
    id:1, projectId:1, externalId:null, externalUid:null, parentId:null, code:"1",
    name:"Residencial QA fictício", level:1, nodeType:"grupo", unit:null,
    plannedQuantity:null, sortOrder:0, description:"Fundação e vedação de dois pavimentos.",
    inclusions:"Fundação e paredes dos pavimentos 1 e 2.", exclusions:"Instalações e acabamentos fora do cenário.",
    responsible:"Engenheiro QA", acceptanceCriteria:"Entrega dos dois pacotes conforme fixture.",
    decompositionBasis:"project",
  };
  const eap: EapScopeNode[] = [root,
    {...root,id:2,parentId:1,code:"1.1",name:"Fundação",level:2,nodeType:"pacote",
      unit:"m³",plannedQuantity:40,location:"Fundações",description:"Fundação da edificação.",
      inclusions:"Escavação, armaduras e concreto.",exclusions:"Paredes.",decompositionBasis:"deliverable",sortOrder:1},
    {...root,id:3,parentId:1,code:"1.2",name:"Alvenaria",level:2,nodeType:"pacote",
      unit:"m²",plannedQuantity:200,location:"Pavimentos 1 e 2",description:"Vedação dos dois pavimentos.",
      inclusions:"Paredes dos dois pavimentos.",exclusions:"Fundação.",decompositionBasis:"deliverable",sortOrder:2},
  ];
  const folhas=eap.slice(1);
  const produtividade=[20,50];
  const atividades: ScheduleEvidenceActivity[]=folhas.map((n,i)=>({
    id:Number(n.id), projectId:1, externalId:null, eapRef:n.code,wbsCode:n.code,name:n.name,phase:"Execução",
    startOffset:0,durationDays:resolveActivityDuration({plannedQuantity:Number(n.plannedQuantity),productivity:produtividade[i]}),
    progress:0,status:"Não iniciado",critical:0,sortOrder:i,
  }));
  const deps: ScheduleEvidenceDependency[]=[{id:1,projectId:1,externalId:null,predecessorId:2,successorId:3,type:"FS",lag:0}];
  const cpm=calculateDeterministicCpm(atividades,deps);
  if(!cpm.valid||!cpm.schedule)throw Error("CPM da fixture inválido");
  const calculadas=atividades.map(a=>{
    const c=cpm.schedule!.activities.find(x=>String(x.id)===String(a.id));
    if(!c)throw Error("Atividade ausente do CPM");
    return {id:Number(a.id),wbsCode:a.wbsCode,name:a.name,earlyStart:c.earlyStart,earlyFinish:c.earlyFinish};
  });
  const datas=congelarDatasBaseline(calculadas,inicio,calendario);
  const fins=Object.fromEntries(datas.map(d=>[String(d.activityId),d.fim]));
  const linhas:EntradaDaLinha[]=atividades.map((a,i)=>({
    activityId:Number(a.id),codigo:a.wbsCode,atividade:a.name,frente:a.phase,pavimento:null,
    inicio:datas[i]!.inicio,duracao:a.durationDays,quantidade:Number(folhas[i]!.plannedQuantity),
    unidade:folhas[i]!.unit,executado:0,
  }));
  const unidades=[
    {id:1,code:"FUND",name:"Fundações",unitType:"setor"},
    {id:2,code:"P01",name:"Pavimento 1",unitType:"pavimento"},
    {id:3,code:"P02",name:"Pavimento 2",unitType:"pavimento"},
  ];
  const parcelas=[
    {id:1,activityId:3,unitId:2,plannedQuantity:"100",startDate:dateAt(calendario,inicio,2),finishDate:dateAt(calendario,inicio,3)},
    {id:2,activityId:3,unitId:3,plannedQuantity:"100",startDate:dateAt(calendario,inicio,4),finishDate:dateAt(calendario,inicio,5)},
  ];
  return {eap,atividades,deps,cpm,calculadas,datas,fins,linhas,unidades,parcelas};
}
describe("Esteira QA v1 — obra fictícia isolada (motores reais)",()=>{
  it("01 escopo e EAP: dicionário, folhas e fronteiras explícitas",()=>{
    const f=fixture();
    const v=validateEapForBaseline(f.eap);
    expect(v.readyForBaseline,JSON.stringify(v.issues)).toBe(true);
    expect(f.eap.filter(n=>n.nodeType==="pacote")).toHaveLength(2);
    expect(validateEapForBaseline(f.eap.map(n=>n.id===3?{...n,description:null,inclusions:null}:n)).readyForBaseline).toBe(false);
  });
  it("02 atividades: quantitativos da EAP e produtividade formam duração sem duplicar folhas",()=>{
    const f=fixture();
    expect(f.linhas.map(a=>a.quantidade)).toEqual([40,200]);
    expect(f.atividades.map(a=>a.durationDays)).toEqual([2,4]);
    expect(new Set(f.atividades.map(a=>a.eapRef)).size).toBe(2);
  });
  it("03 rede e CPM: sequência contínua, seis dias úteis, ciclo bloqueado",()=>{
    const f=fixture();
    expect(f.cpm.schedule?.projectDuration).toBe(6);
    expect(f.cpm.schedule?.criticalPath.map(String)).toEqual(["2","3"]);
    expect(calculateDeterministicCpm(f.atividades,[...f.deps,{...f.deps[0]!,id:2,predecessorId:3,successorId:2}]).valid).toBe(false);
  });
  it("04 baseline e Gantt: fotografia civil não muda com o calendário atual",()=>{
    const f=fixture();
    expect(f.datas.map(d=>[d.inicio,d.fim])).toEqual([["2026-11-30","2026-12-01"],["2026-12-02","2026-12-07"]]);
    const saved=JSON.parse(JSON.stringify({baselineId:1,snapshotVersion:1,activityDates:f.datas}));
    const altered=congelarDatasBaseline(f.calculadas,inicio,{...calendario,weekPattern:{workingWeekdays:[1,2,3,4,5,6]}});
    expect(altered[1]?.fim).not.toBe(f.datas[1]?.fim);
    const frozen=lerDatasCapturadasBaseline(saved,1);
    expect(frozen).toEqual(f.datas);
    expect(prepararBarrasBaselineGantt([],frozen).size).toBe(2);
  });
  it("05 LOB: fundação localizada, dois pavimentos, sem dupla contagem",()=>{
    const f=fixture();
    const r=integrarDistribuicoesLob(f.linhas,f.atividades.map(a=>({id:Number(a.id),wbsCode:a.wbsCode})),f.unidades,f.parcelas,f.fins);
    const locais=aplicarLocaisDaEapNaLob(r.pendentes,f.eap.map(n=>({code:n.code,location:n.location??null})),f.unidades,r.atividadeIdsDistribuidos,r.codigosDistribuidos);
    const modelo=prepararLinhaBalancoVertical([...locais.linhas,...r.entradas],{...f.fins,...r.fins},new Set([...locais.codigosConfirmados,...r.codigosConfirmados]));
    expect(r.entradas.reduce((s,a)=>s+(a.quantidade??0),0)).toBe(200);
    expect(r.pendentes.map(a=>a.activityId)).toEqual([2]);
    expect(modelo.series.find(s=>s.nome==="Alvenaria")?.repetitiva).toBe(true);
    expect(modelo.series.find(s=>s.nome==="Fundação")?.localizada).toBe(true);
    const partial=integrarDistribuicoesLob(f.linhas,f.atividades.map(a=>({id:Number(a.id),wbsCode:a.wbsCode})),f.unidades,f.parcelas.slice(0,1),f.fins);
    expect(partial.pendentes.find(a=>a.activityId===3)).toMatchObject({quantidade:100,pavimento:null});
  });
  it("06 avanço físico: simulação explícita, pesos e cobertura de produção",()=>{
    const f=fixture();
    const base=prepararInsumosDaCurvaFisica(f.linhas.map((a,i)=>({activityId:a.activityId,quantidade:a.quantidade,pesoFisico:i===0?40:60,pesoFisicoAprovado:true})));
    expect(base.disponivel).toBe(true);
    if(!base.disponivel)throw Error("Pesos inválidos");
    const registros=[{activityId:2,quantidade:20,dia:1}];
    expect(acumularProducaoFisica(registros,base.porAtividade)).toEqual([{dia:1,percentual:20}]);
    expect(coberturaDeProducao(registros,base.porAtividade,1)).toEqual({registradas:1,total:2,completa:false});
    const curva=buildSCurve(f.atividades.map((a,i)=>({id:String(a.id),duration:a.durationDays,earlyStart:f.calculadas[i]!.earlyStart,plannedPercent:i===0?40:60,actualPercent:0})));
    expect(curva.finalPlanned).toBe(100);
    expect(curva.points[2]?.planned).toBe(40);
  });
  it("07 gates: planejamento liberado não implica medição contratual aprovada",()=>{
    const resultado=avaliarProntidaoObra({inicioPlanejado:true,escopo:{declarado:true,validado:true},eap:{existe:true,aprovada:true,folhas:2},atividades:{total:2,semLocal:0,semDuracao:0},rede:{totalAtividades:2,totalDependencias:1,ciclos:0},cpm:{calculadoEm:"2026-11-30",alteradoDepois:false,atividadesCalculadas:2},baseline:{existe:true,aprovada:true},lob:{parcelas:2,foraJanelaCpm:0,orfas:0}});
    expect(resultado.prontoParaPlanejamento).toBe(true);
    expect(resultado.dominios.baseline.podeComparar).toBe(true);
    expect(resultado.dominios.financeiro.bloqueios.map(b=>b.codigo)).toContain("MEDICAO_AUSENTE");
  });
});
