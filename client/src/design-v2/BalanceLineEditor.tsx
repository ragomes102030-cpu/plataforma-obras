/**
 * Linha de Balanço: datas no eixo VERTICAL, pavimentos no eixo horizontal.
 * Ritmo, início e equipes editáveis manualmente e em estado local.
 * Não há operações remotas nem recálculo técnico de produção.
 */
import {useMemo,useState} from "react";
import {ChevronDown,ChevronRight,ChevronsDownUp,ChevronsUpDown,Layers3,CalendarRange,Plus,Trash2,Check} from "lucide-react";
import {brDate,brFormat,brToInput,inputToBr,addDays} from "./ProfessionalSchedule";
const DAY=86400000;
type Line={id:string;stage:string;name:string;start:string;cadence:number;floors:number;crew:string;color:string;visible:boolean};
const initial:Line[]=[
 {id:"L01",stage:"Estrutura",name:"Concretagem de lajes",start:"09/11/2026",cadence:7,floors:6,crew:"Equipe A",color:"#3c819b",visible:true},
 {id:"L02",stage:"Estrutura",name:"Desforma e escoramento",start:"16/11/2026",cadence:7,floors:6,crew:"Equipe B",color:"#73a6ba",visible:true},
 {id:"L03",stage:"Vedações",name:"Alvenarias de pavimento",start:"07/12/2026",cadence:7,floors:6,crew:"Equipe C",color:"#ba8d55",visible:true},
 {id:"L04",stage:"Instalações",name:"Infraestrutura elétrica",start:"21/12/2026",cadence:7,floors:6,crew:"Equipe D",color:"#4e927c",visible:true},
 {id:"L05",stage:"Instalações",name:"Prumadas hidrossanitárias",start:"28/12/2026",cadence:8,floors:6,crew:"Equipe E",color:"#9872af",visible:true},
];
const groupOrder=["Estrutura","Vedações","Instalações"];
const colors=["#3c819b","#ba8d55","#4e927c","#9872af","#7797b3","#cb7b7b"];
export default function BalanceLineEditor(){
 const [lines,setLines]=useState<Line[]>(initial);
 const [closed,setClosed]=useState<Set<string>>(()=>new Set());
 const [selected,setSelected]=useState("L01");
 const [showLabels,setShowLabels]=useState(true);
 const [zoom,setZoom]=useState<"complete"|"compact">("complete");
 const [error,setError]=useState("");
 const maxFloor=Math.max(6,...lines.map(x=>x.floors));
 const selectedLine=lines.find(x=>x.id===selected);
 const active=lines.filter(x=>x.visible);
 const dates=active.flatMap(x=>[brDate(x.start),brDate(addDays(x.start,(x.floors-1)*x.cadence))]);
 const origin=new Date(Math.min(...dates.map(d=>d.getTime()),brDate("02/11/2026").getTime()));
 const latest=new Date(Math.max(...dates.map(d=>d.getTime()),brDate("30/01/2027").getTime()));
 const diff=(a:Date,b:Date)=>Math.round((b.getTime()-a.getTime())/DAY);
 const span=Math.max(56,diff(origin,latest)+14);
 const chartHeight=zoom==="complete"?560:390;
 const y=(d:string)=>42+diff(origin,brDate(d))/span*(chartHeight-95);
 const x=(floor:number)=>82+(floor-1)/(maxFloor-1)*610;
 const floorTicks=Array.from({length:maxFloor},(_,i)=>i+1);
 const dateTicks=Array.from({length:Math.ceil(span/14)+1},(_,i)=>brFormat(new Date(origin.getTime()+i*14*DAY)));
 function change(id:string,patch:Partial<Line>){setLines(current=>current.map(line=>line.id===id?{...line,...patch}:line));}
 function addLine(){const n=lines.length+1;const id="L"+String(n).padStart(2,"0");setLines(x=>[...x,{id,stage:"Instalações",name:"Nova frente de serviço",start:"04/01/2027",cadence:7,floors:6,crew:"Equipe a definir",color:colors[(n-1)%colors.length],visible:true}]);setClosed(x=>{const y=new Set(x);y.delete("Instalações");return y;});setSelected(id);}
 function removeLine(){if(!selectedLine)return;if(lines.length===1){setError("Mantenha ao menos uma frente nesta prévia.");return;}setLines(prev=>prev.filter(l=>l.id!==selected));setSelected(lines.find(l=>l.id!==selected)?.id||"");setError("");}
 function toggleGroup(stage:string){setClosed(v=>{const next=new Set(v);next.has(stage)?next.delete(stage):next.add(stage);return next;});}
 function setLineDate(input:string){if(input)change(selected,{start:inputToBr(input)});}
 return <section className="lb" aria-label="Linha de Balanço editável">
  <header className="lb-header"><div><span className="pv2-eyebrow">PLANEJAMENTO · LINHA DE BALANÇO</span><h2>Linha de Balanço</h2><p>Datas na vertical, unidades no eixo horizontal e frentes recolhíveis.</p></div><button className="pv2-primary" onClick={addLine}><Plus size={16}/> Nova frente</button></header>
  <div className="lb-toolbar">
   <div><button className="ps-action" onClick={()=>setClosed(new Set())}><ChevronsUpDown size={15}/> Expandir todas</button><button className="ps-action" onClick={()=>setClosed(new Set(groupOrder))}><ChevronsDownUp size={15}/> Recolher todas</button></div>
   <div><label className="ps-switch"><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/> Legendas</label><select className="ps-select" aria-label="Escala da Linha de Balanço" value={zoom} onChange={e=>setZoom(e.target.value as "complete"|"compact")}><option value="complete">Visão detalhada</option><option value="compact">Visão compacta</option></select></div>
  </div>
  <div className="lb-content">
   <div className="lb-left">
    <div className="lb-panel-title"><Layers3 size={17}/><strong>Frentes e equipes</strong><small>{lines.length} linhas</small></div>
    <div className="lb-tree">{groupOrder.map(stage=><div key={stage}><button className="lb-stage" onClick={()=>toggleGroup(stage)} aria-expanded={!closed.has(stage)}>{closed.has(stage)?<ChevronRight size={16}/>:<ChevronDown size={16}/>}<strong>{stage}</strong><span>{lines.filter(l=>l.stage===stage).length}</span></button>
     {!closed.has(stage)&&lines.filter(l=>l.stage===stage).map(line=><div key={line.id} className={"lb-front "+(selected===line.id?"lb-front-active":"")}><label aria-label={"Exibir "+line.name}><input type="checkbox" checked={line.visible} onChange={e=>change(line.id,{visible:e.target.checked})}/></label><button type="button" onClick={()=>{setSelected(line.id);setError("");}}><span style={{background:line.color}}/><strong>{line.name}</strong><small>{line.crew} · {line.cadence} d/pav.</small></button></div>)}
    </div>)}</div>
    {selectedLine&&<section className="lb-editor"><div className="lb-panel-title"><CalendarRange size={17}/><strong>Editar frente manualmente</strong></div>
     <label>Serviço<input aria-label="Nome da frente" value={selectedLine.name} onChange={e=>change(selected,{name:e.target.value})}/></label>
     <label>Disciplina<select aria-label="Disciplina da frente" value={selectedLine.stage} onChange={e=>{change(selected,{stage:e.target.value});setClosed(v=>{const n=new Set(v);n.delete(e.target.value);return n;});}}>{groupOrder.map(s=><option key={s}>{s}</option>)}</select></label>
     <div className="lb-input-pair"><label>Início<input aria-label="Início da frente" type="date" value={brToInput(selectedLine.start)} onChange={e=>setLineDate(e.target.value)}/></label><label>Ritmo (dias/pav.)<input type="number" aria-label="Ritmo em dias por pavimento" min="1" max="90" value={selectedLine.cadence} onChange={e=>change(selected,{cadence:Math.min(90,Math.max(1,Number(e.target.value)||1))})}/></label></div>
     <div className="lb-input-pair"><label>Pavimentos<input aria-label="Quantidade de pavimentos" type="number" min="2" max="30" value={selectedLine.floors} onChange={e=>change(selected,{floors:Math.min(30,Math.max(2,Number(e.target.value)||2))})}/></label><label>Equipe<input aria-label="Equipe responsável pela frente" value={selectedLine.crew} onChange={e=>change(selected,{crew:e.target.value})}/></label></div>
     <div className="lb-small-actions"><button className="ps-action" onClick={removeLine}><Trash2 size={14}/> Excluir da prévia</button><span><Check size={14}/> Mudanças locais e imediatas</span></div>{error&&<p className="lb-error">{error}</p>}
    </section>}
   </div>
   <div className="lb-chart-wrap"><div className="lb-chart-head"><strong>Linha de Balanço</strong><span>Tempo ↓ &nbsp; Pavimentos →</span></div>
    <svg className="lb-chart" viewBox={"0 0 755 "+chartHeight} role="img" aria-label="Linha de Balanço fictícia com datas no eixo vertical e pavimentos no eixo horizontal">
      {floorTicks.map(f=><g key={f}><line x1={x(f)} x2={x(f)} y1="40" y2={chartHeight-50} stroke="currentColor" opacity=".12"/><text x={x(f)} y="29" fontSize="12" fill="currentColor" textAnchor="middle" opacity=".75">P{f}</text></g>)}
      {dateTicks.map(d=><g key={d} opacity=".68"><line x1="75" x2="709" y1={y(d)} y2={y(d)} stroke="currentColor" opacity=".17"/><text x="69" y={y(d)+4} fontSize="10" fill="currentColor" textAnchor="end">{d.slice(0,5)}</text></g>)}
      {active.map(line=>{
       const points=Array.from({length:line.floors},(_,i)=>({x:x(i+1),y:y(addDays(line.start,i*line.cadence))}));
       return <g key={line.id} opacity={selected===line.id?1:.76}><polyline points={points.map(p=>p.x+","+p.y).join(" ")} fill="none" stroke={line.color} strokeWidth={selected===line.id?4.5:3} strokeLinecap="round" strokeLinejoin="round"/>
       {points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={selected===line.id?4:2.7} fill={line.color}><title>{line.name+" · P"+(i+1)+" · "+addDays(line.start,i*line.cadence)}</title></circle>)}
       {showLabels&&<text x={Math.min(points[points.length-1].x+5,695)} y={points[points.length-1].y-7} textAnchor="end" fontSize="10" fill={line.color}>{line.id}</text>}</g>;
      })}
      <text x="390" y={chartHeight-12} textAnchor="middle" fontSize="12" fill="currentColor" opacity=".8">Pavimentos / unidades repetitivas</text>
    </svg><div className="lb-chart-footer">{active.map(line=><span key={line.id}><i style={{background:line.color}}/>{line.name}</span>)}</div>
   </div>
  </div>
  <div className="ps-note"><CalendarRange size={17}/><span>Edite qualquer frente manualmente: início, equipes, pavimentos e produtividade por pavimento. A projeção é ilustrativa e não substitui o motor real de Linha de Balanço.</span></div>
 </section>;
}
