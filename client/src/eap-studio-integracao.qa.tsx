import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {AbaEap} from "./components/AbaEap";
import "./eap.css";
import "./workspace-planejamento.css";
import "./escopo-eap-studio.css";
import "./eap-studio-integracao.qa.css";
function App(){
 const [tab,setTab]=useState("eap"),[info,setInfo]=useState("");
 useEffect(()=>{
  const nav=(event:Event)=>{const aba=(event as CustomEvent<{aba:string}>).detail?.aba;setTab(aba??"eap");setInfo("Navegação de leitura simulada para "+aba+".");};
  const agent=()=>setInfo("Arquimedes acionado. No ambiente isolado, nenhuma operação é executada.");
  window.addEventListener("abrir-aba",nav);
  window.addEventListener("abrir-arquimedes",agent);
  return()=>{window.removeEventListener("abrir-aba",nav);window.removeEventListener("abrir-arquimedes",agent)};
 },[]);
 return <div className="studio-qa">
 <header><strong>ARQUIMEDES</strong><span>OBRA ATIVA · AURORA TESTE</span><b>QA · SOMENTE LEITURA</b></header>
 <aside className="banner">Este é o componente React real da PR #226, com dados de exemplo de 17 elementos e mutações bloqueadas. Não é a Aurora real e não representa a base completa de 69 nós.</aside>
 <div className="studio-cols">
  <nav aria-label="Navegação de demonstração"><button onClick={()=>setTab("escopo")} className={tab==="escopo"?"ativo":""}>01 · Escopo</button><button onClick={()=>setTab("eap")} className={tab==="eap"?"ativo":""}>02 · EAP</button><button onClick={()=>setTab("atividades")} className={tab==="atividades"?"ativo":""}>03 · Atividades</button><button onClick={()=>setTab("financeiro")} className={tab==="financeiro"?"ativo":""}>Orçamento</button><button onClick={()=>setTab("cpm")} className={tab==="cpm"?"ativo":""}>CPM</button></nav>
  <main className="planejamento-area">
   {info&&<div className="studio-notice" role="status">{info}</div>}
   {tab==="eap"?<AbaEap projetoId={7}/>:<div className="studio-placeholder"><h1>{tab==="escopo"?"Escopo":tab.toUpperCase()}</h1><p>O destino de navegação foi acionado. Esta prévia monta somente o componente EAP real. As abas completas permanecem no Arquimedes autenticado.</p><button onClick={()=>setTab("eap")}>Voltar à EAP</button></div>}
  </main>
 </div></div>;
}
createRoot(document.getElementById("root")!).render(<App/>);