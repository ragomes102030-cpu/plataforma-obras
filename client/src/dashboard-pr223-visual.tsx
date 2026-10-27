import * as React from "react";
import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { LayoutDashboard, Layers3, TreePine, ListTodo, GitBranch, Network, LockKeyhole, BarChart3, Activity, FileText, WalletCards, ClipboardList, ChevronLeft } from "lucide-react";
import { PainelDoCronograma } from "./components/PainelDoCronograma";
import "./planilha.css";
import "./dashboard-executivo.css";
import "./dashboard-pr223-visual.css";

const grupos=[
  {label:"VISÃO GERAL",rows:[{nome:"DASHBOARD",Icon:LayoutDashboard}]},
  {label:"PLANEJAMENTO",rows:[{nome:"ESCOPO",Icon:ClipboardList},{nome:"EAP",Icon:TreePine},{nome:"ATIVIDADES",Icon:ListTodo},{nome:"DEPENDÊNCIAS",Icon:GitBranch},{nome:"CPM / CAMINHO CRÍTICO",Icon:Network},{nome:"BASELINE",Icon:LockKeyhole}]},
  {label:"CRONOGRAMA",rows:[{nome:"GANTT",Icon:BarChart3},{nome:"LINHA DE BALANÇO",Icon:Activity}]},
  {label:"EXECUÇÃO E CONTROLE",rows:[{nome:"CONTROLE",Icon:Activity},{nome:"DOCUMENTOS",Icon:FileText},{nome:"ORÇAMENTO",Icon:WalletCards}]}
];
const agregado={
  inicio:"2026-10-01",fim:"2028-12-28",prazoDias:820,
  totalAtividades:53,
  avancoFisico:.151,avancoPlanejado:.292,
  linhasSemQuantidade:0,
  contagemPorStatus:{
    Concluido:10, "Em andamento":0,Atrasado:4,"Nao iniciado":39,
  }
};
const linhas=[{
  codigo:"1.1.3.3", pctReal:.151, pctPlanejado:.292, status:"Atrasado",
  fim:"2026-10-13"
}];
function App(){
  const [mensagem,setMensagem]=useState("");
  useEffect(()=>{
    const abrir=(e:Event)=>{
      const tab=(e as CustomEvent).detail?.aba||"módulo";
      setMensagem("Prévia somente visual: o módulo '"+tab+"' está disponível na Plataforma Obras, não nesta demonstração.");
    };
    window.addEventListener("abrir-aba",abrir);
    return ()=>window.removeEventListener("abrir-aba",abrir);
  },[]);
  return <div className="dv-app">
    <header className="dv-topo">
      <div className="dv-topo-linha"><div className="dv-marca"><Layers3 size={18}/> ARQUIMEDES <small>PRÉVIA DE INTERFACE</small></div>
        <span className="dv-topo-info">Dashboard · PR #223</span>
      </div>
      <div className="dv-obra"><span>OBRA DE REFERÊNCIA</span><strong>AURORA TESTE</strong><small>Somente demonstração, sem acesso ao banco</small></div>
    </header>
    <div className="dv-faixa"><strong>PRÉVIA VISUAL — DADOS ILUSTRATIVOS</strong><span>Este ambiente apresenta o componente real da PR #223, com dados estáticos baseados na captura da Aurora. Nenhuma informação é gravada.</span></div>
    <div className="dv-corpo">
      <aside className="dv-sidebar" aria-label="Menu ilustrativo">
        <nav>{grupos.map(g=><div className="dv-grupo" key={g.label}><span className="dv-grupo-titulo">{g.label}</span>{g.rows.map(({nome,Icon})=><button type="button" key={nome} className={nome==="DASHBOARD"?"ativo":""} onClick={()=>{if(nome!=="DASHBOARD")setMensagem("A prévia foi limitada ao Dashboard. Nenhuma outra aba será alterada.");else setMensagem("")}}><Icon size={14}/>{nome}</button>)}</div>)}</nav>
        <div className="dv-usuario"><span>R</span> Prévia de avaliação</div>
      </aside>
      <main className="dv-principal">
        {mensagem&&<div className="dv-aviso" role="status">{mensagem}<button onClick={()=>setMensagem("")} aria-label="Fechar aviso">×</button></div>}
        <PainelDoCronograma projetoId={7} nomeObra="AURORA TESTE" agregado={agregado as any} linhas={linhas as any} carregandoGrade={false} />
      </main>
    </div>
    <footer className="dv-bottom"><ChevronLeft size={14}/> Ambiente isolado para aprovação visual. Produção no Render permanece intacta.</footer>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
