import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Calculator,
  CalendarDays,
  ChevronDown,
  Flag,
  LineChart,
  Scale,
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
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { useLocation } from "wouter";
import { NAV_PATHS, labelFromPath } from "@/nav-paths";
import { AgentView } from "@/components/AgentView";
import { AgentSidebar } from "@/components/AgentSidebar";
import { AdminLlmSettings } from "@/components/AdminLlmSettings";
import { EapView } from "@/components/EapView";
import { ProductionView } from "@/components/ProductionView";
import { BudgetView } from "@/components/BudgetView";
import { CatalogView } from "@/components/CatalogView";
import { PlanningView } from "@/components/PlanningView";
import { GanttView as GanttM2 } from "@/components/GanttView";
import { ReportsView, RestrictionsView } from "@/components/OperationalViews";
import { FrentesView } from "@/components/FrentesView";
import { MedicaoView } from "@/components/MedicaoView";
import { GraficosView } from "@/components/GraficosView";
import { FormulasView } from "@/components/FormulasView";

const nav = [
  { label: "Portfólio", icon: FolderKanban },
  { label: "EAP", icon: Layers3 },
  { label: "Orçamento", icon: WalletCards },
  { label: "Catálogo", icon: BookOpen },
  { label: "Cronogramas", icon: CalendarDays },
  { label: "Linha de Balanço", icon: Activity },
  { label: "Frentes", icon: Flag },
  { label: "Produção", icon: Gauge },
  { label: "Medição", icon: Scale },
  { label: "Restrições", icon: AlertTriangle },
  { label: "Relatórios", icon: BarChart3 },
  { label: "Gráficos", icon: LineChart },
  { label: "Fórmulas", icon: Calculator },
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
  initialTab = "gantt",
}: {
  projectId: number;
  activities: any[];
  search: string;
  setSearch: (value: string) => void;
  selectedName: string;
  plannedStart?: string | Date;
  initialTab?: "gantt" | "table" | "lob";
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"gantt" | "table" | "lob">(initialTab);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const [draggingBar, setDraggingBar] = useState<{ id: number; startX: number; startOffset: number; durationDays: number } | null>(null);
  const [lobProductivityDrafts, setLobProductivityDrafts] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();
  const updateActivity = trpc.projects.updateActivity.useMutation({
    onSuccess: async () => {
      await utils.projects.activities.invalidate({ projectId });
    },
  });
  const projectStart = useMemo(() => {
    if (plannedStart) {
      const t = new Date(plannedStart).getTime();
      if (!Number.isNaN(t)) return t;
    }
    const minOffset = activities.length
      ? Math.min(
          ...activities.map(a => a.earlyStart ?? a.startOffset ?? 0)
        )
      : 0;
    return Date.now() - minOffset * 86_400_000;
  }, [plannedStart, activities]);
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
    ...activities.map(item => (item.earlyStart ?? item.startOffset) + item.durationDays),
    220
  );
  const weekCount = Math.ceil(maxDays / 7);
  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, any[]>>((acc, item) => {
        (acc[item.phase] ||= []).push(item);
        return acc;
      }, {}),
    [filtered],
  );
  const lobSeries = useMemo(
    () =>
      activities.slice(0, 10).map(activity => ({
        activity,
        points: Array.from({ length: weekCount + 1 }, (_, week) => {
          const day = week * 7;
          const elapsed = day - (activity.earlyStart ?? activity.startOffset);
          const plannedProgress =
            elapsed <= 0
              ? 0
              : Math.min(100, (elapsed / Math.max(1, activity.durationDays)) * 100);
          const x = 42 + (week / Math.max(1, weekCount)) * 640;
          const y = 244 - (plannedProgress / 100) * 190;
          return `${x},${y}`;
        }).join(" "),
      })),
    [activities, weekCount]
  );
  const lobRows = useMemo(
    () =>
      activities.slice(0, 12).map(activity => ({
        activity,
        left: ((activity.earlyStart ?? activity.startOffset) / maxDays) * 100,
        width: Math.max((activity.durationDays / maxDays) * 100, 1.4),
        end: (activity.earlyStart ?? activity.startOffset) + activity.durationDays,
      })),
    [activities, maxDays]
  );
  const toggle = (phase: string) =>
    setCollapsed(prev => ({ ...prev, [phase]: !prev[phase] }));
  const beginBarDrag = (event: PointerEvent<HTMLDivElement>, activity: any) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingBar({ id: activity.id, startX: event.clientX, startOffset: (activity.earlyStart ?? activity.startOffset), durationDays: activity.durationDays });
  };
  const updateBarDrag = (event: PointerEvent<HTMLDivElement>, activity: any) => {
    if (!draggingBar || draggingBar.id !== activity.id) return;
    const cell = event.currentTarget.parentElement;
    if (!cell) return;
    const deltaDays = Math.round(((event.clientX - draggingBar.startX) / cell.getBoundingClientRect().width) * maxDays);
    const nextStart = Math.max(0, draggingBar.startOffset + deltaDays);
    setDrafts(prev => ({ ...prev, [activity.id]: { ...(prev[activity.id] ?? activity), earlyStart: nextStart } }));
  };
  const finishBarDrag = (event: PointerEvent<HTMLDivElement>, activity: any) => {
    if (!draggingBar || draggingBar.id !== activity.id) return;
    const draft = drafts[activity.id] ?? activity;
    updateActivity.mutate({ projectId, activityId: activity.id, name: draft.name, phase: draft.phase, startOffset: Number(draft.startOffset), ...(Number(draft.earlyStart) !== Number(activity.earlyStart) && { earlyStart: Number(draft.earlyStart) }), durationDays: Number(draft.durationDays), plannedQuantity: draft.plannedQuantity ? Number(draft.plannedQuantity) : undefined, productivity: draft.productivity ? Number(draft.productivity) : undefined, progress: Number(draft.progress), status: draft.status });
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingBar(null);
  };
  const saveLobProductivity = (activity: any) => {
    const value = Number(lobProductivityDrafts[activity.id]);
    if (!Number.isFinite(value) || value <= 0) return;
    const plannedQuantity = activity.plannedQuantity ? Number(activity.plannedQuantity) : undefined;
    const durationDays = plannedQuantity ? Math.max(1, Math.ceil(plannedQuantity / value)) : activity.durationDays;
    updateActivity.mutate({ projectId, activityId: activity.id, name: activity.name, phase: activity.phase, startOffset: activity.startOffset, durationDays, plannedQuantity, productivity: value, progress: activity.progress, status: activity.status });
  };
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
          <p className="gantt-help">Clique em uma frente para expandir detalhes. Ative “Editar Gantt” para alterar status, avanço, início, duração ou arrastar a barra.</p>
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
        <GanttM2 projectId={projectId} plannedStart={plannedStart} />
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
                       new Date(projectStart + (activity.earlyStart ?? activity.startOffset) * 86400000)
                     )}
                   </td>
                   <td>
                     {formatDate(
                       new Date(
                         projectStart +
                           ((activity.earlyStart ?? activity.startOffset) + activity.durationDays) *
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
              Acompanhe o avanço acumulado de cada frente ao longo do tempo.
              Linhas mais paralelas indicam um ritmo mais estável e ajudam a
              identificar conflitos entre equipes.
            </p>
            <div className="lob-kpis">
              <div><strong>{lobSeries.length}</strong><span>frentes exibidas</span></div>
              <div><strong>{weekCount}</strong><span>semanas planejadas</span></div>
              <div><strong>{activities.filter(activity => activity.critical === 1).length}</strong><span>atividades críticas</span></div>
            </div>
            <div className="lob-legend">
              <span><i className="planned-line" /> Planejado</span>
              <span><i className="actual-line" /> Realizado</span>
              <span><i className="critical-line" /> Crítico</span>
            </div>
          </div>
          <div className="lob-chart">
            {lobRows.length ? (
              <div className="lob-chart-scroll">
              <div className="lob-chart-frame lob-flow-frame">
                <div className="lob-chart-title">
                  <div><strong>Planejamento por serviço e unidade</strong><span>Leia o início, a duração e o fim de cada frente ao longo do calendário</span></div>
                  <span className="lob-status"><span /> Planejado</span>
                </div>
                <div className="lob-flow-head">
                  <span>FRENTE / ATIVIDADE</span>
                  <div className="lob-date-axis">
                    {Array.from({ length: Math.min(weekCount + 1, 13) }, (_, index) => (
                      <span key={index}>{formatDate(new Date(projectStart + Math.round((index / 12) * weekCount) * 7 * 86400000))}</span>
                    ))}
                  </div>
                </div>
                <div className="lob-flow-body">
                  <div className="lob-flow-labels">
                    {lobRows.map(({ activity }) => (
                      <div key={activity.id} className="lob-flow-label" title={activity.name}>
                        <b>{activity.wbsCode}</b><span>{activity.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="lob-flow-grid">
                    {Array.from({ length: Math.min(weekCount + 1, 13) }, (_, index) => <i key={index} style={{ left: `${(index / Math.max(1, Math.min(weekCount, 12))) * 100}%` }} />)}
                    {lobRows.map(({ activity, left, width, end }) => (
                      <div key={activity.id} className="lob-flow-row">
                        <div className={`lob-flow-bar ${activity.critical === 1 ? "critical" : ""}`} style={{ left: `${left}%`, width: `${width}%`, background: phaseColors[activity.phase] || "#6b8292" }} title={`${activity.wbsCode} · ${activity.name} · ${activity.durationDays} dias`}>
                          <span>{activity.phase}</span><b>{activity.progress}%</b>
                        </div>
                          <em style={{ left: `${Math.min((end / maxDays) * 100 + 1, 94)}%` }}>{formatDate(new Date(projectStart + end * 86400000))}</em>
                          <label className="lob-productivity" title="Produtividade planejada por dia" onPointerDown={event => event.stopPropagation()}>
                            <span>ritmo</span>
                            <input type="number" min="0.1" step="0.1" value={lobProductivityDrafts[activity.id] ?? activity.productivity ?? ""} placeholder="—" onChange={event => setLobProductivityDrafts(prev => ({ ...prev, [activity.id]: event.target.value }))} onBlur={() => saveLobProductivity(activity)} onKeyDown={event => { if (event.key === "Enter") saveLobProductivity(activity); }} />
                          </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lob-flow-footer"><span><i className="planned-line" /> Planejado</span><span><i className="critical-line" /> Atividade crítica</span><span className="lob-flow-note">Use o Gantt para editar datas, duração e avanço</span></div>
              </div>
              </div>
            ) : (
              <div className="module-empty"><span>Inclua atividades no cronograma para calcular o ritmo planejado.</span></div>
            )}
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
  onNavigate,
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
  onNavigate: (label: string) => void;
  projectId: number;
  projectName: string;
  activities: any[];
  search: string;
  setSearch: (value: string) => void;
  plannedStart?: string | Date;
}) {
  const riskActivities = activities.filter(activity => activity.status === "Em risco");
  const completedActivities = activities.filter(activity => activity.progress >= 100);
  const setActiveNav = onNavigate;
  const [cronogramaTab, setCronogramaTab] = useState<"gantt" | "planejamento">("gantt");
  if (name === "Agente IA") return <AgentView />;
  if (name === "Orçamento")
    return <BudgetView projectId={projectId} projectName={projectName} />;
  if (name === "Catálogo") return <CatalogView />;
  if (name === "EAP")
    return <EapView projectId={projectId} projectName={projectName} />;
  if (name === "Produção")
    return <ProductionView projectId={projectId} projectName={projectName} />;
  if (name === "Restrições")
    return <RestrictionsView projectId={projectId} projectName={projectName} />;
  if (name === "Relatórios")
    return <ReportsView projectId={projectId} projectName={projectName} activities={activities} />;
  if (name === "Frentes")
    return <FrentesView projectId={projectId} projectName={projectName} />;
  if (name === "Medição")
    return <MedicaoView projectId={projectId} projectName={projectName} />;
  if (name === "Gráficos")
    return <GraficosView projectId={projectId} projectName={projectName} activities={activities} />;
  if (name === "Fórmulas")
    return <FormulasView projectName={projectName} />;
  if (name === "Cronogramas")
    return (
      <div className="module-page">
        <div className="module-hero">
          <div className="module-icon"><CalendarDays size={22} /></div>
          <div>
            <p className="eyebrow accent">CRONOGRAMA DA OBRA</p>
            <h2>Cronogramas</h2>
            <p>Acompanhe o planejamento e o Gantt calculado do projeto.</p>
          </div>
          <div className="module-hero-actions">
            <button
              type="button"
              className={`toolbar-tab ${cronogramaTab === "gantt" ? "active" : ""}`}
              onClick={() => setCronogramaTab("gantt")}
            >
              Gantt
            </button>
            <button
              type="button"
              className={`toolbar-tab ${cronogramaTab === "planejamento" ? "active" : ""}`}
              onClick={() => setCronogramaTab("planejamento")}
            >
              Planejamento
            </button>
            <button type="button" className="outline-button" onClick={onBack}>Voltar</button>
          </div>
        </div>
        {cronogramaTab === "gantt" ? (
          <GanttView
            key="cronograma-calculado"
            projectId={projectId}
            activities={activities}
            search={search}
            setSearch={setSearch}
            selectedName={projectName}
            plannedStart={plannedStart}
          />
        ) : (
          <PlanningView projectId={projectId} projectName={projectName} />
        )}
      </div>
    );
  if (name === "Linha de Balanço")
    return (
      <div className="module-page">
        <div className="module-hero">
          <div className="module-icon"><Activity size={22} /></div>
          <div>
            <p className="eyebrow accent">RITMO DE EXECUÇÃO</p>
            <h2>Linha de Balanço</h2>
            <p>Visualize o fluxo contínuo das atividades por semana.</p>
          </div>
          <div className="module-hero-actions">
            <button type="button" className="outline-button" onClick={() => onNavigate("Cronogramas")}>Cronograma</button>
            <button type="button" className="outline-button" onClick={() => onNavigate("Orçamento")}>Orçamento</button>
            <button type="button" className="outline-button" onClick={onBack}>Voltar</button>
          </div>
        </div>
        <GanttView
          key="linha-de-balanco"
          projectId={projectId}
          activities={activities}
          search={search}
          setSearch={setSearch}
          selectedName={projectName}
          plannedStart={plannedStart}
          initialTab="lob"
        />
      </div>
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
  const [location, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState(() => {
    try {
      const raw = window.localStorage.getItem("activeProjectId");
      const parsed = raw ? Number(raw) : 1;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    } catch {
      return 1;
    }
  });
  const [activeNav, setActiveNavState] = useState(() => labelFromPath(location));
  useEffect(() => {
    setActiveNavState(labelFromPath(location));
  }, [location]);
  useEffect(() => {
    try {
      window.localStorage.setItem("activeProjectId", String(selectedId));
    } catch {
      // localStorage indisponível (private mode) — seleção vale só na sessão
    }
  }, [selectedId]);
  useEffect(() => {
    if (!projects.length) return;
    if (!projects.some(project => project.id === selectedId)) {
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);
  const setActiveNav = (label: string) => {
    setActiveNavState(label);
    const path = NAV_PATHS[label] ?? "/";
    if (location !== path) setLocation(path);
  };
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLocation, setNewProjectLocation] = useState("");
  const [newProjectStart, setNewProjectStart] = useState("");
  const [newProjectFinish, setNewProjectFinish] = useState("");
  const [createError, setCreateError] = useState("");
  const utils = trpc.useUtils();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: project => {
      void Promise.all([
        projectsQuery.refetch(),
        utils.projects.activities.invalidate({ projectId: project.id }),
        utils.projects.wbs.invalidate({ projectId: project.id }),
      ]);
      setSelectedId(project.id);
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
  const budgetQuery = trpc.budgets.list.useQuery(
    { projectId: selected?.id ?? 1 },
    { enabled: Boolean(selected) }
  );
  const wbsQuery = trpc.projects.wbs.useQuery(
    { projectId: selected?.id ?? 1 },
    { enabled: Boolean(selected) }
  );
  const planningQuery = trpc.planning.list.useQuery(
    { projectId: selected?.id ?? 1 },
    { enabled: Boolean(selected) }
  );
  const budgetStatusLine = (() => {
    if (!budgetQuery.data) return "Orçamento: carregando…";
    if (budgetQuery.data.unavailable) return "Orçamento: indisponível (sem banco)";
    if (!budgetQuery.data.activeVersionId) return "Orçamento: sem versão";
    if (!budgetQuery.data.items.length) return "Orçamento: 0 serviços";
    const total = budgetQuery.data.total;
    const money = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(total);
    return `Orçamento: ${budgetQuery.data.items.length} serviço(s) · ${money}`;
  })();
  const wbsNodes = wbsQuery.data ?? [];
  const baselines = planningQuery.data?.baselines ?? [];
  const planningSteps = [
    {
      key: "eap",
      label: "EAP",
      done: wbsNodes.length > 0,
      detail: wbsNodes.length
        ? `${wbsNodes.length} nós`
        : "sem estrutura",
      nav: "EAP" as const,
    },
    {
      key: "orcamento",
      label: "Orçamento",
      done: Boolean(budgetQuery.data?.activeVersionId) && (budgetQuery.data?.total ?? 0) > 0,
      detail: !budgetQuery.data?.activeVersionId
        ? "sem versão"
        : (budgetQuery.data?.total ?? 0) > 0
          ? "com preços"
          : "sem preços",
      nav: "Orçamento" as const,
    },
    {
      key: "atividades",
      label: "Atividades",
      done: activities.length > 0,
      detail: activities.length ? `${activities.length} no cronograma` : "nenhuma",
      nav: "Cronogramas" as const,
    },
    {
      key: "baseline",
      label: "Baseline",
      done: baselines.length > 0,
      detail: baselines.length ? `${baselines.length} capturada(s)` : "não capturada",
      nav: "Cronogramas" as const,
    },
  ];
  const nextPlanningStep = planningSteps.find(step => !step.done);
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
    activeNav === "EAP"
      ? "eap"
      : activeNav === "Cronogramas"
        ? "cronograma"
        : activeNav === "Linha de Balanço"
          ? "lob"
          : activeNav === "Produção"
            ? "producao"
            : activeNav === "Medição"
              ? "medicao"
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
      location: newProjectLocation.trim() || "A cadastrar",
      plannedStart: newProjectStart ? new Date(`${newProjectStart}T00:00:00`) : undefined,
      plannedFinish: newProjectFinish ? new Date(`${newProjectFinish}T00:00:00`) : undefined,
    });
  };
  const createPending = createProjectMutation.isPending;
  return (
    <div className="app-frame">
      {mobileNavOpen && (
        <button
          className="mobile-nav-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside className={`app-sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
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
              onClick={() => {
                setActiveNav(item.label);
                setMobileNavOpen(false);
              }}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
              {item.label === "Restrições" && riskActivities.length > 0 && (
                <span className="nav-count">{riskActivities.length}</span>
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
                setMobileNavOpen(false);
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
            <button
              className="mobile-menu"
              aria-label="Abrir menu de navegação"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
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
          <div key={activeNav} className="tab-content-root">
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
                  Orçamento: "Serviços, quantitativos, preços e versões do orçamento.",
                  Catálogo: "Fontes de preços, insumos e composições de serviço.",
                  EAP: "Escopo, pacotes de trabalho e estrutura de entregas.",
                  Cronogramas: "Planejamento, baseline e caminho crítico.",
                  Frentes: "Onde a execução acontece — código, nome e local/trecho.",
                  Produção: "Ritmos, equipes e avanço físico.",
                  Medição: "Períodos de produção e avanço para acompanhamento da medição.",
                  Restrições: "Pendências que podem impactar o prazo.",
                  Relatórios: "Indicadores e visões executivas.",
                  Gráficos: "Planejado × realizado, produção e status das atividades.",
                  Fórmulas: "Catálogo canônico das fórmulas de domínio.",
                }[activeNav] || "Gestão integrada de obras."
              }
              onBack={() => setActiveNav("Portfólio")}
              onNavigate={setActiveNav}
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
                  <p className="portfolio-context-note">Portfólio consolidado: os indicadores abaixo resumem todas as obras. Os alertas, atividades, EAP, orçamento e cronograma detalhados pertencem somente à obra ativa: <strong>{selected?.name || "nenhuma selecionada"}</strong>.</p>
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
                  {selected && (
                    <div className="portfolio-quick-actions">
                      <span className="eyebrow">ABRIR NA OBRA ATIVA · {selected.name}</span>
                      <p className="budget-status-line">{budgetStatusLine}</p>
                      <div className="planning-checklist">
                        {planningSteps.map(step => (
                          <div className="planning-checklist-row" key={step.key}>
                            <span>
                              <CircleCheck
                                size={14}
                                className={step.done ? "ok" : "pending"}
                              />
                              {step.label}
                            </span>
                            <strong className={step.done ? "ok" : "pending"}>
                              {step.done ? "OK" : "Pendente"} · {step.detail}
                            </strong>
                          </div>
                        ))}
                        {nextPlanningStep ? (
                          <p className="planning-checklist-next">
                            Próximo passo: {nextPlanningStep.label} —{" "}
                            {nextPlanningStep.detail}
                          </p>
                        ) : (
                          <p className="planning-checklist-next">
                            Planejamento base completo para esta obra.
                          </p>
                        )}
                      </div>
                      <div className="portfolio-quick-buttons">
                        {nextPlanningStep && (
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => setActiveNav(nextPlanningStep.nav)}
                          >
                            Continuar: {nextPlanningStep.label}
                          </button>
                        )}
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => setActiveNav("Orçamento")}
                        >
                          <WalletCards size={14} /> Orçamento
                        </button>
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => setActiveNav("Cronogramas")}
                        >
                          <CalendarDays size={14} /> Cronogramas
                        </button>
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => setActiveNav("Linha de Balanço")}
                        >
                          <Activity size={14} /> Linha de Balanço
                        </button>
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => setActiveNav("EAP")}
                        >
                          <Layers3 size={14} /> EAP
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="portfolio-list">
                    {visibleProjects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => setSelectedId(project.id)}
                        title="Selecionar obra ativa — use os atalhos acima para abrir Orçamento ou Cronogramas"
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
              <section className="panel portfolio-next-step">
                <div>
                  <p className="eyebrow accent">PRÓXIMO PASSO OPERACIONAL</p>
                  <h3>Planeje a obra ativa em Cronogramas</h3>
                  <p>
                    O Portfólio mostra o resumo consolidado. Use Cronogramas
                    para editar atividades, calcular CPM, controlar baseline e
                    acompanhar o realizado.
                  </p>
                  {selected && <p className="budget-status-line">{budgetStatusLine}</p>}
                </div>
                <div className="portfolio-next-actions">
                  <button
                    className="outline-button"
                    onClick={() => setActiveNav("Cronogramas")}
                  >
                    Abrir Cronogramas <ChevronRight size={15} />
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setActiveNav("Orçamento")}
                  >
                    Abrir Orçamento <WalletCards size={15} />
                  </button>
                </div>
              </section>
            </>
          )}
          </div>
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
            <div className="modal-form-grid">
              <label>Local<input value={newProjectLocation} onChange={event => setNewProjectLocation(event.target.value)} placeholder="Ex.: Juazeiro do Norte - CE" /></label>
              <label>Início previsto<input type="date" value={newProjectStart} onChange={event => setNewProjectStart(event.target.value)} /></label>
              <label>Fim previsto<input type="date" value={newProjectFinish} onChange={event => setNewProjectFinish(event.target.value)} /></label>
            </div>
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
                {createProjectMutation.isPending ? "Salvando obra e plano…" : "Criar obra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
