import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AgentView } from "@/components/AgentView";
import { AgentSidebar } from "@/components/AgentSidebar";
import { AdminLlmSettings } from "@/components/AdminLlmSettings";
import { EapView } from "@/components/EapView";
import { ProductionView } from "@/components/ProductionView";

const nav = [
  { label: "Portfólio", icon: FolderKanban },
  { label: "EAP", icon: Layers3 },
  { label: "Cronogramas", icon: CalendarDays },
  { label: "Produção", icon: Gauge },
  { label: "Restrições", icon: AlertTriangle },
  { label: "Relatórios", icon: BarChart3 },
  { label: "Agente IA", icon: Sparkles },
  { label: "Configurações", icon: Settings, adminOnly: true },
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
  Concluído: "bg-[#e3f0e8] text-[#37654b]",
  "Em andamento": "bg-[#e2edf4] text-[#3b6277]",
  "Não iniciado": "bg-[#eef1f3] text-[#64727c]",
  "Em risco": "bg-[#f6e7e4] text-[#8b514e]",
};
function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(value))
    .replace(" de ", " ");
}
function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-[#e8f0f4] text-[#426579]",
    green: "bg-[#e5f0e8] text-[#427052]",
    amber: "bg-[#f5eee2] text-[#8e7049]",
    rose: "bg-[#f3e6e6] text-[#8b5b60]",
  };
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tones[tone]}`}>
        <Icon size={17} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
        <p className="metric-detail">{detail}</p>
      </div>
    </div>
  );
}

function GanttView({
  projectId,
  activities,
  search,
  setSearch,
  selectedName,
  plannedStart,
}: {
  projectId: number;
  activities: any[];
  search: string;
  setSearch: (value: string) => void;
  selectedName: string;
  plannedStart?: string | Date;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"gantt" | "table" | "lob">("gantt");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const utils = trpc.useUtils();
  const updateActivity = trpc.projects.updateActivity.useMutation({
    onSuccess: async () => {
      await utils.projects.activities.invalidate({ projectId });
    },
  });
  const projectStart = new Date(
    plannedStart ?? "2026-10-01T00:00:00Z"
  ).getTime();
  const filtered = useMemo(
    () =>
      activities.filter(
        item =>
          item.name.toLowerCase().includes(search.toLowerCase()) &&
          (!onlyCritical || item.critical === 1)
      ),
    [activities, search, onlyCritical]
  );
  const maxDays = Math.max(
    ...activities.map(item => item.startOffset + item.durationDays),
    220
  );
  const weekCount = Math.ceil(maxDays / 7);
  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, any[]>>((acc, item) => {
        (acc[item.phase] ||= []).push(item);
        return acc;
      }, {}),
    [filtered]
  );
  const toggle = (phase: string) =>
    setCollapsed(prev => ({ ...prev, [phase]: !prev[phase] }));
  return (
    <section className="panel gantt-panel">
      <div className="panel-heading gantt-heading">
        <div>
          <div className="title-with-badge">
            <h3>Planejamento integrado</h3>
            <span className="live-badge">
              <span /> AO VIVO
            </span>
          </div>
          <p>{selectedName} · planejamento salvo</p>
        </div>
        <div className="gantt-actions">
          <div className="compact-search">
            <Search size={14} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Filtrar atividades"
            />
          </div>
          <button
            className={`outline-button ${filtersOpen ? "selected-control" : ""}`}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={15} /> Filtros
          </button>
          <button
            className={`outline-button ${editMode ? "selected-control" : ""}`}
            onClick={() => setEditMode(value => !value)}
          >
            {editMode ? "Concluir edição" : "Editar Gantt"}
          </button>
          <button
            className="icon-button"
            title="Limpar filtros"
            onClick={() => {
              setSearch("");
              setOnlyCritical(false);
            }}
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {filtersOpen && (
        <div className="filter-strip">
          <label>
            <input
              type="checkbox"
              checked={onlyCritical}
              onChange={event => setOnlyCritical(event.target.checked)}
            />{" "}
            Apenas atividades críticas
          </label>
          <span>
            {filtered.length} de {activities.length} atividades visíveis
          </span>
        </div>
      )}
      <div className="gantt-toolbar">
        <div className="toolbar-left">
          <button
            className={`toolbar-tab ${tab === "gantt" ? "active" : ""}`}
            onClick={() => setTab("gantt")}
          >
            Gantt
          </button>
          <button
            className={`toolbar-tab ${tab === "table" ? "active" : ""}`}
            onClick={() => setTab("table")}
          >
            Tabela
          </button>
          <button
            className={`toolbar-tab ${tab === "lob" ? "active" : ""}`}
            onClick={() => setTab("lob")}
          >
            Linha de balanço
          </button>
        </div>
        <div className="toolbar-right">
          <span className="legend">
            <i className="legend-line baseline" /> Baseline
          </span>
          <span className="legend">
            <i className="legend-box actual" /> Realizado
          </span>
          <span className="legend">
            <i className="legend-box critical" /> Crítico
          </span>
          <select className="scale-select" defaultValue="semanas">
            <option value="semanas">Semanas</option>
            <option value="meses">Meses</option>
            <option value="dias">Dias</option>
          </select>
        </div>
      </div>
      {tab === "gantt" && (
        <div className="gantt-scroller">
          <div className="gantt-grid">
            <div className="gantt-table-header">
              <span>WBS / ATIVIDADE</span>
              <span>STATUS</span>
              <span>INÍCIO</span>
              <span>FIM</span>
            </div>
            <div
              className="timeline-header"
              style={{
                gridTemplateColumns: `repeat(${weekCount}, minmax(48px, 1fr))`,
              }}
            >
              {Array.from({ length: weekCount }, (_, index) => (
                <span key={index}>S{String(index + 1).padStart(2, "0")}</span>
              ))}
            </div>
            {Object.entries(grouped).map(([phase, phaseActivities]) => (
              <div key={phase} className="gantt-group">
                <button className="group-label" onClick={() => toggle(phase)}>
                  <span className="group-chevron">
                    {collapsed[phase] ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </span>
                  <span
                    className="phase-mark"
                    style={{ background: phaseColors[phase] || "#6b8292" }}
                  />
                  <strong>Serviço · {phase}</strong>
                  <span className="group-count">
                    {phaseActivities.length} atividades
                  </span>
                </button>
                {!collapsed[phase] &&
                  phaseActivities.map(activity => {
                    const left = (activity.startOffset / maxDays) * 100;
                    const width = (activity.durationDays / maxDays) * 100;
                    const draft = drafts[activity.id] ?? activity;
                    const save = () =>
                      updateActivity.mutate({
                        projectId,
                        activityId: activity.id,
                        name: draft.name,
                        phase: draft.phase,
                        startOffset: Number(draft.startOffset),
                        durationDays: Number(draft.durationDays),
                        progress: Number(draft.progress),
                        status: draft.status,
                      });
                    return (
                      <div className="gantt-row" key={activity.id}>
                        <div className="activity-cell">
                          <span className="wbs-code">{activity.wbsCode}</span>
                          {editMode ? (
                            <input
                              className="gantt-edit-input activity-name"
                              value={draft.name}
                              onChange={event =>
                                setDrafts(prev => ({
                                  ...prev,
                                  [activity.id]: {
                                    ...draft,
                                    name: event.target.value,
                                  },
                                }))
                              }
                            />
                          ) : (
                            <span className="activity-name">
                              {activity.name}
                            </span>
                          )}
                          {activity.critical === 1 && (
                            <span className="critical-chip">C</span>
                          )}
                        </div>
                        <div>
                          {editMode ? (
                            <div className="gantt-status-editor">
                              <select
                                className="gantt-edit-select"
                                value={draft.status}
                                onChange={event =>
                                  setDrafts(prev => ({
                                    ...prev,
                                    [activity.id]: {
                                      ...draft,
                                      status: event.target.value,
                                    },
                                  }))
                                }
                              >
                                <option>Não iniciado</option>
                                <option>Em andamento</option>
                                <option>Concluído</option>
                                <option>Em risco</option>
                              </select>
                              <input
                                className="gantt-edit-progress"
                                type="number"
                                min="0"
                                max="100"
                                value={draft.progress}
                                onChange={event =>
                                  setDrafts(prev => ({
                                    ...prev,
                                    [activity.id]: {
                                      ...draft,
                                      progress: Number(event.target.value),
                                    },
                                  }))
                                }
                                aria-label="Avanço percentual"
                              />
                            </div>
                          ) : (
                            <span
                              className={`status-chip ${statusTone[activity.status] || statusTone["Não iniciado"]}`}
                            >
                              {activity.status}
                            </span>
                          )}
                        </div>
                        <div className="date-cell">
                          {editMode ? (
                            <input
                              className="gantt-edit-number"
                              type="number"
                              min="0"
                              value={draft.startOffset}
                              onChange={event =>
                                setDrafts(prev => ({
                                  ...prev,
                                  [activity.id]: {
                                    ...draft,
                                    startOffset: Number(event.target.value),
                                  },
                                }))
                              }
                            />
                          ) : (
                            formatDate(
                              new Date(
                                projectStart + activity.startOffset * 86400000
                              )
                            )
                          )}
                        </div>
                        <div className="date-cell">
                          {editMode ? (
                            <input
                              className="gantt-edit-number"
                              type="number"
                              min="1"
                              value={draft.durationDays}
                              onChange={event =>
                                setDrafts(prev => ({
                                  ...prev,
                                  [activity.id]: {
                                    ...draft,
                                    durationDays: Number(event.target.value),
                                  },
                                }))
                              }
                            />
                          ) : (
                            formatDate(
                              new Date(
                                projectStart +
                                  (activity.startOffset +
                                    activity.durationDays) *
                                    86400000
                              )
                            )
                          )}
                        </div>
                        <div
                          className="timeline-cell"
                          style={{
                            backgroundSize: `${100 / Math.max(1, weekCount)}% 100%`,
                          }}
                        >
                          <div
                            className={`gantt-bar ${activity.critical === 1 ? "critical" : ""}`}
                            style={{
                              left: `${left}%`,
                              width: `${Math.max(width, 2)}%`,
                              background:
                                phaseColors[activity.phase] || "#6b8292",
                            }}
                          >
                            <div
                              className="bar-progress"
                              style={{ width: `${activity.progress}%` }}
                            />
                            <span>{activity.progress}%</span>
                          </div>
                          {editMode && (
                            <button
                              className="gantt-save-button"
                              onClick={save}
                            >
                              Salvar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "table" && (
        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>WBS</th>
                <th>Atividade</th>
                <th>Fase</th>
                <th>Status</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Avanço</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(activity => (
                <tr key={activity.id}>
                  <td>{activity.wbsCode}</td>
                  <td className="table-name">
                    {activity.name}
                    {activity.critical === 1 && (
                      <span className="critical-chip">C</span>
                    )}
                  </td>
                  <td>{activity.phase}</td>
                  <td>
                    <span
                      className={`status-chip ${statusTone[activity.status] || statusTone["Não iniciado"]}`}
                    >
                      {activity.status}
                    </span>
                  </td>
                  <td>
                    {formatDate(
                      new Date(projectStart + activity.startOffset * 86400000)
                    )}
                  </td>
                  <td>
                    {formatDate(
                      new Date(
                        projectStart +
                          (activity.startOffset + activity.durationDays) *
                            86400000
                      )
                    )}
                  </td>
                  <td>{activity.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "lob" && (
        <div className="lob-view">
          <div className="lob-copy">
            <p className="eyebrow accent">RITMO POR FRENTE</p>
            <h4>Linha de Balanço</h4>
            <p>
              As frentes estão ordenadas por pavimento para comparar ritmo,
              espera e sobreposição. Este módulo já está pronto para receber a
              produção real por período.
            </p>
            <div className="module-empty">
              <span>
                Sem produção registrada para calcular ritmo, espera ou avanço
                real.
              </span>
            </div>
          </div>
          <div className="lob-chart">
            <div className="module-empty">
              <span>
                A Linha de Balanço será calculada após o primeiro lançamento de
                produção.
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="gantt-footer">
        <span>
          <Users size={14} /> Produção ainda não lançada
        </span>
        <span>
          <CalendarDays size={14} /> {activities.length} atividades planejadas
        </span>
        <span className="footer-spacer" />
        <span className="muted">
          CPM e ritmo real aguardam dados operacionais
        </span>
      </div>
    </section>
  );
}

function ModuleView({
  name,
  icon: Icon,
  description,
  onBack,
  projectId,
  projectName,
  activities,
  search,
  setSearch,
  plannedStart,
}: {
  name: string;
  icon: typeof Activity;
  description: string;
  onBack: () => void;
  projectId: number;
  projectName: string;
  activities: any[];
  search: string;
  setSearch: (value: string) => void;
  plannedStart?: string | Date;
}) {
  const riskActivities = activities.filter(activity => activity.status === "Em risco");
  const completedActivities = activities.filter(activity => activity.progress >= 100);
  if (name === "Agente IA") return <AgentView />;
  if (name === "EAP")
    return <EapView projectId={projectId} projectName={projectName} />;
  if (name === "Produção")
    return <ProductionView projectId={projectId} projectName={projectName} />;
  if (name === "Cronogramas")
    return (
      <GanttView
        projectId={projectId}
        activities={activities}
        search={search}
        setSearch={setSearch}
        selectedName={projectName}
        plannedStart={plannedStart}
      />
    );
  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Icon size={22} />
        </div>
        <div>
          <p className="eyebrow accent">MÓDULO OPERACIONAL</p>
          <h2>{name}</h2>
          <p>{description}</p>
        </div>
        <button className="outline-button" onClick={onBack}>
          <ChevronLeftIcon /> Voltar ao portfólio
        </button>
      </div>
      <div className="module-grid">
        <div className="module-card">
          <span className="eyebrow">STATUS</span>
          <strong>{activities.length} atividades carregadas</strong>
          <p>
            {riskActivities.length
              ? `${riskActivities.length} atividade(s) em risco exigem acompanhamento.`
              : "Nenhuma atividade em risco foi registrada nesta obra."}
          </p>
        </div>
        <div className="module-card">
          <span className="eyebrow">PRÓXIMA AÇÃO</span>
          <strong>{name === "Relatórios" ? "Resumo operacional" : "Revisar pendências"}</strong>
          <p>
            {name === "Relatórios"
              ? `${completedActivities.length} atividades concluídas de ${activities.length}.`
              : "Use o cronograma e a produção para registrar o próximo avanço da obra."}
          </p>
        </div>
        <div className="module-card wide">
          <span className="eyebrow">VISÃO DO MÓDULO</span>
          <div className="module-empty">
            {riskActivities.length ? <AlertTriangle size={20} /> : <CircleCheck size={20} />}
            <span>
              {name === "Relatórios"
                ? "Os indicadores acima são calculados a partir das atividades persistidas."
                : name === "Restrições"
                  ? riskActivities.length
                    ? "As atividades em risco aparecem aqui assim que forem registradas no cronograma."
                    : "A obra não possui restrições registradas no momento."
                  : "Este módulo está conectado ao banco e pronto para receber dados operacionais."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
function ChevronLeftIcon() {
  return <ChevronRight size={15} className="rotate-180" />;
}

export default function Home() {
  const { user } = useAuth();
  const projectsQuery = trpc.projects.list.useQuery();
  const serverProjects = projectsQuery.data ?? [];
  const projects = serverProjects;
  const [selectedId, setSelectedId] = useState(1);
  const [activeNav, setActiveNav] = useState("Portfólio");
  const [agentOpen, setAgentOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [createError, setCreateError] = useState("");
  const utils = trpc.useUtils();
  const initializePlanMutation = trpc.projects.initializePlan.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.projects.list.invalidate(),
        utils.projects.activities.invalidate(),
        utils.projects.wbs.invalidate(),
      ]);
    },
    onError: error => setCreateError(`Obra criada, mas o plano inicial falhou: ${error.message}`),
  });
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: project => {
      void projectsQuery.refetch();
      setSelectedId(project.id);
      initializePlanMutation.mutate({ projectId: project.id });
      setNewProjectName("");
      setCreateError("");
      setNewProjectOpen(false);
    },
    onError: error => setCreateError(error.message),
  });
  const selected =
    projects.find(project => project.id === selectedId) ?? projects[0];
  const activitiesQuery = trpc.projects.activities.useQuery({
    projectId: selected?.id ?? 1,
  });
  const activities = activitiesQuery.data ?? [];
  const portfolioProgress = projects.length
    ? Math.round(
        projects.reduce((total, project) => total + project.progress, 0) /
          projects.length
      )
    : 0;
  const criticalActivities = activities.filter(activity => activity.critical === 1);
  const riskActivities = activities.filter(activity => activity.status === "Em risco");
  const nextMilestone = activities
    .filter(activity => activity.progress < 100)
    .sort((a, b) => a.startOffset - b.startOffset)[0];
  const agentSection =
    activeNav === "Cronogramas"
      ? "cronograma"
      : activeNav === "Produção"
        ? "producao"
        : activeNav === "Restrições"
          ? "restricoes"
          : activeNav === "Relatórios"
            ? "relatorios"
            : "portfolio";
  const visibleProjects = projects.filter(project =>
    `${project.name} ${project.code} ${project.location}`
      .toLowerCase()
      .includes(globalSearch.toLowerCase())
  );
  const createProject = () => {
    if (!user) {
      startLogin();
      return;
    }
    if (!newProjectName.trim()) return;
    createProjectMutation.mutate({
      name: newProjectName.trim(),
      location: "A cadastrar",
    });
  };
  const createPending =
    createProjectMutation.isPending || initializePlanMutation.isPending;
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Layers3 size={18} />
          </div>
          <div>
            <div className="brand-name">
              plataforma<span>obras</span>
            </div>
            <div className="brand-subtitle">planejamento integrado</div>
          </div>
        </div>
        <div className="workspace-select">
          <div>
            <span className="eyebrow">ESPAÇO DE TRABALHO</span>
            <strong>{user?.name ? `${user.name} · workspace` : "Área pública"}</strong>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav">
          <span className="nav-caption">GESTÃO</span>
          {nav.filter(item => !item.adminOnly || user?.role === "admin").map(item => (
            <button
              key={item.label}
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              onClick={() => setActiveNav(item.label)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.label === "Restrições" && (
                <span className="nav-count">7</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-projects">
          <div className="sidebar-section-head">
            <span className="nav-caption">OBRAS ATIVAS</span>
            <button
              className="icon-button"
              onClick={() => setNewProjectOpen(true)}
              title="Nova obra"
            >
              <Plus size={15} />
            </button>
          </div>
          {projects.map(project => (
            <button
              key={project.id}
              onClick={() => {
                setSelectedId(project.id);
                setActiveNav("Portfólio");
              }}
              className={`project-mini ${selected?.id === project.id ? "selected" : ""}`}
            >
              <span className="project-dot" />
              <span className="truncate">{project.name}</span>
              <span className="project-progress">{project.progress}%</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sync-status">
            <span className={`sync-dot ${projectsQuery.isError ? "error" : ""}`} />
            {projectsQuery.isPending
              ? "Carregando dados"
              : projectsQuery.isError
                ? "Falha ao carregar"
                : "Banco sincronizado"}
            <span className="ml-auto">{projectsQuery.isFetching ? "atualizando" : "agora"}</span>
          </div>
          <div className="user-card">
            <div className="avatar">
              {user?.name?.charAt(0).toUpperCase() || "R"}
            </div>
            <div className="min-w-0">
              <strong className="truncate block">
                {user?.name || "Rafael Gomes"}
              </strong>
              <span className="truncate block">Planejamento</span>
            </div>
            <MoreHorizontal size={16} className="ml-auto text-slate-400" />
          </div>
        </div>
      </aside>
      <main className="main-canvas">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu">
              <Menu size={18} />
            </button>
            <div>
              <span className="breadcrumb">
                {activeNav} / {selected?.code || "Obras"}
              </span>
              <h1>{activeNav === "Portfólio" ? "Visão geral" : activeNav}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                value={globalSearch}
                onChange={event => setGlobalSearch(event.target.value)}
                placeholder="Buscar obra, atividade..."
              />
            </div>
            <button className="icon-button notification">
              <Bell size={17} />
              <span />
            </button>
            <button
              className={`agent-open-button ${agentOpen ? "active" : ""}`}
              onClick={() => setAgentOpen(true)}
              title="Abrir agente da obra"
            >
              <Sparkles size={15} /> <span>Agente</span>
            </button>
            {!user && (
              <button className="login-button" onClick={() => startLogin()}>
                Entrar
              </button>
            )}
          </div>
        </header>
        <div className="content-wrap">
          {activeNav === "Configurações" ? (
            <AdminLlmSettings />
          ) : activeNav !== "Portfólio" ? (
            <ModuleView
              name={activeNav}
              icon={
                nav.find(item => item.label === activeNav)?.icon || Activity
              }
              description={
                {
                  EAP: "Escopo, pacotes de trabalho e estrutura de entregas.",
                  Cronogramas: "Planejamento, baseline e caminho crítico.",
                  Produção: "Ritmos, equipes e avanço físico.",
                  Restrições: "Pendências que podem impactar o prazo.",
                  Relatórios: "Indicadores e visões executivas.",
                }[activeNav] || "Gestão integrada de obras."
              }
              onBack={() => setActiveNav("Portfólio")}
              projectId={selected?.id ?? 1}
              projectName={selected?.name ?? "Obra selecionada"}
              activities={activities}
              search={search}
              setSearch={setSearch}
              plannedStart={selected?.plannedStart}
            />
          ) : (
            <>
              <section className="intro-row">
                <div>
                  <p className="eyebrow accent">PAINEL DE CONTROLE</p>
                  <h2>
                    Olá, {user?.name?.split(" ")[0] || "gestor"} <span className="wave">—</span>
                  </h2>
                  <p className="intro-copy">
                    Acompanhe o ritmo das suas obras e antecipe os próximos
                    movimentos.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setNewProjectOpen(true)}
                >
                  <Plus size={16} /> Nova obra
                </button>
              </section>
              <section className="metrics-grid">
                <MetricCard
                  label="Obras ativas"
                  value={String(projects.length).padStart(2, "0")}
                  detail={`${projects.filter(project => project.status === "Planejamento").length} em planejamento`}
                  icon={FolderKanban}
                />
                <MetricCard
                  label="Avanço consolidado"
                  value={`${portfolioProgress}%`}
                  detail={selected ? `${selected.name} selecionada` : "Sem obra selecionada"}
                  icon={Activity}
                  tone="green"
                />
                <MetricCard
                  label="Atividades críticas"
                  value={String(criticalActivities.length).padStart(2, "0")}
                  detail={`${riskActivities.length} com risco nesta obra`}
                  icon={AlertTriangle}
                  tone="rose"
                />
                <MetricCard
                  label="Próximo marco"
                  value={nextMilestone ? formatDate(new Date(Date.parse(selected?.plannedStart?.toString() ?? new Date().toISOString()) + nextMilestone.startOffset * 86400000)) : "—"}
                  detail={nextMilestone?.name ?? "Nenhuma atividade pendente"}
                  icon={Clock3}
                  tone="amber"
                />
              </section>
              <section className="content-grid">
                <div className="panel portfolio-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Obras em acompanhamento</h3>
                      <p>{visibleProjects.length} obras encontradas</p>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() => setGlobalSearch("")}
                    >
                      Limpar busca <X size={14} />
                    </button>
                  </div>
                  <div className="portfolio-list">
                    {visibleProjects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => setSelectedId(project.id)}
                        className={`portfolio-row ${selected?.id === project.id ? "active" : ""}`}
                      >
                        <div className="portfolio-status">
                          <span className="status-dot ok" />
                          <span>{project.status}</span>
                        </div>
                        <div className="portfolio-main">
                          <strong>{project.name}</strong>
                          <span>
                            {project.code} · {project.location}
                          </span>
                        </div>
                        <div className="portfolio-progress">
                          <div className="progress-label">
                            <span>{project.progress}% executado</span>
                            <span>{formatDate(project.plannedFinish)}</span>
                          </div>
                          <div className="progress-track">
                            <div style={{ width: `${project.progress}%` }} />
                          </div>
                        </div>
                        <ChevronRight size={16} className="row-chevron" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="panel focus-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Foco da semana</h3>
                      <p>Itens que pedem atenção</p>
                    </div>
                    <Sparkles size={18} className="sparkle" />
                  </div>
                  <div className="focus-list">
                    {riskActivities.slice(0, 3).map(activity => (
                      <div className="focus-item" key={`risk-${activity.id}`}>
                        <div className="focus-icon rose">
                          <AlertTriangle size={16} />
                        </div>
                        <div>
                          <strong>{activity.name}</strong>
                          <span>{activity.phase} · atividade em risco</span>
                        </div>
                        <span className="focus-tag rose">Atenção</span>
                      </div>
                    ))}
                    {!riskActivities.length && nextMilestone && (
                      <div className="focus-item">
                        <div className="focus-icon amber">
                          <Clock3 size={16} />
                        </div>
                        <div>
                          <strong>{nextMilestone.name}</strong>
                          <span>{nextMilestone.phase} · próximo marco planejado</span>
                        </div>
                        <span className="focus-tag amber">Prazo</span>
                      </div>
                    )}
                    {!riskActivities.length && !nextMilestone && (
                      <div className="focus-item">
                        <div className="focus-icon green">
                          <CircleCheck size={16} />
                        </div>
                        <div>
                          <strong>Nenhum alerta aberto</strong>
                          <span>As atividades desta obra estão sem pendências registradas.</span>
                        </div>
                        <span className="focus-tag green">Estável</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
              <GanttView
                projectId={selected?.id ?? 1}
                activities={activities}
                search={search}
                setSearch={setSearch}
                selectedName={selected?.name || "Selecione uma obra"}
                plannedStart={selected?.plannedStart}
              />
            </>
          )}
        </div>
      </main>
      {agentOpen && selected && (
        <AgentSidebar
          projectId={selected.id}
          projectName={selected.name}
          activeSection={agentSection}
          onClose={() => setAgentOpen(false)}
        />
      )}
      {newProjectOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setNewProjectOpen(false)}
        >
          <div
            className="modal-card"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow accent">CADASTRO RÁPIDO</p>
                <h3>Nova obra</h3>
              </div>
              <button
                className="icon-button"
                onClick={() => setNewProjectOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <label>
              Nome da obra
              <input
                autoFocus
                value={newProjectName}
                onChange={event => setNewProjectName(event.target.value)}
                onKeyDown={event => event.key === "Enter" && createProject()}
                placeholder="Ex.: Edifício Aurora"
              />
            </label>
            <p className="modal-note">
              A obra será persistida no banco como planejamento inicial e ficará
              vinculada à sua conta.
            </p>
            {createError && (
              <p className="modal-note text-red-700">{createError}</p>
            )}
            <div className="modal-actions">
              <button
                className="outline-button"
                onClick={() => setNewProjectOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                onClick={createProject}
                disabled={createPending}
              >
                {createProjectMutation.isPending
                  ? "Salvando obra…"
                  : initializePlanMutation.isPending
                    ? "Montando plano…"
                    : "Criar obra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
