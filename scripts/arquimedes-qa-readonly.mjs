// Auditoria QA: nenhuma escrita no banco; cenário apenas no relatório.
import pg from "pg";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
const projectId=Number(process.env.QA_PROJECT_ID);
const position=process.env.QA_POSITION_DATE;
const percent=Number(process.env.QA_SCENARIO_PERCENT ?? 50);
const targetId=Number(process.env.QA_ACTIVITY_ID);
const output=process.env.QA_REPORT_PATH || "qa-results/audit.json";
if(!Number.isSafeInteger(projectId)||projectId<=0||!position||!/^\d{4}-\d{2}-\d{2}$/.test(position)||!Number.isFinite(percent)||percent<0||percent>100) throw new Error("Informe QA_PROJECT_ID, QA_POSITION_DATE e percentual válido");
if(!process.env.QA_READONLY_DATABASE_URL) throw new Error("Configure credencial exclusiva de leitura QA_READONLY_DATABASE_URL");
const db=new pg.Client({connectionString:process.env.QA_READONLY_DATABASE_URL,connectionTimeoutMillis:15000,statement_timeout:30000});
const report={projectId,position,checks:[],next:"identificar obra",startedAt:new Date().toISOString()};
async function save(){await mkdir(dirname(output),{recursive:true});await writeFile(output+".tmp",JSON.stringify(report,null,2)+"\n");await rename(output+".tmp",output);}
async function check(name,pass,evidence,next){report.checks.push({name,status:pass?"pass":"fail",evidence});report.next=next;await save();}
let connected=false;
try{
 await save();await db.connect();connected=true;
 await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const [project]=await q('select id,code,name,progress from projects where id=$1 and "deletedAt" is null',[projectId]);
 if(!project)throw new Error("Obra inexistente");report.project=project;
 const versions=await q(`select id,"versionNumber" from project_plan_versions where "projectId"=$1 and status='approved'`,[projectId]);
 await check("versao_aprovada",versions.length===1,versions,"baseline");
 if(versions.length!==1)throw new Error("Versão ambígua");
 const version=versions[0].id;
 const baselines=await q(`select id,"versionId" from schedule_baselines where "projectId"=$1 and status='ativa'`,[projectId]);
 await check("baseline_unica",baselines.length===1&&baselines[0].versionId===version,baselines,"pesos");
 if(baselines.length!==1||baselines[0].versionId!==version)throw new Error("Baseline incompatível");
 const acts=await q('select id,name,"physicalWeight","physicalWeightApprovedAt","plannedQuantity",unit,progress,"earlyStart","earlyFinish","durationDays" from schedule_activities where "projectId"=$1 and "versionId"=$2',[projectId,version]);
 const sum=acts.reduce((s,a)=>s+Number(a.physicalWeight),0);
 await check("pesos_aprovados",acts.length>0&&acts.every(a=>a.physicalWeight!==null&&Number(a.physicalWeight)>=0&&a.physicalWeightApprovedAt)&&Math.abs(sum-100)<0.0001,{count:acts.length,sum},"comparar baseline");
 const items=await q('select "activityId","earlyStart","earlyFinish","durationDays" from schedule_baseline_items where "baselineId"=$1',[baselines[0].id]);
 const map=new Map(items.map(b=>[b.activityId,b]));
 const mismatches=acts.filter(a=>{const b=map.get(a.id);return !b||a.earlyStart!==b.earlyStart||a.earlyFinish!==b.earlyFinish||a.durationDays!==b.durationDays;}).map(a=>a.id);
 await check("baseline_correspondencia",items.length===acts.length&&map.size===acts.length&&mismatches.length===0,{activities:acts.length,items:items.length,mismatches},"producao");
 const entries=await q(`select id,status,exemplo from production_entries where "projectId"=$1 and "productionDate" < (($2::date+1)::timestamp at time zone 'UTC')`,[projectId,position]);
 const examples=entries.filter(e=>Number(e.exemplo)===1);
 const official=entries.filter(e=>e.status==="confirmada"&&Number(e.exemplo)===0);
 const confirmedExamples=examples.filter(e=>e.status==="confirmada");
 await check("exemplos_nao_confirmados",confirmedExamples.length===0,{officialCount:official.length,examples,confirmedExamples},"simulacao");
 const updates=await q('select id,status,"activityId","supersedesId","positionDate" from activity_schedule_updates where "projectId"=$1 and "versionId"=$2 and "positionDate"<=$3::date order by id',[projectId,version,position]);
 const superseded=new Set(updates.map(u=>u.supersedesId));report.scheduleUpdates=updates.filter(u=>!superseded.has(u.id));
 const a=acts.find(x=>x.id===targetId);
 report.scenario=a&&a.physicalWeight!==null&&Number(a.plannedQuantity)>0?{hypothetical:true,persisted:false,activityId:a.id,name:a.name,percent,quantity:Number(a.plannedQuantity)*percent/100,unit:a.unit,contributionPercentagePoints:Number(a.physicalWeight)*percent/100}:{status:"not_run",reason:"Informe QA_ACTIVITY_ID válido"};
 report.next="validar interface e Curva S em QA";
 report.status=report.checks.every(c=>c.status==="pass")?"passed_readonly":"failed";
 if(report.status==="failed")process.exitCode=1;
}catch(e){report.status="blocked";report.errorCode=typeof e?.code==="string"?e.code:"QA_EXECUTION_BLOCKED";console.error("Auditoria interrompida:",report.next,report.errorCode);process.exitCode=1;}
finally{try{if(connected)await db.query("ROLLBACK");}finally{if(connected)await db.end();report.finishedAt=new Date().toISOString();await save();}}
