import {useMemo,useState} from "react";
import {ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,Columns3,GitBranch,Plus,CalendarRange} from "lucide-react";
import {type Activity,wbsItems} from "./sample-data";

/** Somente interface local; sem qualquer serviço, recálculo CPM ou persistência. */
type Props={activities:Activity[];onOpenActivity:(a:Activity)=>void;onChange:(a:Activity)=>void;onAdd:()=>void};
type Row={kind:"group";code:string;name:string;items:Activity[]}|{kind:"task";item:Activity};
const DAY=86400000;
const axisStart=new Date(Date.UTC(2026,10,2));
export function brDate(input:string){const [d,m,y]=input.split("/").map(Number);return new Date(Date.UTC(y,m-1,d));}
export function brFormat(date:Date){return String(date.getUTCDate()).padStart(2,"0")+"/"+String(date.getUTCMonth()+1).padStart(2,"0")+"/"+date.getUTCFullYear();}
export function brToInput(date:string){const [d,m,y]=date.split("/");return y+"-"+m+"-"+d;}
export function inputToBr(date:string){const [y,m,d]=date.split("-");return d+"/"+m+"/"+y;}
export function addDays(date:string,delta:number){return brFormat(new Date(brDate(date).getTime()+delta*DAY));}
function diff(a:Date,b:Date){return Math.round((b.getTime()-a.getTime())/DAY);}
function shortDate(d:Date){return String(d.getUTCDate()).padStart(2,"0")+" "+d.toLocaleDateString("pt-BR",{month:"short",timeZone:"UTC"}).replace(".","").toUpperCase();}
const stages=wbsItems.filter(x=>x.type==="Fase");

export default function ProfessionalSchedule({activities,onOpenActivity,onChange,onAdd}:Props){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set(["1.4"]));
 const [scale,setScale]=useState<"weekly"|"fortnight">("weekly");
 const [baseline,setBaseline]=useState(true);
 const [critical,setCritical]=useState(false);
 const [connections,setConnections]=useState(true);
 const [wide,setWide]=useState(true);
 const [selected,setSelected]=useState<string|null>(null);
 const [query,setQuery]=useState("");
 const step=scale==="weekly"?7:14,cell=scale==="weekly"?48:58;
 const total=Math.max(140,...activities.map(a=>diff(axisStart,brDate(a.end))+20));
 const ticks=Array.from({length:Math.ceil(total/step)},(_,i)=>{const d=new Date(axisStart.getTime()+i*step*DAY);return {text:shortDate(d),i};});
 const width=ticks.length*cell;
 const dateX=(d:string)=>diff(axisStart,brDate(d))/step*cell;
 const barW=(start:string,end:string)=>Math.max(8,(diff(brDate(start),brDate(end))+1)/step*cell);
 const rows=useMemo<Row[]>(()=>{
  const out:Row[]=[];
  stages.forEach(s=>{
   const items=activities.filter(a=>a.eap.startsWith(s.code+".")&&(!critical||a.critical)&&((a.name+" "+a.eap+" "+a.code).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))));
   if(!items.length&&(critical||query))return;
   out.push({kind:"group",code:s.code,name:s.name,items});
   if(!collapsed.has(s.code))items.forEach(item=>out.push({kind:"task",item}));
  });
  return out;
 },[activities,collapsed,critical,query]);
 const indices=new Map(rows.map((r,i)=>[r.kind==="task"?r.item.id:r.code,i]));
 const lines=rows.flatMap(r=>{
  if(r.kind!=="task")return [];
  const pred=activities.find(a=>a.id===r.item.predecessor);
  const a=indices.get(pred?.id||""),b=indices.get(r.item.id);
  if(!pred||a===undefined||b===undefined)return [];
  const x=dateX(pred.end)+8,xx=dateX(r.item.start)-4, mid=Math.max(x+9,Math.min(x+22,xx-10));
  const d="M"+x+" "+(a*46+23)+" H"+mid+" V"+(b*46+23)+" H"+xx;
  return [<path key={r.item.id} d={d} stroke="var(--ps-link)" strokeWidth="1.4" strokeLinejoin="round" fill="none" markerEnd="url(#ps-arrow)"/>];
 });
 function toggle(code:string){setCollapsed(v=>{const n=new Set(v);if(n.has(code))n.delete(code);else n.add(code);return n;});}
 function groupRange(items:Activity[]){if(!items.length)return null;let min=brDate(items[0].start),max=brDate(items[0].end);items.forEach(a=>{const x=brDate(a.start),y=brDate(a.end);if(x<min)min=x;if(y>max)max=y;});return {start:brFormat(min),end:brFormat(max)};}
 return <section className="ps" aria-label="Cronograma profissional">
  <div className="ps-head"><div><span className="pv2-eyebrow">PLANEJAMENTO · GANTT</span><h2>Cronograma de atividades</h2><p>EAP recolhível, tabela editável e calendário sincronizado. Sem dependência do agente.</p></div><button className="pv2-primary" onClick={onAdd}><Plus size={16}/> Nova atividade</button></div>
  <div className="ps-toolbar">
   <div className="ps-controls"><button className="ps-action" onClick={()=>setCollapsed(new Set())}><ChevronsUpDown size={15}/> Expandir tudo</button><button className="ps-action" onClick={()=>setCollapsed(new Set(stages.map(s=>s.code)))}><ChevronsDownUp size={15}/> Recolher tudo</button></div>
   <label className="ps-search">⌕ <input aria-label="Buscar tarefa no Gantt" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar EAP / atividade"/></label>
   <div className="ps-controls"><button className="ps-action" onClick={()=>setWide(x=>!x)}><Columns3 size={15}/> {wide?"Tabela compacta":"Mais colunas"}</button>
    <label className="ps-switch"><input type="checkbox" checked={connections} onChange={e=>setConnections(e.target.checked)}/> Vínculos</label>
    <label className="ps-switch"><input type="checkbox" checked={baseline} onChange={e=>setBaseline(e.target.checked)}/> Baseline</label>
    <label className="ps-switch"><input type="checkbox" checked={critical} onChange={e=>setCritical(e.target.checked)}/> Críticas</label>
    <select className="ps-select" value={scale} aria-label="Escala do cronograma" onChange={e=>setScale(e.target.value as "weekly"|"fortnight")}><option value="weekly">Semanas</option><option value="fortnight">Quinzenas</option></select>
   </div>
  </div>
  <div className="ps-board">
   <div className="ps-grid-scroll">
    <div className={"ps-grid "+(wide?"ps-grid-wide":"ps-grid-compact")} style={{"--ps-width":width+"px","--ps-tick":cell+"px"} as React.CSSProperties}>
     <div className="ps-table-top"><strong>Atividade / EAP</strong>{wide&&<><span>Duração</span><span>Início</span><span>Término</span><span>Predecessora</span></>}<span>Avanço</span></div>
     <div className="ps-calendar" style={{width}}>{ticks.map(t=><span key={t.i} style={{width:cell}}>{t.text}</span>)}</div>
     <div className="ps-table-rows">
      {rows.map(r=>r.kind==="group"?<div className="ps-grid-row ps-group" key={r.code}>
       <button className="ps-group-button" onClick={()=>toggle(r.code)} aria-expanded={!collapsed.has(r.code)}>{collapsed.has(r.code)?<ChevronRight size={16}/>:<ChevronDown size={16}/>}<b>{r.code}</b><strong>{r.name}</strong></button><span className="ps-group-count">{r.items.length} ativ.</span>
      </div>:<div className={"ps-grid-row ps-task "+(selected===r.item.id?"ps-selected":"")} key={r.item.id}>
       <button className="ps-edit-task" aria-label={r.item.name+" "+r.item.code} onClick={()=>{setSelected(r.item.id);onOpenActivity(r.item);}} title="Abrir edição manual"><span>{r.item.code}</span><strong>{r.item.name}</strong></button>
       {wide&&<span className="ps-data-small">{r.item.duration}d</span>}
       {wide&&<span className="ps-data-small">{r.item.start.slice(0,5)}</span>}
       {wide&&<span className="ps-data-small">{r.item.end.slice(0,5)}</span>}
       {wide&&<span className="ps-data-small">{r.item.predecessor==="—"?"—":r.item.predecessor.replace("AT-","")}</span>}
       <label className="ps-progress" title="Alterar avanço manualmente"><input aria-label={"Avanço de "+r.item.name} type="number" min="0" max="100" value={r.item.progress} onChange={e=>onChange({...r.item,progress:Math.min(100,Math.max(0,Number(e.target.value)))})}/>%</label>
      </div>)}
      {!rows.length&&<p className="ps-empty">Nenhuma atividade corresponde aos filtros.</p>}
     </div>
     <div className="ps-timeline" style={{width,backgroundSize:cell+"px 100%"}}>
      {connections&&<svg className="ps-links" width={width} height={rows.length*46} aria-hidden="true"><defs><marker id="ps-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="var(--ps-link)"/></marker></defs>{lines}</svg>}
      {rows.map(r=>{
       const range=r.kind==="group"?groupRange(r.items):{start:r.item.start,end:r.item.end};
       return <div key={r.kind==="group"?r.code:r.item.id} className={"ps-time-row "+(r.kind==="group"?"ps-time-group":"ps-time-task")}>
        {range&&(r.kind==="group"?<span className="ps-summary-bar" style={{left:Math.max(0,dateX(range.start)),width:barW(range.start,range.end)}} title={r.name}><i/></span>:
         <button className={"ps-bar "+(r.item.critical?"ps-bar-critical ":"")+(r.item.status==="Concluída"?"ps-bar-done":"")} title={r.item.name+" · "+r.item.start+"—"+r.item.end} aria-label={"Abrir atividade "+r.item.name} style={{left:Math.max(0,dateX(range.start)),width:barW(range.start,range.end)}} onClick={()=>{setSelected(r.item.id);onOpenActivity(r.item);}}>
          {baseline&&<i className="ps-baseline"/>}<span className="ps-bar-fill" style={{width:r.item.progress+"%"}}/><span className="ps-bar-percent">{r.item.progress}%</span>
         </button>)}
       </div>;
      })}
     </div>
    </div>
   </div>
  </div>
  <div className="ps-legend"><span><i className="ps-key-blue"/> Planejado</span><span><i className="ps-key-red"/> Caminho crítico simulado</span><span><i className="ps-key-outline"/> Baseline de referência</span><span><GitBranch size={15}/> Relações término–início</span></div>
  <div className="ps-note"><CalendarRange size={17}/><span>Edite manualmente início, duração, progresso, predecessor e pacote de trabalho clicando na atividade. Alterações só na prévia; o motor CPM real não é executado.</span></div>
 </section>;
}
