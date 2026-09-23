import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type Dep = { predecessorId: number; successorId: number; type: string; lag?: number };
type Zoom = "dia" | "semana" | "mes";

const ROW_H = 26;
const LABEL_W = 320;
const HEADER_H = 46;
const ZOOM_FACTOR: Record<Zoom, number> = { mes: 1, semana: 3, dia: 10 };

export function GanttView({ projectId, plannedStart }: { projectId: number; plannedStart?: string | Date }) {
  const planning = trpc.planning.list.useQuery({ projectId });
  const activities = planning.data?.activities ?? [];
  const dependencies: Dep[] = (planning.data?.dependencies ?? []) as Dep[];
  const baselines = planning.data?.baselines ?? [];

  const [zoom, setZoom] = useState<Zoom>("mes");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [cols, setCols] = useState({ eap: true, nome: true, inicio: true, termino: true, dur: true, pct: true });
  const [colsOpen, setColsOpen] = useState(false);

  const projectStart = useMemo(() => {
    if (plannedStart) {
      const t = new Date(plannedStart).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }, [plannedStart]);

  const dateAt = (offsetDays: number) => {
    if (projectStart === null) return `+${offsetDays}d`;
    return new Date(projectStart + offsetDays * 86400000).toLocaleDateString("pt-BR");
  };

  const visible = useMemo(
    () => (onlyCritical ? activities.filter((a: any) => a.critical === 1) : activities),
    [activities, onlyCritical]
  );

  const total = activities.length;
  const criticalCount = activities.filter((a: any) => a.critical === 1).length;
  const progressAvg = total ? activities.reduce((s: number, a: any) => s + (a.progress ?? 0), 0) / total : 0;

  const maxDay = useMemo(
    () => Math.max(1, ...visible.map((a: any) => (a.startOffset ?? 0) + (a.durationDays ?? 1))),
    [visible]
  );
  const chartW = 720 * ZOOM_FACTOR[zoom];
  const scale = chartW / maxDay;

  const rows = useMemo(
    () =>
      visible.map((a: any, idx: number) => ({
        idx,
        id: a.id,
        wbsCode: a.wbsCode ?? "?",
        name: a.name ?? "—",
        duration: a.durationDays ?? 1,
        start: a.startOffset ?? 0,
        inicio: dateAt(a.startOffset ?? 0),
        termino: dateAt((a.startOffset ?? 0) + (a.durationDays ?? 1)),
        critical: a.critical === 1,
        progress: a.progress ?? 0,
      })),
    [visible, projectStart]
  );

  const posById = useMemo(() => {
    const m = new Map<number, { y: number; x0: number; x1: number }>();
    rows.forEach((r) => {
      const y = HEADER_H + r.idx * ROW_H;
      const x0 = LABEL_W + r.start * scale;
      const x1 = x0 + Math.max(6, r.duration * scale);
      m.set(r.id, { y, x0, x1 });
    });
    return m;
  }, [rows, scale]);

  const svgH = HEADER_H + rows.length * ROW_H + 40;

  const arrow = (dep: Dep) => {
    const p = posById.get(dep.predecessorId);
    const s = posById.get(dep.successorId);
    if (!p || !s) return null;
    const t = (dep.type ?? "FS").toUpperCase();
    const xStart = t === "SS" || t === "SF" ? p.x0 : p.x1;
    const xEnd = t === "FS" || t === "SS" ? s.x0 : s.x1;
    const y0 = p.y + ROW_H / 2;
    const y1 = s.y + ROW_H / 2;
    const bend = Math.max(14, Math.abs(xEnd - xStart) / 2);
    const midX = xStart + (xEnd > xStart ? bend : -bend);
    const d = `M ${xStart} ${y0} L ${midX} ${y0} L ${midX} ${y1} L ${xEnd} ${y1}`;
    const lag = Number(dep.lag ?? 0);
    return (
      <g key={`${dep.predecessorId}-${dep.successorId}-${t}`}>
        <path d={d} fill="none" stroke="#7a8699" strokeWidth={1} markerEnd="url(#arrowhead)" />
        <text x={(midX + xEnd) / 2} y={(y0 + y1) / 2 - 2} fontSize={8} fill="#55607a">
          {t}
          {lag !== 0 ? (lag > 0 ? `+${lag}` : `${lag}`) : ""}
        </text>
      </g>
    );
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--primary)" }}>Gantt da obra</h2>
      <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 10 }}>
        Atividades: {total} · visíveis: {rows.length} · Críticas: {criticalCount} · Dependências: {dependencies.length} ·
        início da obra {projectStart === null ? "não informado" : new Date(projectStart).toLocaleDateString("pt-BR")} · dias corridos, sem feriados
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text2)" }}>Zoom:</span>
        {(["dia", "semana", "mes"] as Zoom[]).map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: "1px solid var(--border)",
              background: zoom === z ? "var(--primary)" : "var(--surf)",
              color: zoom === z ? "#fff" : "var(--text)",
            }}
          >
            {z === "dia" ? "Dia" : z === "semana" ? "Semana" : "Mês"}
          </button>
        ))}
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
          <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} />
          Só críticas
        </label>
        <button
          onClick={() => setColsOpen((v) => !v)}
          style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: colsOpen ? "var(--primary)" : "var(--surf)", color: colsOpen ? "#fff" : "var(--text)" }}
        >
          Colunas
        </button>
      </div>

      {colsOpen && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, padding: 8, border: "1px dashed var(--line)", borderRadius: 6, marginBottom: 8 }}>
          {(Object.keys(cols) as (keyof typeof cols)[]).map((k) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={cols[k]} onChange={(e) => setCols({ ...cols, [k]: e.target.checked })} />
              {k === "eap" ? "EAP" : k === "nome" ? "Nome" : k === "inicio" ? "Início" : k === "termino" ? "Término" : k === "dur" ? "Duração" : "%"}
            </label>
          ))}
        </div>
      )}

      {planning.isPending && <div style={{ padding: 12, color: "var(--text2)" }}>Carregando atividades...</div>}
      {planning.error && <div style={{ padding: 12, color: "var(--crit)" }}>Erro ao carregar atividades.</div>}

      <div style={{ overflow: "auto", maxHeight: 460, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: 0 }}>
          <table style={{ flex: `0 0 ${LABEL_W}px`, borderCollapse: "collapse", fontSize: 11, position: "sticky", left: 0, background: "var(--surf)", zIndex: 2 }}>
            <thead>
              <tr style={{ background: "var(--primary)", color: "#fff", position: "sticky", top: 0, zIndex: 3 }}>
                {cols.eap && <th style={{ textAlign: "left", padding: 5 }}>EAP</th>}
                {cols.nome && <th style={{ textAlign: "left", padding: 5 }}>Nome</th>}
                {cols.inicio && <th style={{ textAlign: "left", padding: 5 }}>Início</th>}
                {cols.termino && <th style={{ textAlign: "left", padding: 5 }}>Término</th>}
                {cols.dur && <th style={{ textAlign: "left", padding: 5 }}>Dur.</th>}
                {cols.pct && <th style={{ textAlign: "left", padding: 5 }}>%</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ height: ROW_H, borderBottom: "1px solid var(--line)", background: r.critical ? "#fff5f5" : undefined }}>
                  {cols.eap && <td style={{ padding: "0 5px", color: r.critical ? "var(--crit)" : "inherit", fontWeight: r.critical ? 600 : 400 }}>{r.wbsCode}</td>}
                  {cols.nome && <td style={{ padding: "0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={r.name}>{r.name}</td>}
                  {cols.inicio && <td style={{ padding: "0 5px" }}>{r.inicio}</td>}
                  {cols.termino && <td style={{ padding: "0 5px" }}>{r.termino}</td>}
                  {cols.dur && <td style={{ padding: "0 5px" }}>{r.duration}d</td>}
                  {cols.pct && <td style={{ padding: "0 5px", fontWeight: 600, color: r.progress > 0 ? "var(--ok)" : "var(--text2)" }}>{r.progress}%</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <svg width={chartW + 20} height={svgH} style={{ flex: "0 0 auto" }} aria-label="Gantt com dependências">
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#7a8699" />
              </marker>
            </defs>

            <rect x={LABEL_W} y={0} width={chartW} height={HEADER_H - 16} fill="#0d2b6b" rx="4" />
            <text x={LABEL_W + 8} y={20} fill="#fff" fontSize={10} fontWeight={600}>
              {[0, Math.round(maxDay / 3), Math.round((2 * maxDay) / 3), maxDay].map((o) => dateAt(o)).join("  ·  ")}
            </text>

            {rows.map((r) => {
              const p = posById.get(r.id)!;
              const w = Math.max(6, r.duration * scale);
              const color = r.critical ? "#c2181a" : "#1a6ce5";
              return (
                <g key={`bar-${r.id}`}>
                  <rect x={p.x0} y={p.y + 6} width={w} height={14} rx={3} fill={color} opacity={0.95}>
                    <title>{`${r.wbsCode}: ${r.name} | ${r.inicio} a ${r.termino} | Dur: ${r.duration}d | Progresso: ${r.progress}%`}</title>
                  </rect>
                  <rect x={p.x0} y={p.y + 6} width={Math.max(3, w * (r.progress / 100))} height={14} rx={3} fill="#1e8a4f" opacity={0.6} />
                </g>
              );
            })}

            {dependencies.map(arrow)}

            {baselines.length > 0 && (
              <text x={LABEL_W} y={svgH - 16} fontSize={9} fill="#55607a">BASELINE REAL ({baselines.length} baselines do banco)</text>
            )}
          </svg>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 10 }}>
        <b>M4:</b> zoom Dia/Semana/Mês, colunas configuráveis e filtro "só críticas" ativos.
        <b> Pendência:</b> calendário/dias não úteis — API não fornece campos de feriados/workdays. <b>M5/M6:</b> edição e export não implementados.
      </div>
    </div>
  );
}
