import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

type Dep = { predecessorId: number; successorId: number; type: string; lag?: number };

const ROW_H = 24;
const LABEL_W = 300;
const CHART_W = 720;
const HEADER_H = 44;

export function GanttView({ projectId, plannedStart }: { projectId: number; plannedStart?: string | Date }) {
  const planning = trpc.planning.list.useQuery({ projectId });
  const activities = planning.data?.activities ?? [];
  const dependencies: Dep[] = (planning.data?.dependencies ?? []) as Dep[];
  const baselines = planning.data?.baselines ?? [];

  const total = activities.length;
  const criticalCount = activities.filter((a: any) => a.critical === 1).length;
  const progressAvg = total ? activities.reduce((s: number, a: any) => s + (a.progress ?? 0), 0) / total : 0;

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

  const maxDay = useMemo(
    () => Math.max(1, ...activities.map((a: any) => (a.startOffset ?? 0) + (a.durationDays ?? 1))),
    [activities]
  );
  const scale = CHART_W / maxDay;

  const rows = useMemo(
    () =>
      activities.map((a: any, idx: number) => ({
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
    [activities, projectStart]
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
        Atividades: {total} · Críticas: {criticalCount} · Progresso médio: {Math.round(progressAvg)}% · Dependências: {dependencies.length} ·
        início da obra {projectStart === null ? "não informado" : new Date(projectStart).toLocaleDateString("pt-BR")} · dias corridos, sem feriados
      </p>

      {planning.isPending && <div style={{ padding: 12, color: "var(--text2)" }}>Carregando atividades...</div>}
      {planning.error && <div style={{ padding: 12, color: "var(--crit)" }}>Erro ao carregar atividades.</div>}

      <div style={{ overflow: "auto", maxHeight: 460, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: 0 }}>
          <table style={{ flex: `0 0 ${LABEL_W}px`, borderCollapse: "collapse", fontSize: 11, position: "sticky", left: 0, background: "var(--surf)", zIndex: 2 }}>
            <thead>
              <tr style={{ background: "var(--primary)", color: "#fff", position: "sticky", top: 0, zIndex: 3 }}>
                <th style={{ textAlign: "left", padding: 5 }}>EAP</th>
                <th style={{ textAlign: "left", padding: 5 }}>Nome</th>
                <th style={{ textAlign: "left", padding: 5 }}>Início</th>
                <th style={{ textAlign: "left", padding: 5 }}>Término</th>
                <th style={{ textAlign: "left", padding: 5 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ height: ROW_H, borderBottom: "1px solid var(--line)", background: r.critical ? "#fff5f5" : undefined }}>
                  <td style={{ padding: "0 5px", color: r.critical ? "var(--crit)" : "inherit", fontWeight: r.critical ? 600 : 400 }}>{r.wbsCode}</td>
                  <td style={{ padding: "0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={r.name}>{r.name}</td>
                  <td style={{ padding: "0 5px" }}>{r.inicio}</td>
                  <td style={{ padding: "0 5px" }}>{r.termino}</td>
                  <td style={{ padding: "0 5px", fontWeight: 600, color: r.progress > 0 ? "var(--ok)" : "var(--text2)" }}>{r.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <svg width={CHART_W + 20} height={svgH} style={{ flex: "0 0 auto" }} aria-label="Gantt com dependências">
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#7a8699" />
              </marker>
            </defs>

            <rect x={LABEL_W} y={0} width={CHART_W} height={HEADER_H - 16} fill="#0d2b6b" rx="4" />
            <text x={LABEL_W + 8} y={20} fill="#fff" fontSize={10} fontWeight={600}>
              {[0, Math.round(maxDay / 3), Math.round((2 * maxDay) / 3), maxDay].map((o) => dateAt(o)).join("  ·  ")}
            </text>

            {rows.map((r) => {
              const p = posById.get(r.id)!;
              const w = Math.max(6, r.duration * scale);
              const color = r.critical ? "#c2181a" : "#1a6ce5";
              return (
                <g key={`bar-${r.id}`}>
                  <rect x={p.x0} y={p.y + 5} width={w} height={14} rx={3} fill={color} opacity={0.95}>
                    <title>{`${r.wbsCode}: ${r.name} | ${r.inicio} a ${r.termino} | Dur: ${r.duration}d | Progresso: ${r.progress}%`}</title>
                  </rect>
                  <rect x={p.x0} y={p.y + 5} width={Math.max(3, w * (r.progress / 100))} height={14} rx={3} fill="#1e8a4f" opacity={0.6} />
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
        <b>M3 — Dependências:</b> setas FS/SS/FF/SF ligadas às {dependencies.length} dependências do banco, com lag quando ≠ 0.
        Tipos no dados: FS e SS. <b>Pendências:</b> Zoom/calendário (M4), Edição (M5), Export (M6).
      </div>
    </div>
  );
}
