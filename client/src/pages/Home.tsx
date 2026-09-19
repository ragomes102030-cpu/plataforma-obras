import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  FolderKanban,
  Gauge,
  Layers3,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

const nav = [
  { label: "Portfólio", icon: FolderKanban, active: true },
  { label: "Cronogramas", icon: CalendarDays },
  { label: "Produção", icon: Gauge },
  { label: "Restrições", icon: AlertTriangle },
  { label: "Relatórios", icon: BarChart3 },
];

const phaseColors: Record<string, string> = {
  Preparação: "#7e9bb4",
  Estrutura: "#4f7c8f",
  Vedação: "#b78b58",
  Instalações: "#8e7aa8",
  Acabamentos: "#7aa28a",
  Entrega: "#a56b75",
};

const statusTone: Record<string, string> = {
  "Concluído": "bg-[#e3f0e8] text-[#37654b]",
  "Em andamento": "bg-[#e2edf4] text-[#3b6277]",
  "Não iniciado": "bg-[#eef1f3] text-[#64727c]",
  "Em risco": "bg-[#f6e7e4] text-[#8b514e]",
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value)).replace(" de ", " ");
}

function MetricCard({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string; detail: string; icon: typeof Activity; tone?: string }) {
  const tones: Record<string, string> = {
    blue: "bg-[#e8f0f4] text-[#426579]",
    green: "bg-[#e5f0e8] text-[#427052]",
    amber: "bg-[#f5eee2] text-[#8e7049]",
    rose: "bg-[#f3e6e6] text-[#8b5b60]",
  };
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tones[tone]}`}><Icon size={17} strokeWidth={1.8} /></div>
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
        <p className="metric-detail">{detail}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const projectsQuery = trpc.projects.list.useQuery();
  const projects = projectsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState(1);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeNav, setActiveNav] = useState("Portfólio");
  const [search, setSearch] = useState("");
  const selected = projects.find(project => project.id === selectedId) ?? projects[0];
  const activitiesQuery = trpc.projects.activities.useQuery({ projectId: selected?.id ?? 1 });
  const activities = activitiesQuery.data ?? [];
  const filteredActivities = useMemo(() => activities.filter(activity => activity.name.toLowerCase().includes(search.toLowerCase())), [activities, search]);
  const maxDays = Math.max(...activities.map(item => item.startOffset + item.durationDays), 220);
  const weekCount = Math.ceil(maxDays / 7);

  const togglePhase = (phase: string) => setCollapsed(prev => ({ ...prev, [phase]: !prev[phase] }));
  const grouped = useMemo(() => filteredActivities.reduce<Record<string, typeof filteredActivities>>((acc, item) => {
    (acc[item.phase] ||= []).push(item);
    return acc;
  }, {}), [filteredActivities]);

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="brand-lockup"><div className="brand-mark"><Layers3 size={18} /></div><div><div className="brand-name">plataforma<span>obras</span></div><div className="brand-subtitle">planejamento integrado</div></div></div>
        <div className="workspace-select"><div><span className="eyebrow">ESPAÇO DE TRABALHO</span><strong>Construtora Horizonte</strong></div><ChevronDown size={15} /></div>
        <nav className="main-nav">
          <span className="nav-caption">GESTÃO</span>
          {nav.map(item => <button key={item.label} className={`nav-item ${activeNav === item.label ? "active" : ""}`} onClick={() => setActiveNav(item.label)}><item.icon size={17} /><span>{item.label}</span>{item.label === "Restrições" && <span className="nav-count">7</span>}</button>)}
        </nav>
        <div className="sidebar-projects"><div className="sidebar-section-head"><span className="nav-caption">OBRAS ATIVAS</span><button className="icon-button"><Plus size={15} /></button></div>{projects.map(project => <button key={project.id} onClick={() => setSelectedId(project.id)} className={`project-mini ${selected?.id === project.id ? "selected" : ""}`}><span className={`project-dot ${project.status === "Em risco" ? "risk" : ""}`} /><span className="truncate">{project.name}</span><span className="project-progress">{project.progress}%</span></button>)}</div>
        <div className="sidebar-bottom"><div className="sync-status"><span className="sync-dot" /> Dados sincronizados <span className="ml-auto">agora</span></div><div className="user-card"><div className="avatar">{user?.name?.charAt(0).toUpperCase() || "R"}</div><div className="min-w-0"><strong className="truncate block">{user?.name || "Rafael Gomes"}</strong><span className="truncate block">Planejamento</span></div><MoreHorizontal size={16} className="ml-auto text-slate-400" /></div></div>
      </aside>

      <main className="main-canvas">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu"><Menu size={18} /></button><div><span className="breadcrumb">Portfólio / Obras ativas</span><h1>Visão geral</h1></div></div><div className="topbar-actions"><div className="global-search"><Search size={16} /><input placeholder="Buscar obra, atividade..." /></div><button className="icon-button notification"><Bell size={17} /><span /></button>{!user && <button className="login-button" onClick={() => startLogin()}>Entrar</button>}</div></header>

        <div className="content-wrap">
          <section className="intro-row"><div><p className="eyebrow accent">PAINEL DE CONTROLE</p><h2>Bom dia, Rafael <span className="wave">—</span></h2><p className="intro-copy">Acompanhe o ritmo das suas obras e antecipe os próximos movimentos.</p></div><button className="primary-button"><Plus size={16} /> Nova obra</button></section>

          <section className="metrics-grid"><MetricCard label="Obras ativas" value={String(projects.length || 2).padStart(2, "0")} detail="1 em planejamento" icon={FolderKanban} /><MetricCard label="Avanço consolidado" value="31,4%" detail="+4,2% esta semana" icon={Activity} tone="green" /><MetricCard label="Atividades críticas" value="07" detail="3 com desvio" icon={AlertTriangle} tone="rose" /><MetricCard label="Próximo marco" value="27 mar" detail="Edifício Residencial" icon={Clock3} tone="amber" /></section>

          <section className="content-grid">
            <div className="panel portfolio-panel"><div className="panel-heading"><div><h3>Obras em acompanhamento</h3><p>Visão consolidada do portfólio</p></div><button className="ghost-button">Ver todas <ChevronRight size={15} /></button></div><div className="portfolio-list">{projects.map(project => <button key={project.id} onClick={() => setSelectedId(project.id)} className={`portfolio-row ${selected?.id === project.id ? "active" : ""}`}><div className="portfolio-status"><span className={`status-dot ${project.status === "Em risco" ? "risk" : "ok"}`} /><span>{project.status}</span></div><div className="portfolio-main"><strong>{project.name}</strong><span>{project.code} · {project.location}</span></div><div className="portfolio-progress"><div className="progress-label"><span>{project.progress}% executado</span><span>{formatDate(project.plannedFinish)}</span></div><div className="progress-track"><div style={{ width: `${project.progress}%` }} /></div></div><ChevronRight size={16} className="row-chevron" /></button>)}</div></div>

            <div className="panel focus-panel"><div className="panel-heading"><div><h3>Foco da semana</h3><p>Itens que pedem atenção</p></div><Sparkles size={18} className="sparkle" /></div><div className="focus-list"><div className="focus-item"><div className="focus-icon rose"><AlertTriangle size={16} /></div><div><strong>Alvenaria — Pavimento 04</strong><span>Ritmo abaixo da meta em 2 dias</span></div><span className="focus-tag rose">Atenção</span></div><div className="focus-item"><div className="focus-icon amber"><Clock3 size={16} /></div><div><strong>Liberação de projeto</strong><span>Instalações · vence amanhã</span></div><span className="focus-tag amber">Prazo</span></div><div className="focus-item"><div className="focus-icon green"><CircleCheck size={16} /></div><div><strong>Estrutura — Pavimento 03</strong><span>Concluído antes da baseline</span></div><span className="focus-tag green">Feito</span></div></div></div>
          </section>

          <section className="panel gantt-panel"><div className="panel-heading gantt-heading"><div><div className="title-with-badge"><h3>Planejamento integrado</h3><span className="live-badge"><span /> AO VIVO</span></div><p>{selected?.name || "Selecione uma obra"} · baseline atualizada hoje</p></div><div className="gantt-actions"><div className="compact-search"><Search size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filtrar atividades" /></div><button className="outline-button"><SlidersHorizontal size={15} /> Filtros</button><button className="icon-button"><MoreHorizontal size={17} /></button></div></div><div className="gantt-toolbar"><div className="toolbar-left"><button className="toolbar-tab active">Gantt</button><button className="toolbar-tab">Tabela</button><button className="toolbar-tab">Linha de balanço</button></div><div className="toolbar-right"><span className="legend"><i className="legend-line baseline" /> Baseline</span><span className="legend"><i className="legend-box actual" /> Realizado</span><span className="legend"><i className="legend-box critical" /> Crítico</span><select className="scale-select" defaultValue="semanas"><option value="semanas">Semanas</option><option value="meses">Meses</option><option value="dias">Dias</option></select></div></div><div className="gantt-scroller"><div className="gantt-grid"><div className="gantt-table-header"><span>WBS / ATIVIDADE</span><span>STATUS</span><span>INÍCIO</span><span>FIM</span></div><div className="timeline-header" style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(48px, 1fr))` }}>{Array.from({ length: weekCount }, (_, index) => <span key={index}>S{String(index + 1).padStart(2, "0")}</span>)}</div>{Object.entries(grouped).map(([phase, phaseActivities]) => <div key={phase} className="gantt-group"><button className="group-label" onClick={() => togglePhase(phase)}><span className="group-chevron">{collapsed[phase] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span><span className="phase-mark" style={{ background: phaseColors[phase] || "#6b8292" }} /><strong>{phase}</strong><span className="group-count">{phaseActivities.length} atividades</span></button>{!collapsed[phase] && phaseActivities.map(activity => { const left = (activity.startOffset / maxDays) * 100; const width = (activity.durationDays / maxDays) * 100; return <div className="gantt-row" key={activity.id}><div className="activity-cell"><span className="wbs-code">{activity.wbsCode}</span><span className="activity-name">{activity.name}</span>{activity.critical === 1 && <span className="critical-chip">C</span>}</div><div><span className={`status-chip ${statusTone[activity.status] || statusTone["Não iniciado"]}`}>{activity.status}</span></div><div className="date-cell">{formatDate(new Date(new Date("2026-10-01T00:00:00Z").getTime() + activity.startOffset * 86400000))}</div><div className="date-cell">{formatDate(new Date(new Date("2026-10-01T00:00:00Z").getTime() + (activity.startOffset + activity.durationDays) * 86400000))}</div><div className="timeline-cell" style={{ backgroundSize: `${100 / Math.max(1, weekCount)}% 100%` }}><div className={`gantt-bar ${activity.critical === 1 ? "critical" : ""}`} style={{ left: `${left}%`, width: `${Math.max(width, 2)}%`, background: phaseColors[activity.phase] || "#6b8292" }}><div className="bar-progress" style={{ width: `${activity.progress}%` }} /><span>{activity.progress}%</span></div></div></div> })}</div>)}</div></div><div className="gantt-footer"><span><Users size={14} /> 4 equipes em produção</span><span><CalendarDays size={14} /> Janela de planejamento: 220 dias</span><span className="footer-spacer" /><span className="muted">Último cálculo: hoje, 08:42</span></div></section>
        </div>
      </main>
    </div>
  );
}
