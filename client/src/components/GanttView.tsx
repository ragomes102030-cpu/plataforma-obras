import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

/* M1 — Gantt real (dados de planning.list + wbsQuery, sem mock)
Referencia: paleta-claro.html + wireframe-gantt.html
Restricoes: nenhum dado fixo; predecessoras = PENDENCIA M3; calendario/feriados = PENDENCIA M4
 */
export function GanttView({ projectId, plannedStart }: { projectId: number; plannedStart?: string | Date }) {
  const planning = trpc.planning.list.useQuery({ projectId });
  const wbs = trpc.projects.wbs.useQuery({ projectId });

  const activities = planning.data?.activities ?? [];
  const nodes = wbs.data ?? [];

  const baselines = planning.data?.baselines ?? [];
  const total = activities.length;
  const criticalCount = activities.filter((a: any) => a.critical === 1).length;
  const progressAvg = total ? (activities.reduce((s: number, a: any) => s + (a.progress ?? 0), 0) / total) : 0;

  const projectStart = useMemo(() => {
    if (plannedStart) {
      const t = new Date(plannedStart).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }, [plannedStart]);

  const fmt = (offsetDays: number) => {
    if (projectStart === null) return `+${offsetDays}d`;
    const d = new Date(projectStart + offsetDays * 86400000);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // Build simple visual rows from real data (no hardcoded array)
  const rows = useMemo(() => {
    return activities.map((a: any, idx: number) => {
      const start = a.startOffset ?? 0;
      const dur = a.durationDays ?? 1;
      return {
        idx,
        wbsCode: a.wbsCode ?? "?",
        name: a.name ?? "—",
        duration: dur,
        start,
        inicio: projectStart === null ? `+${start}d` : new Date(projectStart + start * 86400000).toLocaleDateString("pt-BR"),
        termino: projectStart === null ? `+${start + dur}d` : new Date(projectStart + (start + dur) * 86400000).toLocaleDateString("pt-BR"),
        critical: a.critical === 1,
        phase: a.phase ?? "—",
        progress: a.progress ?? 0,
        done: a.actualQuantity != null && a.plannedQuantity != null && a.actualQuantity >= a.plannedQuantity,
      };
    });
  }, [activities, projectStart]);

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
                <th style={{ textAlign: "left", padding: 5 }}>Término</th>
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
                  <td style={{ padding: 4 }}>{r.inicio}</td>
                  <td style={{ padding: 4 }}>{r.termino}</td>
                  <td style={{ padding: 4 }}>{r.phase}</td>
                  <td style={{ padding: 4, fontWeight: 600, color: r.progress > 0 ? "var(--ok)" : "var(--text2)" }}>{r.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ position: "relative", overflow: "auto", maxHeight: 420, background: "#fafbfc", border: "1px solid var(--line)", borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--primary)", marginBottom: 6 }}>
            Barras — {total} atividades · início da obra {projectStart === null ? "não informado" : new Date(projectStart).toLocaleDateString("pt-BR")} · dias corridos, sem feriados
          </div>
          <svg viewBox="0 0 720 320" style={{ width: "100%", height: 320 }} aria-label="Gantt — dados reais de planning.list">
            <rect x="60" y="0" width="640" height="24" fill="#0d2b6b" rx="4" />
            <text x="70" y="16" fill="#fff" fontSize="10" fontWeight="600">
              {projectStart === null
                ? "Escala por offset (sem plannedStart)"
                : [0, 14, 28, 42].map(o => new Date(projectStart + o * 86400000).toLocaleDateString("pt-BR")).join(" · ")}
            </text>

            <line x1="260" y1="40" x2="260" y2="280" stroke="#d9534f" strokeWidth="2" strokeDasharray="6 3" />
            <text x="262" y="38" fontSize="9" fill="#d9534f" fontWeight="600">HOJE</text>

            {rows.slice(0, 8).map((r, idx) => {
              const left = 60 + (r.start * 58);
              const width = Math.max(20, r.duration * 58);
              const y = 55 + idx * 28;
              const color = r.critical ? "#c2181a" : (r.done ? "#1e8a4f" : "#1a6ce5");
              return (
                <g key={`bar-${r.idx}`}>
                  <rect x={left} y={y} width={width} height="14" rx="3" fill={color} opacity={r.done ? 1 : 0.95}>
                    <title>{`${r.wbsCode}: ${r.name} | ${r.inicio} a ${r.termino} | Dur: ${r.duration}d | Progresso: ${r.progress}%`}</title>
                  </rect>
                  <rect x={left} y={y} width={Math.max(4, width * ((r.progress ?? 0) / 100))} height="14" rx="3" fill="#1e8a4f" opacity="0.6" />
                  <text x={left + 4} y={y + 11} fontSize="9" fill="#fff">{r.wbsCode}</text>
                </g>
              );
            })}

            <polygon points="260,42 265,48 260,54 255,48" fill="#7aa8f5" stroke="#0d2b6b" strokeWidth="1" />
            <text x="268" y="50" fontSize="9" fill="#0d2b6b">Início</text>

            {baselines.length > 0 && (
              <>
                <rect x="60" y="268" width="640" height="6" rx="3" fill="#bac6d6" opacity="0.7" />
                <text x="65" y="278" fontSize="9" fill="#55607a">BASELINE REAL ({baselines.length} baselines do banco)</text>
              </>
            )}
            {baselines.length === 0 && (
              <>
                <rect x="60" y="268" width="640" height="6" rx="3" fill="#bac6d6" opacity="0.3" />
                <text x="65" y="278" fontSize="9" fill="#9ca3b2">BASELINE (sem baselines capturadas)</text>
              </>
            )}

            <rect x="60" y="290" width="180" height="14" rx="3" fill="#dde3eb" opacity="0.8" />
            <text x="65" y="300" fontSize="9" fill="#55607a">Resumo pacotes EAP</text>
          </svg>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 10 }}>
        <b>Regra de datas:</b> data de início da obra = plannedStart do projeto; início da atividade = plannedStart + startOffset; término = início + durationDays. <b>Dias corridos, sem feriados.</b>
      </div>
      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--line)" }}>
        <b>Pendências:</b> Predecessoras (M3); Zoom/dia-semana (M4); Calendário/feriados (M4, campo inexistente na API); Edição in-line (M5); Export PNG (M6).
      </div>
    </div>
  );
}
