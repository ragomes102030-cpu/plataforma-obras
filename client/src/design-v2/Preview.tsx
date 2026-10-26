import { useMemo, useState } from "react";
import {
  Activity as ActivityIcon, AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight,
  BarChart3, Building2, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, Clock3, FileText, FolderOpen, GitBranch, Layers3, LayoutDashboard,
  LockKeyhole, Menu, Moon, Plus, Search, Settings2, ShieldCheck, Sun,
  WalletCards, Package, ShieldAlert, Bot, X,
} from "lucide-react";
import {
  initialActivities, project, wbsItems, weeks,
  type Activity, type StageStatus, type WbsItem,
} from "./sample-data";
import ModuleGallery, {type GalleryModule} from "./ModuleGallery";
import {GRUPOS_V2} from "../modules/navegacao-v2";

type Section = "dashboard" | "planning" | "execution" | "costs" | "supplies" | "management" | "assistant";
type ModuleTab =
  | "escopo" | "eap" | "atividades" | "dependencias" | "cpm" | "baseline" | "gantt" | "linha-balanco"
  | "producao" | "curva-s" | "financeiro" | "suprimentos" | "catalogo" | "documentos" | "riscos" | "comando" | "dashboard";
type DetailTab = "summary" | "planning" | "links";
const navigation = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
  { id: "planning", label: "Planejamento", icon: Layers3 },
  { id: "execution", label: "Execução", icon: ActivityIcon },
  { id: "costs", label: "Custos", icon: WalletCards },
  { id: "supplies", label: "Suprimentos", icon: Package },
  { id: "management", label: "Gestão", icon: ShieldAlert },
] as const;
const tabs = [
  { id: "escopo", label: "Escopo" },
  { id: "eap", label: "EAP" },
  { id: "atividades", label: "Atividades" },
  { id: "dependencias", label: "Dependências" },
  { id: "cpm", label: "CPM" },
  { id: "baseline", label: "Versões e baseline" },
  { id: "gantt", label: "Cronograma" },
  { id: "linha-balanco", label: "Linha de Balanço" },
] as const;
const otherTabs = {
  execution: [{id:"producao",label:"Controle de produção"},{id:"curva-s",label:"Curva S"}],
  costs: [{id:"financeiro",label:"Orçamento e custos"}],
  supplies: [{id:"suprimentos",label:"Suprimentos"},{id:"catalogo",label:"Catálogo de insumos"}],
  management: [{id:"documentos",label:"Documentos"},{id:"riscos",label:"Riscos"}],
  assistant: [{id:"comando",label:"Central de Comando"}],
} as const;
const sectionDefaults:Record<Section,ModuleTab> = {
  dashboard:"dashboard",planning:"eap",execution:"producao",costs:"financeiro",
  supplies:"suprimentos",management:"documentos",assistant:"comando",
};
const sectionByGroup:Record<string,Section> = {
  "visao-geral":"dashboard",planejamento:"planning",execucao:"execution",
  custos:"costs",suprimentos:"supplies",gestao:"management",
};

function statusTone(label: string) {
  if (/Aprovada|Concluída|Em dia|Publicado/.test(label)) return "good";
  if (/Atrasada|Bloqueada|Crítico/.test(label)) return "danger";
  if (/Pendente|revisão|Atenção/.test(label)) return "warn";
  if (/andamento/.test(label)) return "blue";
  return "neutral";
}

function Status({ label }: { label: string }) {
  return <span className={"pv2-status pv2-status-" + statusTone(label)}><span className="pv2-status-dot" />{label}</span>;
}

function MiniProgress({ value, tone = "brand" }: { value: number; tone?: "brand" | "good" | "danger" }) {
  return <div className="pv2-meter" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span className={"pv2-meter-fill pv2-fill-" + tone} style={{ width: value + "%" }} /></div>;
}

function Metric({ eyebrow, value, note, icon: Icon, children }: {
  eyebrow: string; value: string; note: string; icon: typeof CalendarDays; children?: React.ReactNode;
}) {
  return <article className="pv2-metric">
    <div className="pv2-metric-header"><span>{eyebrow}</span><Icon size={17} strokeWidth={1.8}/></div>
    <strong>{value}</strong><p>{note}</p>{children}
  </article>;
}

export default function Preview() {
  const [section, setSection] = useState<Section>("dashboard");
  const [activeTab, setActiveTab] = useState<ModuleTab>("eap");
  const [dark, setDark] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [portfolio, setPortfolio] = useState(false);
  const [version, setVersion] = useState<"V3" | "V2">("V3");
  const [expanded, setExpanded] = useState(["1.1", "1.2", "1.3", "1.4"]);
  const [selectedWbs, setSelectedWbs] = useState("1.3.1");
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [toast, setToast] = useState("");
  const [compare, setCompare] = useState(false);
  const baselineBlocked = version === "V3";

  const shownWbs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const parentsWithMatch = new Set(wbsItems.filter(item =>
      item.name.toLocaleLowerCase("pt-BR").includes(query) || item.code.includes(query)
    ).map(item => item.parent).filter((x): x is string => Boolean(x)));
    return wbsItems.filter(item => {
      const matching = !query || item.name.toLocaleLowerCase("pt-BR").includes(query)
        || item.code.includes(query) || parentsWithMatch.has(item.code);
      const visible = !item.parent || expanded.includes(item.parent) || Boolean(query);
      return matching && visible;
    });
  }, [search, expanded]);

  const shownActivities = useMemo(() => activities.filter(a =>
    (statusFilter === "Todas" || a.status === statusFilter) &&
    (!search || (a.name + " " + a.code + " " + a.eap).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
  ), [activities, statusFilter, search]);

  function go(sectionId: Section, tab?: ModuleTab) {
    setSection(sectionId);
    setSideOpen(false);
    setSearch("");
    setActiveTab(tab ?? sectionDefaults[sectionId]);
  }
  function openModule(id: string) {
    if (id === "comando") { go("assistant","comando"); return; }
    const area = GRUPOS_V2.find(grupo => (grupo.abas as readonly string[]).includes(id));
    if (area) go(sectionByGroup[area.id], id as ModuleTab);
  }
  function startEdit(activity: Activity) {
    setSelectedActivity({ ...activity });
    setDetailTab("summary");
  }
  function addMockActivity() {
    const id = "AT-" + String(activities.length + 1).padStart(3, "0");
    const activity: Activity = {
      id, code: "A" + String(activities.length + 1).padStart(2, "0"),
      name: "Nova atividade demonstrativa", eap: "1.3.2", duration: 5,
      start: "25/01/2027", end: "29/01/2027", progress: 0,
      status: "Não iniciada", critical: false, offset: 10, span: 2,
      owner: "A definir", predecessor: "—", description: "Exemplo sem persistência.",
    };
    setActivities(prev => [...prev, activity]);
    startEdit(activity);
    setToast("Atividade criada apenas na memória da prévia.");
  }
  function saveMockActivity() {
    if (!selectedActivity || !selectedActivity.name.trim() || selectedActivity.duration < 1) {
      setToast("Informe um nome e uma duração maior que zero.");
      return;
    }
    const next: Activity = {
      ...selectedActivity,
      name: selectedActivity.name.trim(),
      progress: Math.min(100, Math.max(0, selectedActivity.progress)),
    };
    setActivities(prev => prev.map(a => a.id === next.id ? next : a));
    setSelectedActivity(null);
    setToast("Alteração demonstrativa salva nesta sessão. Nenhum dado foi enviado.");
  }
  const currentWbs = wbsItems.find(item => item.code === selectedWbs);
  const linkedActivity = activities.find(item => item.eap === selectedWbs);
  const currentSection = section==="assistant"?"Central de Comando":navigation.find(n => n.id === section)?.label ?? "Visão geral";

  return <div className="pv2" data-theme={dark ? "dark" : "light"}>
    <div className="pv2-shell">
      <aside className={"pv2-sidebar" + (sideOpen ? " pv2-sidebar-open" : "")}>
        <div className="pv2-brand">
          <span className="pv2-brandmark"><Building2 size={22} strokeWidth={1.8}/></span>
          <div><strong>Plataforma Obras</strong><small>Planejamento e controle</small></div>
          <button className="pv2-icon pv2-close-nav" aria-label="Fechar menu" onClick={() => setSideOpen(false)}><X size={18}/></button>
        </div>
        <div className="pv2-workspace">
          <span className="pv2-overline">AMBIENTE DEMONSTRATIVO</span>
          <strong>{project.name}</strong>
          <small>{project.code}</small>
        </div>
        <nav aria-label="Navegação principal" className="pv2-navigation">
          {navigation.map(item => {
            const Icon = item.icon;
            return <button key={item.id} onClick={() => { setPortfolio(false); go(item.id); }} className={"pv2-navitem" + (section === item.id && !portfolio ? " pv2-navactive" : "")} aria-current={section === item.id && !portfolio ? "page" : undefined}>
              <Icon size={19} strokeWidth={1.85}/><span>{item.label}</span>
              {item.id === "planning" && <span className="pv2-navcount">8</span>}
            </button>;
          })}
        </nav>
        <div className="pv2-sidebar-bottom">
          <button type="button" className={"pv2-assistant-link"+(section==="assistant"?" pv2-navactive":"")} onClick={()=>{setPortfolio(false);go("assistant","comando");}}><Bot size={18}/> Central de Comando <small>Prévia de IA</small></button>
          <div className="pv2-safety"><ShieldCheck size={17}/><span>Modo demonstração<br/><small>Sem acesso ao banco de dados</small></span></div>
          <button className="pv2-exit" onClick={() => { setPortfolio(true); setSideOpen(false); }}><ArrowLeft size={17}/> Sair da obra</button>
        </div>
      </aside>

      {sideOpen && <button className="pv2-shade" aria-label="Fechar navegação" onClick={() => setSideOpen(false)}/>}
      <div className="pv2-content">
        <header className="pv2-topbar">
          <div className="pv2-top-left">
            <button className="pv2-icon pv2-menu" aria-label="Abrir menu" onClick={() => setSideOpen(true)}><Menu size={21}/></button>
            <div className="pv2-crumb">Plataforma Obras <ChevronRight size={14}/> {portfolio ? "Obras" : project.name} <ChevronRight size={14}/> <strong>{portfolio ? "Portfólio" : currentSection}</strong></div>
          </div>
          <div className="pv2-top-actions">
            <span className="pv2-demo-pill"><span/> Prévia V2 · dados fictícios</span>
            <button className="pv2-icon pv2-theme-toggle" onClick={() => setDark(v => !v)} title={dark ? "Usar tema claro" : "Usar tema escuro"} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
            <span className="pv2-avatar" title="Usuário demonstrativo">PO</span>
          </div>
        </header>
        <main className="pv2-main">
          {portfolio ? <section className="pv2-portfolio pv2-panel">
            <span className="pv2-eyebrow">PORTFÓLIO · DEMONSTRAÇÃO</span>
            <h1>Obras</h1>
            <p>Escolha uma obra antes de entrar no ambiente de planejamento.</p>
            <button className="pv2-project-card" onClick={() => { setPortfolio(false); go("dashboard"); }}>
              <span className="pv2-project-icon"><Building2 size={24}/></span><span><strong>{project.name}</strong><small>{project.location} · {project.code}</small></span><ArrowUpRight size={21}/>
            </button>
          </section> : <>
            {section === "dashboard" && <section>
              <div className="pv2-pagehead">
                <div><span className="pv2-eyebrow">PAINEL DA OBRA</span><h1>{project.name}</h1><p>{project.code} <span className="pv2-bullet">·</span> {project.location} <span className="pv2-bullet">·</span> {project.description}</p></div>
                <button className="pv2-primary" onClick={() => go("planning", "eap")}>Continuar planejamento <ArrowRight size={18}/></button>
              </div>
              <div className="pv2-metrics">
                <Metric eyebrow="Avanço físico" value="38%" note="Meta da demonstração: 42%" icon={BarChart3}><MiniProgress value={38}/></Metric>
                <Metric eyebrow="Prazo da obra" value="241 dias" note={project.start + " — " + project.finish} icon={CalendarDays}><div className="pv2-metric-foot">Cronograma preliminar</div></Metric>
                <Metric eyebrow="Pacotes da EAP" value="4 de 8" note="4 pacotes exigem revisão" icon={Layers3}><MiniProgress value={50}/></Metric>
                <Metric eyebrow="Situação da baseline" value="Pendente" note="Aguardando aprovação da EAP" icon={LockKeyhole}><div className="pv2-metric-foot pv2-text-warning">1 bloqueio de planejamento</div></Metric>
              </div>
              <div className="pv2-dashboard-layout">
                <div className="pv2-dashboard-primary">
                  <article className="pv2-panel pv2-next">
                    <div className="pv2-panel-label">PRÓXIMA AÇÃO RECOMENDADA <span className="pv2-inline-dot"/></div>
                    <div className="pv2-next-inner">
                      <div className="pv2-next-symbol"><Layers3 size={23}/></div>
                      <div><h2>Revisar os pacotes pendentes da EAP</h2><p>Conclua a versão de trabalho antes de aprovar uma nova baseline.</p><div className="pv2-next-meta"><span>Etapa 2 de 6</span><span>·</span><span>4 pendências</span></div></div>
                      <button className="pv2-secondary" onClick={() => go("planning", "eap")}>Abrir EAP <ArrowUpRight size={16}/></button>
                    </div>
                    <div className="pv2-steps">
                      {["Escopo", "EAP", "Quantitativos", "Atividades", "CPM", "Baseline"].map((step,i) => <div key={step} className={"pv2-step" + (i === 1 ? " pv2-step-current" : "") + (i === 0 ? " pv2-step-done" : "")}><span>{i===0 ? <Check size={12}/> : String(i+1)}</span>{step}</div>)}
                    </div>
                  </article>
                  <article className="pv2-panel pv2-milestones">
                    <div className="pv2-section-title"><div><h2>Visão do cronograma</h2><p>Próximas frentes · representação simplificada</p></div><button className="pv2-link" onClick={() => go("planning", "gantt")}>Abrir Gantt <ArrowRight size={16}/></button></div>
                    <div className="pv2-snapshot">
                      <div className="pv2-snapshot-gridhead"><span></span>{["NOV", "DEZ", "JAN", "FEV", "MAR", "ABR"].map(m => <span key={m}>{m}</span>)}</div>
                      {[
                        {name:"Mobilização", start:1, end:2, t:"good"},
                        {name:"Infraestrutura",start:2,end:4,t:"brand"},
                        {name:"Estrutura",start:4,end:6,t:"brand"},
                        {name:"Instalações",start:5,end:7,t:"neutral"},
                      ].map(row => <div className="pv2-snapshot-row" key={row.name}><span>{row.name}</span><div className="pv2-snapshot-track"><span className={"pv2-snapshot-bar pv2-bar-" + row.t} style={{gridColumn: row.start + " / " + row.end}}/></div></div>)}
                    </div>
                  </article>
                </div>
                <aside className="pv2-dashboard-aside">
                  <article className="pv2-panel">
                    <div className="pv2-section-title"><h2>Pontos de atenção</h2><span className="pv2-count">3</span></div>
                    <div className="pv2-alert"><span className="pv2-alert-icon pv2-alert-critical"><LockKeyhole size={17}/></span><div><strong>Baseline bloqueada</strong><p>A versão V3 da EAP precisa de aprovação.</p><button onClick={() => go("planning", "baseline")}>Ver versões <ArrowRight size={14}/></button></div></div>
                    <div className="pv2-alert"><span className="pv2-alert-icon"><AlertCircle size={17}/></span><div><strong>4 pacotes para revisar</strong><p>Escopo e critérios de conclusão.</p><button onClick={() => go("planning", "eap")}>Revisar EAP <ArrowRight size={14}/></button></div></div>
                    <div className="pv2-alert"><span className="pv2-alert-icon"><Clock3 size={17}/></span><div><strong>Atividade com atraso</strong><p>Blocos de fundação · exemplo.</p><button onClick={() => { go("planning", "gantt"); startEdit(activities[3]); }}>Abrir atividade <ArrowRight size={14}/></button></div></div>
                  </article>
                  <article className="pv2-panel pv2-summary">
                    <h2>Resumo do planejamento</h2>
                    {[
                      ["EAP","Em revisão","eap"],
                      ["Atividades","Em andamento","gantt"],
                      ["Dependências","Em andamento","dependencias"],
                      ["Baseline","Bloqueada","baseline"]
                    ].map(([label,status,tab]) => <button className="pv2-summary-row" key={label} onClick={() => go("planning", tab as ModuleTab)}><span>{label}</span><Status label={status}/><ChevronRight size={16}/></button>)}
                  </article>
                </aside>
              </div>
            </section>}

            {section === "planning" && <section>
              <div className="pv2-pagehead pv2-planning-head">
                <div><span className="pv2-eyebrow">ÁREA DE TRABALHO</span><h1>Planejamento</h1><p>EAP, atividades e cronograma em um único contexto.</p></div>
                <div className="pv2-head-actions">
                  <label className="pv2-version">Versão EAP <select aria-label="Versão da EAP" value={version} onChange={e=>setVersion(e.target.value as "V3"|"V2")}><option value="V3">V3 · Em revisão</option><option value="V2">V2 · Aprovada</option></select></label>
                  <button className="pv2-primary" onClick={addMockActivity}><Plus size={18}/> Nova atividade</button>
                </div>
              </div>
              <div className={"pv2-gate " + (baselineBlocked ? "pv2-gate-blocked" : "pv2-gate-approved")}>
                {baselineBlocked ? <LockKeyhole size={19}/> : <CheckCircle2 size={19}/>}
                <div><strong>{baselineBlocked ? "Baseline bloqueada nesta versão" : "Versão de referência aprovada"}</strong><span>{baselineBlocked ? "Conclua a revisão da EAP antes da captura. Este aviso acompanha todas as abas." : "Versão anterior usada somente para explorar o protótipo."}</span></div>
                <button onClick={() => setActiveTab(baselineBlocked ? "eap" : "baseline")}>{baselineBlocked ? "Ir para EAP" : "Ver baseline"} <ArrowRight size={15}/></button>
              </div>
              <div className="pv2-tabstrip" role="tablist" aria-label="Áreas de planejamento">
                {tabs.map(tab => <button role="tab" aria-selected={activeTab === tab.id} className={activeTab===tab.id ? "pv2-tab-active" : ""} key={tab.id} onClick={() => {setActiveTab(tab.id);setSearch("");}}>{tab.label}</button>)}
              </div>
              {(activeTab === "eap" || activeTab === "gantt") && <div className="pv2-toolbar">
                <label className="pv2-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={activeTab === "eap" ? "Buscar código ou pacote da EAP" : "Buscar atividade ou código"} aria-label="Buscar"/></label>
                <div className="pv2-toolbar-right">
                  {activeTab === "eap" ? <span className="pv2-muted-caption">12 itens · 4 fases</span> :
                    <select className="pv2-select" aria-label="Filtrar por situação" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
                      {["Todas","Concluída","Em andamento","Não iniciada","Atrasada"].map(t=><option key={t}>{t}</option>)}
                    </select>}
                </div>
              </div>}

              {activeTab === "eap" && <div className="pv2-planning-grid">
                <div className="pv2-panel pv2-eap-panel">
                  <div className="pv2-table-scroll">
                    <table className="pv2-table"><thead><tr><th className="pv2-code">Código</th><th>Estrutura da obra</th><th>Tipo</th><th>Situação</th></tr></thead>
                      <tbody>{shownWbs.map(item => <tr key={item.code} className={(item.code===selectedWbs ? "pv2-row-selected " : "") + (item.type === "Fase" ? "pv2-row-phase" : "")} onClick={()=>setSelectedWbs(item.code)}>
                        <td className="pv2-code"><span className="pv2-eap-code">{item.type==="Fase" && <button aria-label={(expanded.includes(item.code) ? "Recolher " : "Expandir ") + item.name} onClick={e=>{e.stopPropagation();setExpanded(prev=>prev.includes(item.code)?prev.filter(c=>c!==item.code):[...prev,item.code]);}}>{expanded.includes(item.code)?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>}{item.type==="Pacote" && <span className="pv2-eap-indent"/>}{item.code}</span></td>
                        <td><button className="pv2-name-button" onClick={()=>setSelectedWbs(item.code)}>{item.name}</button></td>
                        <td className="pv2-dim">{item.type}</td>
                        <td><Status label={item.status}/></td>
                      </tr>)}</tbody></table>
                    {shownWbs.length===0 && <div className="pv2-empty">Nenhum pacote corresponde à busca.</div>}
                  </div>
                </div>
                <aside className="pv2-panel pv2-inspector">
                  <span className="pv2-eyebrow">DETALHES DO ITEM</span>
                  <h2>{currentWbs?.name ?? "Selecione um item"}</h2>
                  {currentWbs && <>
                    <div className="pv2-inspector-meta"><span>{currentWbs.code} · {currentWbs.type}</span><Status label={currentWbs.status}/></div>
                    <div className="pv2-info-block"><small>Critério de conclusão</small><p>{currentWbs.completion}</p></div>
                    <div className="pv2-info-block"><small>Versão em visualização</small><p>{version} · {baselineBlocked ? "Em revisão" : "Aprovada"}</p></div>
                    <div className="pv2-info-block"><small>Atividade vinculada</small><p>{linkedActivity ? linkedActivity.name : "Nenhuma atividade neste exemplo."}</p></div>
                    {linkedActivity && <button className="pv2-secondary pv2-wide" onClick={()=>startEdit(linkedActivity)}>Abrir detalhe da atividade <ArrowUpRight size={16}/></button>}
                  </>}
                </aside>
              </div>}

              {activeTab === "gantt" && <div className="pv2-panel pv2-gantt-wrap">
                <div className="pv2-gantt-header"><div><h2>Cronograma de atividades</h2><p>Selecione uma atividade para ver ou editar seus detalhes.</p></div>
                  <label className="pv2-check"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/> Sobrepor referência</label>
                </div>
                <div className="pv2-gantt-scroll"><div className="pv2-gantt-inner">
                  <div className="pv2-gantt-labelhead">Atividade <span>Duração</span></div>
                  <div className="pv2-gantt-weeks">{weeks.map(w=><span key={w}>{w}</span>)}</div>
                  {shownActivities.map(a=><div key={a.id} className="pv2-gantt-row">
                    <button className="pv2-gantt-task" onClick={()=>startEdit(a)}><span><strong>{a.name}</strong><small>{a.eap} · {a.code}</small></span><span className="pv2-dur">{a.duration}d</span></button>
                    <div className="pv2-gantt-track" onClick={()=>startEdit(a)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter")startEdit(a);}} aria-label={"Detalhar " + a.name}>
                      {compare && <span className="pv2-baseline-bar" style={{gridColumn:(a.offset+1) + " / span " + a.span}}/>}
                      <span className={"pv2-activity-bar pv2-activity-" + statusTone(a.status)} style={{gridColumn:(a.offset+1) + " / span " + a.span}}>
                        {a.progress > 0 && <span style={{width:a.progress+"%"}}/>}
                      </span>
                    </div>
                  </div>)}
                  {shownActivities.length === 0 && <div className="pv2-empty">Nenhuma atividade encontrada.</div>}
                </div></div>
                <div className="pv2-gantt-legend"><span><i className="pv2-leg-blue"/> Planejado</span><span><i className="pv2-leg-green"/> Concluído</span><span><i className="pv2-leg-red"/> Atraso</span><span><i className="pv2-leg-outline"/> Referência (opcional)</span></div>
              </div>}

              {activeTab === "dependencias" && <div className="pv2-panel pv2-tall-panel">
                <div className="pv2-section-title"><div><h2>Relações entre atividades</h2><p>Somente os vínculos essenciais nesta visualização.</p></div><GitBranch size={21}/></div>
                <div className="pv2-table-scroll"><table className="pv2-table"><thead><tr><th>Predecessora</th><th>Tipo</th><th>Sucessora</th><th>Defasagem</th></tr></thead>
                  <tbody>{activities.filter(a=>a.predecessor!=="—").map(a=><tr key={a.id}><td>{activities.find(x=>x.id===a.predecessor)?.name??a.predecessor}</td><td>TI</td><td><button className="pv2-name-button" onClick={()=>startEdit(a)}>{a.name}</button></td><td>0 dia</td></tr>)}</tbody></table></div>
                <p className="pv2-helper">TI = término–início. Relações fictícias; o motor CPM do sistema real não é executado nesta prévia.</p>
              </div>}

              {activeTab === "baseline" && <div className="pv2-panel pv2-tall-panel">
                <div className="pv2-section-title"><div><h2>Versões e baseline</h2><p>Histórico simplificado da aprovação.</p></div><LockKeyhole size={21}/></div>
                <div className="pv2-version-cards">
                  <button onClick={()=>setVersion("V3")} className={"pv2-version-card" + (version==="V3"?" pv2-version-selected":"")}><strong>Versão V3 <Status label="Em revisão"/></strong><p>Versão de trabalho · revisão dos pacotes</p><small>Não permite capturar uma baseline</small></button>
                  <button onClick={()=>setVersion("V2")} className={"pv2-version-card" + (version==="V2"?" pv2-version-selected":"")}><strong>Versão V2 <Status label="Aprovada"/></strong><p>Versão histórica · referência demonstrativa</p><small>Comparável, sem alterações nos dados reais</small></button>
                </div>
                <div className="pv2-softnote"><AlertCircle size={18}/> Todas as aprovações, datas e bloqueios são simulados. A regra real permanece sob responsabilidade do backend.</div>
              </div>}
              {(["escopo","atividades","cpm","linha-balanco"] as string[]).includes(activeTab) && (
                <ModuleGallery key={activeTab} module={activeTab as GalleryModule}
                  activities={activities} onOpenActivity={startEdit} onNavigate={openModule}/>
              )}
            </section>}

            {section !== "dashboard" && section !== "planning" && (
              <section>
                <div className="pv2-tabstrip pv2-extra-tabs" role="tablist" aria-label="Ferramentas da área atual">
                  {otherTabs[section].map(tab => (
                    <button type="button" key={tab.id} role="tab" aria-selected={activeTab===tab.id}
                      className={activeTab===tab.id?"pv2-tab-active":""}
                      onClick={()=>{setActiveTab(tab.id);setSearch("");}}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <ModuleGallery key={activeTab} module={activeTab as GalleryModule}
                  activities={activities} onOpenActivity={startEdit} onNavigate={openModule}/>
              </section>
            )}
          </>}
        </main>
      </div>
    </div>
    {selectedActivity && <div className="pv2-drawer-layer">
      <button className="pv2-drawer-overlay" onClick={()=>setSelectedActivity(null)} aria-label="Fechar detalhes"/>
      <aside className="pv2-drawer" role="dialog" aria-modal="true" aria-label="Detalhe da atividade">
        <div className="pv2-drawer-top"><div><span className="pv2-eyebrow">ATIVIDADE · DEMONSTRAÇÃO</span><h2>{selectedActivity.name}</h2><div><span className="pv2-dim">{selectedActivity.id} · EAP {selectedActivity.eap}</span></div></div><button className="pv2-icon" aria-label="Fechar painel" onClick={()=>setSelectedActivity(null)}><X size={20}/></button></div>
        <div className="pv2-drawer-tabs" role="tablist" aria-label="Detalhes da atividade">{([{id:"summary",label:"Resumo"},{id:"planning",label:"Planejamento"},{id:"links",label:"Vínculos"}] as const).map(tab=><button key={tab.id} role="tab" aria-selected={detailTab===tab.id} className={detailTab===tab.id?"pv2-tab-active":""} onClick={()=>setDetailTab(tab.id)}>{tab.label}</button>)}</div>
        <div className="pv2-drawer-body">
          {detailTab==="summary" && <>
            <label className="pv2-field">Nome da atividade<input value={selectedActivity.name} onChange={e=>setSelectedActivity({...selectedActivity,name:e.target.value})}/></label>
            <div className="pv2-field-grid"><label className="pv2-field">Código<input value={selectedActivity.code} readOnly/></label><label className="pv2-field">Pacote EAP<input value={selectedActivity.eap} readOnly/></label></div>
            <label className="pv2-field">Descrição<textarea rows={4} value={selectedActivity.description} onChange={e=>setSelectedActivity({...selectedActivity,description:e.target.value})}/></label>
            <label className="pv2-field">Responsável<input value={selectedActivity.owner} onChange={e=>setSelectedActivity({...selectedActivity,owner:e.target.value})}/></label>
            <div className="pv2-field">Situação <Status label={selectedActivity.status}/></div>
          </>}
          {detailTab==="planning" && <>
            <div className="pv2-field-grid"><label className="pv2-field">Início previsto<input value={selectedActivity.start} readOnly/></label><label className="pv2-field">Término previsto<input value={selectedActivity.end} readOnly/></label></div>
            <label className="pv2-field">Duração (dias)<input type="number" min={1} max={365} value={selectedActivity.duration} onChange={e=>setSelectedActivity({...selectedActivity,duration:Number(e.target.value)})}/></label>
            <label className="pv2-field">Avanço físico (%)<input type="number" min={0} max={100} value={selectedActivity.progress} onChange={e=>setSelectedActivity({...selectedActivity,progress:Number(e.target.value)})}/></label>
            <MiniProgress value={selectedActivity.progress}/>
            <div className="pv2-softnote"><CalendarDays size={18}/> Datas são apenas de leitura. Nenhum cálculo de datas ou CPM é executado no protótipo.</div>
          </>}
          {detailTab==="links" && <>
            <div className="pv2-info-block"><small>Pacote de trabalho</small><p>{wbsItems.find(i=>i.code===selectedActivity.eap)?.name ?? "Não encontrado"}</p></div>
            <div className="pv2-info-block"><small>Predecessora</small><p>{selectedActivity.predecessor==="—"?"Nenhuma":activities.find(a=>a.id===selectedActivity.predecessor)?.name ?? selectedActivity.predecessor}</p></div>
            <div className="pv2-info-block"><small>Caminho crítico</small><p>{selectedActivity.critical?"Atividade crítica (simulação)":"Não crítica (simulação)"}</p></div>
            <div className="pv2-softnote"><GitBranch size={18}/> Os vínculos técnicos e folgas reais não são recalculados aqui.</div>
          </>}
        </div>
        <div className="pv2-drawer-footer"><button className="pv2-secondary" onClick={()=>setSelectedActivity(null)}>Cancelar</button><button className="pv2-primary" onClick={saveMockActivity}><Check size={17}/> Salvar na prévia</button></div>
      </aside>
    </div>}
    {toast && <div className="pv2-toast" role="status"><CheckCircle2 size={19}/><span>{toast}</span><button onClick={()=>setToast("")} aria-label="Dispensar mensagem"><X size={16}/></button></div>}
  </div>;
}

function SimpleSection({eyebrow,title,subtitle,icon,children}: {eyebrow:string;title:string;subtitle:string;icon:React.ReactNode;children:React.ReactNode}) {
  return <section><div className="pv2-pagehead"><div><span className="pv2-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div><span className="pv2-simple-icon">{icon}</span></div><article className="pv2-panel pv2-simple-content">{children}</article></section>;
}
