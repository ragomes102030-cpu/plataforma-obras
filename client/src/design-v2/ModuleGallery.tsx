/**
 * Galeria de módulos da Plataforma Obras — demonstração V2.
 * Valores locais, sem tRPC, credenciais, autenticação, Drizzle ou APIs.
 * Uma tela pode demonstrar UX; ela NUNCA executa cálculos oficiais.
 */
import { useState } from "react";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BarChart3, BookOpen, Bot,
  CalendarRange, CheckCircle2, ClipboardList, FileText, FolderOpen,
  GitBranch, Layers3, LockKeyhole, Package, Search, ShieldAlert, WalletCards,
  Wrench, type LucideIcon,
} from "lucide-react";
import { initialActivities, project, type Activity } from "./sample-data";

export type GalleryModule =
  | "escopo" | "atividades" | "cpm" | "linha-balanco"
  | "producao" | "curva-s" | "financeiro" | "suprimentos"
  | "catalogo" | "documentos" | "riscos" | "comando";

type Props = {
  module: GalleryModule;
  activities: Activity[];
  onOpenActivity: (activity: Activity) => void;
  onNavigate: (module: string) => void;
};

type Row = { label: string; detail: string; state?: string; extra?: string };

const modules: Record<GalleryModule, { title: string; eyebrow: string; description: string; icon: LucideIcon }> = {
  escopo: { title: "Escopo da obra", eyebrow: "PLANEJAMENTO · ORIGEM", description: "O que será entregue, os limites e as premissas contratuais.", icon: ClipboardList },
  atividades: { title: "Atividades", eyebrow: "PLANEJAMENTO · EXECUÇÃO PREVISTA", description: "Pacotes de trabalho transformados em serviços executáveis.", icon: CalendarRange },
  cpm: { title: "CPM · caminho crítico", eyebrow: "PLANEJAMENTO · REDE LÓGICA", description: "Sequenciamento, restrições e folgas da rede de precedências.", icon: GitBranch },
  "linha-balanco": { title: "Linha de Balanço", eyebrow: "PLANEJAMENTO · PRODUÇÃO REPETITIVA", description: "Ritmo das equipes pelos pavimentos e frentes de serviço.", icon: BarChart3 },
  producao: { title: "Controle de produção", eyebrow: "EXECUÇÃO · CAMPO", description: "Previsto versus realizado, frentes ativas e restrições.", icon: Wrench },
  "curva-s": { title: "Curva S", eyebrow: "EXECUÇÃO · TENDÊNCIA", description: "Comparação visual de avanço físico acumulado e referência.", icon: BarChart3 },
  financeiro: { title: "Orçamento e custos", eyebrow: "FINANCEIRO", description: "Orçado, realizado e desvios por grupos de serviços.", icon: WalletCards },
  suprimentos: { title: "Suprimentos", eyebrow: "COMPRAS E ABASTECIMENTO", description: "Materiais necessários por frente, prazo e situação.", icon: Package },
  catalogo: { title: "Catálogo de insumos", eyebrow: "BASE DE INSUMOS", description: "Composição, unidade e referência dos materiais e serviços.", icon: BookOpen },
  documentos: { title: "Documentos", eyebrow: "GESTÃO · ARQUIVOS", description: "Versões de projetos, memoriais e registros de engenharia.", icon: FolderOpen },
  riscos: { title: "Riscos", eyebrow: "GESTÃO · PREVENÇÃO", description: "Probabilidade, impacto, resposta e responsável.", icon: ShieldAlert },
  comando: { title: "Central de Comando", eyebrow: "FERRAMENTA ADMINISTRATIVA · IA", description: "Visão do assistente e fluxo de propostas antes da aprovação do engenheiro.", icon: Bot },
};

const budget = [
  { group: "Infraestrutura", code: "01", plan: 740000, spent: 402000, progress: 59 },
  { group: "Estrutura", code: "02", plan: 1840000, spent: 880000, progress: 44 },
  { group: "Instalações", code: "03", plan: 950000, spent: 124000, progress: 18 },
  { group: "Acabamentos", code: "04", plan: 1270000, spent: 82000, progress: 7 },
];
const supplyRows: Row[] = [
  { label: "Aço CA-50", detail: "Estrutura · 12.400 kg", state: "Em cotação", extra: "05/11/2026" },
  { label: "Concreto usinado FCK 30", detail: "Fundação · 120 m³", state: "Programado", extra: "10/11/2026" },
  { label: "Bloco cerâmico 14 cm", detail: "Vedações · 18.000 un", state: "A contratar", extra: "22/11/2026" },
  { label: "Tubulação PVC 100 mm", detail: "Instalações · 420 m", state: "Disponível", extra: "28/11/2026" },
];
const risks = [
  { id: "R-01", name: "Interferência em fundações", chance: "Alta", impact: "Alto", owner: "Engenharia", plan: "Compatibilizar sondagem e projeto executivo antes de liberar a frente." },
  { id: "R-02", name: "Atraso do concreto usinado", chance: "Média", impact: "Alto", owner: "Suprimentos", plan: "Confirmar janela de entrega e manter fornecedor alternativo homologado." },
  { id: "R-03", name: "Chuvas na movimentação de terra", chance: "Média", impact: "Médio", owner: "Produção", plan: "Planejar drenagem provisória e contingência de produtividade." },
];
const documents = [
  { id:"DOC-001", name:"Projeto estrutural", revision:"Rev. B", kind:"Projeto", state:"Para revisão", date:"21/10/2026" },
  { id:"DOC-002", name:"Memorial descritivo", revision:"Rev. 02", kind:"Memorial", state:"Aprovado", date:"19/10/2026" },
  { id:"DOC-003", name:"Diário de obra", revision:"Semana 42", kind:"Relatório", state:"Atualizado", date:"23/10/2026" },
  { id:"DOC-004", name:"Plano de execução", revision:"Rev. A", kind:"Procedimento", state:"Em revisão", date:"20/10/2026" },
];
const catalog = [
  {id:"INS-001",name:"Cimento CP II-E 32",unit:"saco 50 kg",kind:"Material",source:"Composição de referência"},
  {id:"INS-002",name:"Aço CA-50 Ø 10 mm",unit:"kg",kind:"Material",source:"Composição de referência"},
  {id:"INS-003",name:"Pedreiro",unit:"h",kind:"Mão de obra",source:"Equipe estimada"},
  {id:"INS-004",name:"Betoneira 400 L",unit:"h",kind:"Equipamento",source:"Equipamento"},
  {id:"INS-005",name:"Concreto usinado FCK 30",unit:"m³",kind:"Material",source:"Composição de referência"},
];

const brl = (v:number) => "R$ " + v.toLocaleString("pt-BR",{maximumFractionDigits:0});
function Tag({text}:{text:string}) {
  const tone = /Aprovado|Concluído|Disponível|Atualizado|Em dia/.test(text) ? "good" : /Atras|Alto|Alta|Crític|bloquead/.test(text) ? "danger" : /revisão|Revisão|cotação|contratar|Pendente/.test(text) ? "warn" : "neutral";
  return <span className={"pv2-status pv2-status-"+tone}><span className="pv2-status-dot"/>{text}</span>;
}
function Section({title,aside,children}:{title:string,aside?:React.ReactNode,children:React.ReactNode}) {
  return <section className="pv2-panel pv2-module-panel"><div className="pv2-section-title"><h2>{title}</h2>{aside}</div>{children}</section>;
}
function Pairs({data}:{data:[string,string][]}) {
  return <div className="pv2-data-pairs">{data.map(([key,val])=><div key={key}><span>{key}</span><strong>{val}</strong></div>)}</div>;
}
function RowTable({headers,rows,onClick}:{headers:string[];rows:string[][];onClick?:(i:number)=>void}) {
  return <div className="pv2-table-scroll"><table className="pv2-table pv2-module-table"><thead><tr>{headers.map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map((cells,i)=><tr key={i} onClick={onClick?()=>onClick(i):undefined} className={onClick?"pv2-clickrow":undefined}>{cells.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function ModuleStat({label,value,foot}:{label:string,value:string,foot?:string}) {
  return <div className="pv2-module-stat"><span>{label}</span><strong>{value}</strong>{foot&&<small>{foot}</small>}</div>;
}
function SeriesChart({kind}:{kind:"curve"|"cost"}) {
  if(kind==="curve") return <div className="pv2-chart-frame"><svg viewBox="0 0 720 268" role="img" aria-label="Curva S demonstrativa; acumulado previsto acima do realizado">
    {[40,90,140,190,240].map(y=><line key={y} x1="55" y1={y} x2="695" y2={y} stroke="currentColor" opacity=".12"/>)}
    {["100%","75%","50%","25%","0%"].map((v,i)=><text key={v} x="45" y={44+i*50} fill="currentColor" opacity=".63" textAnchor="end" fontSize="12">{v}</text>)}
    <path d="M55 240 C130 238 155 222 215 207 S324 156 380 127 S495 66 570 52 S652 43 695 40" fill="none" stroke="#367f91" strokeWidth="3.8" strokeLinecap="round"/>
    <path d="M55 240 C115 238 168 229 215 214 S316 183 380 161 S489 141 570 132" fill="none" stroke="#ca8c48" strokeWidth="3.8" strokeLinecap="round"/>
    <path d="M55 240 C115 238 168 229 215 214 S316 183 380 161 S489 141 570 132 L570 240 Z" fill="#ca8c48" fillOpacity=".06"/>
    <line x1="570" y1="35" x2="570" y2="240" stroke="#ca8c48" strokeDasharray="5 6" opacity=".6"/>
    {["Nov","Dez","Jan","Fev","Mar","Abr","Mai"].map((v,i)=><text key={v} x={55+i*106} y="261" fill="currentColor" opacity=".63" textAnchor="middle" fontSize="12">{v}</text>)}
  </svg><div className="pv2-legend"><span><i style={{background:"#367f91"}}/>Previsto</span><span><i style={{background:"#ca8c48"}}/>Realizado</span><small>Gráfico ilustrativo — sem cálculo financeiro real</small></div></div>;
  return <div className="pv2-chart-frame"><div className="pv2-cost-bars">{budget.map(item=><div className="pv2-cost-row" key={item.code}><strong>{item.group}</strong><div><span className="pv2-cost-plan" style={{width:(item.plan/1840000*100)+"%"}}/><span className="pv2-cost-actual" style={{width:(item.spent/1840000*100)+"%"}}/></div><small>{brl(item.spent)}</small></div>)}</div><div className="pv2-legend"><span><i style={{background:"var(--brand)"}}/>Orçado</span><span><i style={{background:"var(--good)"}}/>Realizado</span></div></div>;
}
function LobChart() {
  const data=[
    {label:"Estrutura",xs:[78,128,178,228,278,328],color:"#42869a"},
    {label:"Vedação",xs:[135,185,235,285,335,385],color:"#b48c58"},
    {label:"Instalações",xs:[195,245,295,345,395,445],color:"#6c9c7c"},
  ];
  return <div className="pv2-chart-frame"><svg viewBox="0 0 710 338" aria-label="Linha de Balanço fictícia com sequência de pavimentos" role="img">
    {Array.from({length:6},(_,i)=><g key={i}><line x1="80" x2="680" y1={50+i*45} y2={50+i*45} stroke="currentColor" opacity=".16"/><text x="62" y={55+i*45} textAnchor="end" fontSize="12" fill="currentColor" opacity=".7">P{6-i}</text></g>)}
    {Array.from({length:9},(_,i)=><g key={i}><line x1={80+i*70} x2={80+i*70} y1="35" y2="285" stroke="currentColor" opacity=".1"/><text x={80+i*70} y="313" textAnchor="middle" fontSize="11" fill="currentColor" opacity=".7">{(i+1)*7}d</text></g>)}
    {data.map(d=><polyline key={d.label} points={d.xs.map((x,i)=>x+","+(275-i*45)).join(" ")} fill="none" stroke={d.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/>)}
  </svg><div className="pv2-legend">{data.map(d=><span key={d.label}><i style={{background:d.color}}/>{d.label}</span>)}</div></div>;
}
function CriticalPath() {
  return <div className="pv2-path-scroll"><div className="pv2-critical-path">{initialActivities.slice(1).map((a,i)=><div className="pv2-critical-step" key={a.id}><div><small>{a.code}</small><strong>{a.name}</strong><span>{a.duration} dias · fictício</span></div>{i!==initialActivities.slice(1).length-1&&<ArrowRight size={19}/>}</div>)}</div></div>;
}
function Scaffold({module,children}:{module:GalleryModule;children:React.ReactNode}) {
  const meta=modules[module],Icon=meta.icon;
  return <section className="pv2-module" data-gallery={module}><div className="pv2-pagehead">
    <div><span className="pv2-eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div>
    <div className="pv2-module-icon"><Icon size={23}/></div>
  </div>{children}<p className="pv2-module-disclaimer"><LockKeyhole size={14}/> Dados e indicadores fictícios. Simulações visuais não consultam, aprovam nem modificam a obra real.</p></section>;
}

export default function ModuleGallery({module,activities,onOpenActivity,onNavigate}:Props) {
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState("");
  const [expanded,setExpanded]=useState("");
  const [period,setPeriod]=useState("Acumulado");
  const [ask,setAsk]=useState("");
  const [messages,setMessages]=useState<string[]>([]);
  function openRow(id:string){setExpanded(x=>x===id?"":id)}
  const matching=(name:string)=>name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));

  let body:React.ReactNode;
  switch(module){
    case "escopo": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Objeto" value="Edificação" foot="Residencial multifamiliar"/><ModuleStat label="Frentes previstas" value="04" foot="Infraestrutura a acabamentos"/><ModuleStat label="Pacotes EAP" value="08" foot="Versão demonstrativa"/><ModuleStat label="Definição" value="Em revisão" foot="2 premissas por confirmar"/></div>
      <div className="pv2-module-columns"><Section title="Objeto e limites do empreendimento" aside={<Tag text="Em revisão"/>}>
        <h3>Escopo declarado</h3><p>Construção fictícia de edifício residencial multifamiliar com áreas comuns, estrutura em concreto armado e instalações complementares.</p>
        <div className="pv2-details"><details open><summary>Entregas incluídas</summary><p>Implantação do canteiro, fundações, superestrutura, vedações, instalações e acabamentos previstos em projeto.</p></details><details><summary>Exclusões e limites</summary><p>Paisagismo externo especial e equipamentos privativos não estão na versão ilustrativa do contrato.</p></details><details><summary>Premissas do planejamento</summary><p>Calendário preliminar de 5 dias úteis e produtividade condicionada à liberação das frentes. Premissas fictícias, não utilizadas pelo cálculo real.</p></details></div>
      </Section><Section title="Próximas validações"><div className="pv2-checklist"><span><CheckCircle2 size={18}/> Descrição técnica registrada</span><span><AlertTriangle size={18}/> Confirmar limites de fornecimento</span><span><AlertTriangle size={18}/> Validar critérios de aceitação</span></div><button className="pv2-secondary pv2-wide" onClick={()=>onNavigate("eap")}>Continuar para EAP <ArrowRight size={16}/></button></Section></div>
    </>;break;
    case "atividades": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Atividades" value={String(activities.length).padStart(2,"0")}/><ModuleStat label="Em execução" value={String(activities.filter(a=>a.progress>0&&a.progress<100).length).padStart(2,"0")}/><ModuleStat label="Concluídas" value={String(activities.filter(a=>a.progress===100).length).padStart(2,"0")}/><ModuleStat label="Críticas" value={String(activities.filter(a=>a.critical).length).padStart(2,"0")}/></div>
      <Section title="Lista de atividades" aside={<span className="pv2-muted-caption">Clique numa linha para detalhar</span>}>
        <div className="pv2-module-filter"><Search size={16}/><input aria-label="Pesquisar atividade" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar serviço ou código"/></div>
        <RowTable headers={["Código","Atividade","EAP","Duração","Avanço"]} rows={activities.filter(a=>matching(a.name+" "+a.code)).map(a=>[a.code,a.name,a.eap,a.duration+" dias",a.progress+"%"])} onClick={i=>onOpenActivity(activities.filter(a=>matching(a.name+" "+a.code))[i])}/>
      </Section>
      <div className="pv2-module-actions"><button className="pv2-secondary" onClick={()=>onNavigate("dependencias")}>Ver dependências <ArrowRight size={16}/></button><button className="pv2-secondary" onClick={()=>onNavigate("gantt")}>Visualizar Gantt <ArrowRight size={16}/></button></div>
    </>;break;
    case "cpm": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Rede lógica" value="06 atividades" foot="Vínculos exemplificativos"/><ModuleStat label="Duração da rede" value="80 dias" foot="Valor ilustrativo"/><ModuleStat label="Caminho crítico" value="05 atividades" foot="Sem cálculo automático"/><ModuleStat label="Folga total" value="—" foot="Motor real não executado"/></div>
      <Section title="Sequência crítica demonstrativa" aside={<Tag text="Crítico"/>}><CriticalPath/><div className="pv2-softnote"><AlertTriangle size={18}/> O caminho destacado é fictício. Não se trata de resultado calculado por CPM.</div></Section>
      <div className="pv2-module-actions"><button className="pv2-secondary" onClick={()=>onNavigate("dependencias")}>Revisar rede <ArrowRight size={16}/></button><button className="pv2-secondary" onClick={()=>onNavigate("baseline")}>Ver bloqueio da baseline <ArrowRight size={16}/></button></div>
    </>;break;
    case "linha-balanco": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Pavimentos" value="06" foot="Unidades repetitivas"/><ModuleStat label="Equipes" value="03" foot="Frentes planejadas"/><ModuleStat label="Ritmo" value="7 dias" foot="Exemplo por pavimento"/><ModuleStat label="Interferências" value="01" foot="A revisar"/></div>
      <Section title="Ritmo de execução por pavimento" aside={<span className="pv2-muted-caption">Tempo no eixo horizontal</span>}><LobChart/></Section>
      <div className="pv2-softnote"><AlertTriangle size={18}/> Datas e inclinações são ilustrativas, não vinculadas ao cronograma real.</div>
    </>;break;
    case "producao": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Avanço" value="38%" foot="Previsto: 42%"/><ModuleStat label="Frentes ativas" value="03"/><ModuleStat label="Restrição aberta" value="02"/><ModuleStat label="Medições" value="05" foot="Apontamentos fictícios"/></div>
      <Section title="Frentes de trabalho"><div className="pv2-kanban">
        {[{title:"A executar",rows:["Armação da laje P1","Alvenaria de shafts"]},{title:"Em produção",rows:["Escavações","Blocos de fundação"]},{title:"Concluídas",rows:["Mobilização","Locação da obra"]}].map(g=><div className="pv2-kanban-column" key={g.title}><div><strong>{g.title}</strong><span>{g.rows.length}</span></div>{g.rows.map(r=><button key={r} onClick={()=>{const a=activities.find(x=>x.name===r); if(a)onOpenActivity(a); else setSelected(r);}}>{r}<small>{selected===r?"Frente selecionada":"Ver detalhe disponível"}</small></button>)}</div>)}
      </div></Section>
      <div className="pv2-module-actions"><button className="pv2-secondary" onClick={()=>onNavigate("curva-s")}>Ver tendência na Curva S <ArrowRight size={16}/></button></div>
    </>;break;
    case "curva-s": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Avanço previsto" value="42,0%"/><ModuleStat label="Avanço realizado" value="38,0%"/><ModuleStat label="Desvio" value="−4,0 p.p." foot="Ilustrativo"/><ModuleStat label="Leitura" value="Atenção" foot="Abaixo da referência"/></div>
      <Section title="Evolução física acumulada" aside={<select className="pv2-select" aria-label="Período da curva" value={period} onChange={e=>setPeriod(e.target.value)}><option>Acumulado</option><option>Últimos 3 meses</option></select>}><SeriesChart kind="curve"/><p className="pv2-module-hint">Visualização {period.toLowerCase()} · pontos meramente ilustrativos.</p></Section>
    </>;break;
    case "financeiro": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Orçado" value={brl(4800000)}/><ModuleStat label="Realizado" value={brl(1488000)}/><ModuleStat label="Saldo teórico" value={brl(3312000)}/><ModuleStat label="Comprometimento" value="31%" foot="Exemplo de acompanhamento"/></div>
      <div className="pv2-module-columns"><Section title="Comparação por grupo de custos"><SeriesChart kind="cost"/></Section><Section title="Visão resumida"><RowTable headers={["Grupo","Orçado","Executado"]} rows={budget.map(x=>[x.group,brl(x.plan),brl(x.spent)])}/><p className="pv2-module-hint">Os valores não são derivados da EAP ou de medições reais.</p></Section></div>
    </>;break;
    case "suprimentos": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Solicitações" value="04"/><ModuleStat label="Em cotação" value="01"/><ModuleStat label="Entrega programada" value="01"/><ModuleStat label="A contratar" value="01"/></div>
      <Section title="Necessidades por frente" aside={<span className="pv2-muted-caption">Selecione para expandir</span>}>
      {supplyRows.map((r,i)=><div className="pv2-expand-row" key={r.label}><button onClick={()=>openRow("s"+i)} aria-expanded={expanded==="s"+i}><span><strong>{r.label}</strong><small>{r.detail}</small></span><Tag text={r.state||""}/><span className="pv2-chevron">{expanded==="s"+i?"−":"+"}</span></button>{expanded==="s"+i&&<div className="pv2-expanded-details"><Pairs data={[["Data de necessidade",r.extra||"—"],["Situação",r.state||"—"],["Vínculo","Plano de suprimentos fictício"]]}/></div>}</div>)}
      </Section>
      <div className="pv2-module-actions"><button className="pv2-secondary" onClick={()=>onNavigate("catalogo")}>Abrir catálogo de insumos <ArrowRight size={16}/></button></div>
    </>;break;
    case "catalogo": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Insumos de exemplo" value="05"/><ModuleStat label="Materiais" value="03"/><ModuleStat label="Mão de obra" value="01"/><ModuleStat label="Equipamentos" value="01"/></div>
      <Section title="Catálogo de referência"><div className="pv2-module-filter"><Search size={16}/><input aria-label="Buscar insumo" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Código, descrição ou unidade"/></div>
      <RowTable headers={["Código","Insumo","Unidade","Tipo"]} rows={catalog.filter(x=>matching(x.name+" "+x.id+" "+x.unit)).map(x=>[x.id,x.name,x.unit,x.kind])}/>
      <div className="pv2-softnote"><Package size={18}/> Referências apenas demonstrativas; sem preços reais, composições de mercado ou consulta ao banco.</div></Section>
    </>;break;
    case "documentos": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Documentos" value="04"/><ModuleStat label="Projetos" value="01"/><ModuleStat label="Em revisão" value="02"/><ModuleStat label="Aprovados" value="01"/></div>
      <Section title="Arquivo da obra" aside={<span className="pv2-muted-caption">Detalhes e versões sob demanda</span>}>
      {documents.map((d,i)=><div className="pv2-expand-row" key={d.id}><button onClick={()=>openRow("d"+i)} aria-expanded={expanded==="d"+i}><FileText size={20}/><span><strong>{d.name}</strong><small>{d.id} · {d.kind}</small></span><Tag text={d.state}/><span className="pv2-chevron">{expanded==="d"+i?"−":"+"}</span></button>{expanded==="d"+i&&<div className="pv2-expanded-details"><Pairs data={[["Versão",d.revision],["Atualização",d.date],["Fonte","Arquivo demonstrativo — sem download real"]]}/></div>}</div>)}
      </Section>
    </>;break;
    case "riscos": body=<>
      <div className="pv2-module-stats"><ModuleStat label="Riscos mapeados" value="03"/><ModuleStat label="Impacto alto" value="02"/><ModuleStat label="Mitigações" value="03"/><ModuleStat label="Escala" value="Qualitativa" foot="Fictícia"/></div>
      <div className="pv2-module-columns"><Section title="Registro e plano de resposta">
        {risks.map(r=><div className="pv2-expand-row" key={r.id}><button onClick={()=>openRow(r.id)} aria-expanded={expanded===r.id}><ShieldAlert size={19}/><span><strong>{r.name}</strong><small>{r.id} · {r.owner}</small></span><Tag text={r.impact}/><span className="pv2-chevron">{expanded===r.id?"−":"+"}</span></button>{expanded===r.id&&<div className="pv2-expanded-details"><Pairs data={[["Probabilidade",r.chance],["Impacto",r.impact],["Responsável",r.owner]]}/><p>{r.plan}</p></div>}</div>)}
      </Section><Section title="Matriz de criticidade"><div className="pv2-risk-matrix">{["Médio","Alto","Crítico","Baixo","Médio","Alto","Baixo","Baixo","Médio"].map((level,i)=><span key={i} className={"pv2-risk-cell pv2-risk-"+level.toLowerCase().replace("í","i")}>{level}</span>)}</div><p className="pv2-module-hint">Matriz ilustrativa 3 × 3 · probabilidade × impacto.</p></Section></div>
    </>;break;
    case "comando": body=<>
      <div className="pv2-softnote pv2-command-notice"><LockKeyhole size={19}/> Esta é apenas a maquete da Central de Comando. No sistema real o acesso continua restrito a administradores, com autorização no backend.</div>
      <div className="pv2-module-columns"><Section title="Assistente de planejamento"><div className="pv2-command"><div className="pv2-assistant-msg">Como posso ajudar a revisar a EAP, as dependências e os bloqueios do planejamento? Nesta demonstração, as respostas são exemplos locais.</div>{messages.map((msg,i)=><div key={i} className="pv2-command-conversation"><p><strong>Pergunta:</strong> {msg}</p><div className="pv2-assistant-msg">Exemplo de encaminhamento: confira o dicionário da EAP, valide precedências e aprove a versão antes da baseline. Nenhuma análise automática foi executada.</div></div>)}</div><form className="pv2-command-form" onSubmit={e=>{e.preventDefault();if(ask.trim()){setMessages(prev=>[...prev,ask.trim()]);setAsk("");}}}><input aria-label="Perguntar ao assistente" value={ask} onChange={e=>setAsk(e.target.value)} placeholder="Pergunte sobre o planejamento"/><button className="pv2-primary" disabled={!ask.trim()} type="submit">Enviar <ArrowUpRight size={15}/></button></form></Section>
      <Section title="Fluxo de decisões"><div className="pv2-checklist"><span><CheckCircle2 size={18}/> Inspecionar dados da obra</span><span><AlertTriangle size={18}/> Gerar proposta técnica</span><span><Layers3 size={18}/> Revisar com engenheiro</span><span><LockKeyhole size={18}/> Aprovar e criar baseline</span></div><button className="pv2-secondary pv2-wide" onClick={()=>onNavigate("eap")}>Voltar à EAP <ArrowRight size={16}/></button></Section></div>
    </>;break;
    default: body=null;
  }
  return <Scaffold module={module}>{body}</Scaffold>;
}
