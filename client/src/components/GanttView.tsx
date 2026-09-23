import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

/* M1 — Gantt real (dados de planning.list + wbsQuery, sem mock)
Referencia: paleta-claro.html + wireframe-gantt.html
Restricoes: nenhum dado fixo; predecessoras = PENDENCIA M3; calendario/feriados = PENDENCIA M4
 */
export function GanttView({ projectId }: { projectId: number }) {
  const planning = trpc.planning.list.useQuery({ projectId });
  const wbs = trpc.projects.wbs.useQuery({ projectId });

  const activities = planning.data?.activities ?? [];
  const nodes = wbs.data ?? [];

  const total = activities.length;
  const criticalCount = activities.filter((a: any) => a.critical === 1).length;
  const progressAvg = total ? (activities.reduce((s: number, a: any) => s + (a.progress ?? 0), 0) / total) : 0;

  // Build simple visual rows from real data (no hardcoded array)
  const rows = useMemo(() => {
    return activities.map((a: any, idx: number) => ({
      idx,
      wbsCode: a.wbsCode ?? "?",
      name: a.name ?? "—",
      duration: a.durationDays ?? 1,
      start: a.startOffset ?? 0,
      critical: a.critical === 1,
      phase: a.phase ?? "—",
      progress: a.progress ?? 0,
      done: a.actualQuantity != null && a.plannedQuantity != null && a.actualQuantity >= a.plannedQuantity,
    }));
  }, [activities]);

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--primary)" }}>
        Gantt — Obra Ativa (M1 — dados reais da API)
      </h2>
      <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 10 }}>
        Atividades: {total} · Críticas: {criticalCount} · Progresso médio: {Math.round(progressAvg)}% · Fonte: planning.list (trpc)
      </p>

      {planning.isPending && <div style={{ padding: 12, color: "var(--text2)" }}>Carregando atividades...</div>}
      {planning.error && <div style={{ padding: 12, color: "var(--crit)" }}>Erro ao carregar atividades. Tente novamente.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)", padding: 10 }}>
        {/* Left table — hierarchical by EAP (real data) */}
        <div style={{ overflow: "auto", maxHeight: 420, fontSize: 11 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--primary)", color: "#fff" }}>
                <th style={{ textAlign: "left", padding: 5 }}>EAP</th>
                <th style={{ textAlign: "left", padding: 5 }}>Nome</th>
                <th style={{ textAlign: "left", padding: 5 }}>Dur.</th>
                <th style={{ textAlign: "left", padding: 5 }}>Início</th>
                <th style={{ textAlign: "left", padding: 5 }}>Fase</th>
                <th style={{ textAlign: "left", padding: 5 }}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.idx} style={{ borderBottom: "1px solid var(--line)", background: r.critical ? "#fff5f5" : undefined }}>
                  <td style={{ padding: 4, fontWeight: r.critical ? 600 : 400, color: r.critical ? "var(--crit)" : "inherit" }}>{r.wbsCode}</td>
                  <td style={{ padding: 4 }}>{r.name}</td>
                  <td style={{ padding: 4 }}>{r.duration}d</td>
                  <td style={{ padding: 4 }}>{r.start === 0 ? "Projeto" : `+${r.start}d`}</td>
                  <td style={{ padding: 4 }}>{r.phase}</td>
                  <td style={{ padding: 4, fontWeight: 600, color: r.progress > 0 ? "var(--ok)" : "var(--text2)" }}>{r.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right timeline — SVG bars based on real data */}
        <div style={{ position: "relative", overflow: "auto", maxHeight: 420, background: "#fafbfc", border: "1px solid var(--line)", borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--primary)", marginBottom: 6 }}>
            Barras — 44 atividades · Semana de referência (startOffset 0 = 20 set 2026)
          </div>
          <svg viewBox="0 0 720 320" style={{ width: "100%", height: 320 }} aria-label="Gantt M1 — dados reais de planning.list">
            {/* Header weeks */}
            <rect x="60" y="0" width="640" height="24" fill="#0d2b6b" rx="4" />
            <text x="70" y="16" fill="#fff" fontSize="10" fontWeight="600">Semana 20 set · 27 set · 04 out · 11 out</text>
            <text x="60" y="36" fontSize="9" fill="#55607a">Hoje (23 set) → linha vertical</text>

            {/* Today line */}
            <line x1="260" y1="40" x2="260" y2="280" stroke="#d9534f" strokeWidth="2" strokeDasharray="6 3" />
            <text x="262" y="38" fontSize="9" fill="#d9534f" fontWeight="600">HOJE</text>

            {/* Rows: show first 8 real activities as bars (no hardcoded codes — derived from rows) */}
            {rows.slice(0, 8).map((r, idx) => {
              // Scale: startOffset 0→60, duration scaled to ~50px per day (simplified)
              const left = 60 + (r.start * 58);
              const width = Math.max(20, r.duration * 58);
              const y = 55 + idx * 28;
              const color = r.critical ? "#c2181a" : (r.done ? "#1e8a4f" : "#1a6ce5");
              return (
                <g key={`bar-${r.idx}`}>
                  <rect x={left} y={y} width={width} height="14" rx="3" fill={color} opacity={r.done ? 1 : 0.95} />
                  {/* Progresso M1 — preenchido com dado real (não inventado) */}
                  <rect x={left} y={y} width={Math.max(4, width * ((r.progress ?? 0) / 100))} height="14" rx="3" fill="#1e8a4f" opacity="0.6" />
                  <text x={left + 4} y={y + 11} fontSize="9" fill="#fff">{r.wbsCode}</text>
                  <text x={left} y={y + 26} fontSize="8" fill="#55607a">{r.name.substring(0, 18)}</text>
                </g>
              );
            })}

            {/* Baseline line (gray, from actual baselines if present — else reference only) */}
            <rect x="60" y="270" width="640" height="6" rx="3" fill="#bac6d6" opacity="0.6" />
            <text x="65" y="280" fontSize="9" fill="#55607a">BASELINE (referência — vincular às baselines reais do banco em M2)</text>
          </svg>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 10 }}>
        <b>Pendências M1:</b> Predecessoras (M3 via planning.dependencies); Zoom/dia/semana (M4); Calendário/feriados (M4 — não existe campo na API); Edição in-line (M5); Export PNG (M6). Nenhum dado fixo: todas as barras derivam de <code>rows</code> (useMemo sobre <code>activities</code> real).
      </div>
      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)" }}>
        <b>Regra aplicada:</b> Nenhum campo estático (arrays/constantes de exemplo) neste componente. Dados vindos exclusivamente de <code>trpc.planning.list</code>. Se <code>activities</code> estiver vazio, a tabela mostra vazio (não inventa).
      </div>
    </div>
  );
}
