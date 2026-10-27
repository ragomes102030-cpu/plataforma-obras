import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {ControlTowerDashboard} from "./components/ControlTowerDashboard";
import {montarResumo} from "@shared/painel-obra";
import {Layers3,LayoutDashboard,ClipboardList,TreePine,ListTodo,GitBranch,Network,BarChart3,Activity,Wallet,ChevronDown,Menu,X} from "lucide-react";
import "./control-tower-qa.css";

const hoje="2026-10-27";
const resumo=montarResumo({
  hoje,inicio:"2026-10-01",fim:"2028-12-28",
  fisico:{real:.151,planejado:.292},
  status:{total:53,concluidas:10,emAndamento:0,atrasadas:4,naoIniciadas:39},
  valor:{total:5200000,distribuido:5200000,executado:785200},
  alertas:{atrasadas:4,maiorAtrasoDias:14,foraDoPlano:2,bloqueadas:3,ppc:null,atrasoBaselineDias:null}
});
const alertas=[
  {id:"fora-plano",nivel:"critico" as const,titulo:"2 lançamentos em versão anterior",detalhe:"Lançamentos associados a uma versão anterior da EAP exigem conferência de vínculo.",aba:"producao",acao:"Revisar lançamentos"},
  {id:"atraso",nivel:"critico" as const,titulo:"4 atividades com atraso",detalhe:"Identifique no Gantt os serviços com término vencido.",aba:"gantt",acao:"Abrir Gantt"},
  {id:"restricao",nivel:"atencao" as const,titulo:"3 restrições abertas",detalhe:"Verifique a programação semanal antes de liberar frentes.",aba:"producao",acao:"Ver restrições"},
];
const nav=[
  {name:"Dashboard",id:"dashboard",Icon:LayoutDashboard},
  {name:"Escopo",id:"escopo",Icon:ClipboardList},
  {name:"EAP",id:"eap",Icon:TreePine},
  {name:"Atividades",id:"atividades",Icon:ListTodo},
  {name:"CPM",id:"cpm",Icon:Network},
  {name:"Gantt",id:"gantt",Icon:BarChart3},
  {name:"Linha de Balanço",id:"linha-balanco",Icon:Activity},
  {name:"Produção",id:"producao",Icon:ClipboardList},
  {name:"Orçamento",id:"financeiro",Icon:Wallet},
  {name:"Curva S",id:"curva-s",Icon:GitBranch},
];
const semana={numero:4,inicio:"2026-10-26",fim:"2026-10-30",compromissos:0,atividades:[
  {id:101,wbsCode:"1.2.4",name:"Alvenaria e fechamentos",startIso:"2026-10-12",finishIso:"2026-10-30",openConstraints:1},
  {id:102,wbsCode:"1.3.2",name:"Instalações preliminares",startIso:"2026-10-21",finishIso:"2026-11-02",openConstraints:0},
]};
const ultimos=[
 {id:1,data:"2026-10-21",codigo:"1.6.1",atividade:"Estrutura da cobertura",quantidade:18,unidade:"m²",situacao:"confirmada"},
 {id:2,data:"2026-10-21",codigo:"1.4.2",atividade:"Alvenaria e fechamentos",quantidade:21,unidade:"m²",situacao:"fora do plano"},
];
function App(){
 const [pagina,setPagina]=useState("dashboard");
 const [menu,setMenu]=useState(false);
 const [aviso,setAviso]=useState("");
 function abrirAba(aba:string){
   setPagina(aba);
   setMenu(false);
   setAviso(aba==="dashboard"?"":"A navegação foi acionada corretamente para "+(nav.find(n=>n.id===aba)?.name??aba)+". Nesta QA apenas o Dashboard está montado.");
 }
 useEffect(()=>{const listener=(ev:Event)=>abrirAba((ev as CustomEvent<{aba:string}>).detail?.aba??"dashboard");window.addEventListener("abrir-aba",listener);return()=>window.removeEventListener("abrir-aba",listener)},[]);
 return <div className="ctq-app">
  <header className="ctq-top"><div className="ctq-logo"><Layers3 size={21}/><strong>ARQUIMEDES</strong><small>CONTROL TOWER / QA</small></div><span>OBRA ATIVA · <strong>AURORA TESTE</strong></span><span className="ctq-right">27 OUT 2026 <button onClick={()=>setMenu(!menu)} aria-label="Abrir navegação" aria-expanded={menu}>{menu?<X size={17}/>:<Menu size={17}/>}</button></span></header>
  <div className="ctq-banner" role="note"><strong>PR #224 — PRÉVIA DE REVISÃO</strong> · Este é o componente real da branch de integração, renderizado com dados de demonstração. Sem conexão com a AURORA TESTE real, a API ou o banco.</div>
  <div className="ctq-body">
   <aside className={"ctq-nav"+(menu?" open":"")}><div className="ctq-nav-label">NAVEGAÇÃO DA OBRA</div>{nav.map(({name,id,Icon})=><button className={pagina===id?"active":""} key={id} onClick={()=>abrirAba(id)}><Icon size={15}/>{name}</button>)}<div className="ctq-nav-foot">Ambiente isolado · Não salva dados</div></aside>
   <main className="ctq-main">
     {aviso&&<div className="ctq-notice" role="status">{aviso} <button onClick={()=>{setPagina("dashboard");setAviso("")}}>Voltar ao Dashboard</button></div>}
     {pagina==="dashboard"?<ControlTowerDashboard
       projetoId={1} nomeObra="AURORA TESTE" hoje={hoje}
       resumo={resumo} alertas={alertas} valorSemDestino={0}
       semana={semana} ultimos={ultimos} ppc={null} bloqueadas={3} compromissosPendentes={0}
       carregandoComplementos={false} erroComplementos={false}
       orcamentoEstado="ok" producaoEstado="ok" semanaEstado="ok"
       abrirAba={abrirAba}
     />:<div className="ctq-destino"><h2>{nav.find(n=>n.id===pagina)?.name??pagina}</h2><p>Destino de navegação verificado. O módulo real permanece na Plataforma Obras autenticada.</p><button onClick={()=>abrirAba("dashboard")}>Voltar ao Dashboard</button></div>}
   </main>
  </div>
 </div>
}
createRoot(document.getElementById("root")!).render(<App/>);
