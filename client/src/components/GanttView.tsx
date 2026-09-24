import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

type Dep = { predecessorId: number; successorId: number; type: string; lag?: number };
type Activity = { id: number; wbsCode?: string; name?: string; durationDays?: number; startOffset?: number; critical?: number; progress?: number; phase?: string; status?: string; earlyStart?: number | null };
type Zoom = "dia" | "semana" | "mes";

const ROW_H = 26;
const LABEL_W = 320;
const HEADER_H = 46;
const ZOOM_FACTOR: Record<Zoom, number> = { mes: 1, semana: 3, dia: 10 };

export function GanttView({ projectId, plannedStart }: { projectId: number; plannedStart?: string | Date }) {
  const utils = trpc.useUtils();
  const planning = trpc.planning.list.useQuery({ projectId });
  const activities: Activity[] = planning.data?.activities ?? [];
  const dependencies: Dep[] = (planning.data?.dependencies ?? []) as Dep[];
  const baselines = planning.data?.baselines ?? [];

  const [zoom, setZoom] = useState<Zoom>("mes");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [cols, setCols] = useState({ eap: true, nome: true, inicio: true, termino: true, dur: true, pct: true });
  const [colsOpen, setColsOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: number; mode: "move" | "resize"; startX: number; origStart: number; origDur: number } | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rasterize = async (): Promise<HTMLCanvasElement | null> => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[stroke='var(--warn)']").forEach((n) => n.setAttribute("stroke", "#c48a00"));
    const w = svg.clientWidth || chartWFallback();
    const h = svg.clientHeight || 400;
    const data = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const chartWFallback = () => 720 + 20;

  const exportPng = async () => {
    try {
      const canvas = await rasterize();
      if (!canvas) { setMsg("Falha ao exportar PNG."); return; }
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `gantt-obra-${projectId}.png`;
      a.click();
      setMsg("PNG exportado.");
    } catch {
      setMsg("Falha ao exportar PNG.");
    }
  };

  const exportPdf = async () => {
    try {
      const canvas = await rasterize();
      if (!canvas) { setMsg("Falha ao exportar PDF."); return; }
      const win = window.open("", "_blank");
      if (!win) { setMsg("Bloqueador de pop-up impediu o PDF."); return; }
      const img = canvas.toDataURL("image/png");
      win.document.write(`<html><head><title>Gantt da obra</title></head><body style="margin:0"><img src="${img}" style="width:100%"/></body></html>`);
      win.document.close();
      win.focus();
      win.print();
      setMsg("PDF: use a impressão do navegador para salvar.");
    } catch {
      setMsg("Falha ao exportar PDF.");
    }
  };

  const invalidate = () => utils.planning.list.invalidate({ projectId });
  const updateActivity = trpc.projects.updateActivity.useMutation({ onSuccess: async () => { setMsg("Atividade atualizada. CPM recalculando..."); await invalidate(); } , onError: (e) => setMsg("Erro ao salvar: " + e.message) });
  const createDependency = trpc.planning.createDependency.useMutation({ onSuccess: async () => { setMsg("Dependência criada."); await invalidate(); }, onError: (e) => setMsg("Erro ao ligar: " + e.message) });
  const calculateCpm = trpc.planning.calculateCpm.useMutation({ onSuccess: async () => { setMsg("CPM recalculado."); await invalidate(); }, onError: (e) => setMsg("Erro no CPM: " + e.message) });

  const projectStart = useMemo(() => {
    if (plannedStart) {
      const t = new Date(plannedStart).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }, [plannedStart]);

  const dateAt = (o: number) => (projectStart === null ? `+${o}d` : new Date(projectStart + o * 86400000).toLocaleDateString("pt-BR"));

  const visible = useMemo(() => (onlyCritical ? activities.filter((a) => a.critical === 1) : activities), [activities, onlyCritical]);
  const total = activities.length;
  const criticalCount = activities.filter((a) => a.critical === 1).length;
  const progressAvg = total ? activities.reduce((s, a) => s + (a.progress ?? 0), 0) / total : 0;

  const maxDay = useMemo(() => Math.max(1, ...visible.map((a) => (a.startOffset ?? 0) + (a.durationDays ?? 1))), [visible]);
  const chartW = 720 * ZOOM_FACTOR[zoom];
  const scale = chartW / maxDay;

  const rows = useMemo(
    () =>
      visible.map((a, idx) => ({
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

  const commitMove = (id: number, nextStart: number) => {
    const a = activities.find((x) => x.id === id);
    if (!a) return;
    updateActivity.mutate(
      {
        projectId,
        activityId: id,
        name: a.name ?? "Atividade",
        phase: a.phase ?? "Execução",
        startOffset: Math.max(0, Math.round(nextStart)),
        earlyStart: Math.max(0, Math.round(nextStart)),
        durationDays: a.durationDays ?? 1,
        progress: a.progress ?? 0,
        status: (a.status as any) ?? "Não iniciado",
      },
      { onSuccess: () => calculateCpm.mutate({ projectId }) }
    );
  };

  const commitResize = (id: number, nextDur: number) => {
    const a = activities.find((x) => x.id === id);
    if (!a) return;
    updateActivity.mutate(
      {
        projectId,
        activityId: id,
        name: a.name ?? "Atividade",
        phase: a.phase ?? "Execução",
        startOffset: a.startOffset ?? 0,
        durationDays: Math.max(1, Math.round(nextDur)),
        progress: a.progress ?? 0,
        status: (a.status as any) ?? "Não iniciado",
      },
      { onSuccess: () => calculateCpm.mutate({ projectId }) }
    );
  };

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
        <text x={(midX + xEnd) / 2} y={(y0 + y1) / 2 - 2} fontSize={8} fill="#55607a">{t}{lag !== 0 ? (lag > 0 ? `+${lag}` : `${lag}`) : ""}</text>
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
          <button key={z} onClick={() => setZoom(z)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: zoom === z ? "var(--primary)" : "var(--surf)", color: zoom === z ? "#fff" : "var(--text)" }}>
            {z === "dia" ? "Dia" : z === "semana" ? "Semana" : "Mês"}
          </button>
        ))}
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
          <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} /> Só críticas
        </label>
        <button onClick={() => setColsOpen((v) => !v)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: colsOpen ? "var(--primary)" : "var(--surf)", color: colsOpen ? "#fff" : "var(--text)" }}>Colunas</button>
        <button onClick={() => { setLinkMode((v) => !v); setLinkFrom(null); }} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: linkMode ? "var(--warn)" : "var(--surf)", color: "var(--text)" }}>
          {!linkMode ? "Ligar dependência" : linkFrom === null ? "Ligar: clique na 1ª barra" : `Ligar de ${linkFrom}: clique na 2ª`}
        </button>
        <button onClick={exportPng} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surf)", color: "var(--text)" }}>Exportar PNG</button>
        <button onClick={exportPdf} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surf)", color: "var(--text)" }}>Exportar PDF</button>
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

      {msg && <div style={{ fontSize: 11, color: "var(--ok)", marginBottom: 6 }}>{msg}</div>}
      {planning.isPending && <div style={{ padding: 12, color: "var(--text2)" }}>Carregando atividades...</div>}
      {planning.error && <div style={{ padding: 12, color: "var(--crit)" }}>Erro ao carregar atividades.</div>}

      <div style={{ overflow: "auto", maxHeight: 460, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)" }}>
        <div
          style={{ display: "flex", alignItems: "flex-start", minWidth: 0 }}
          onMouseMove={(e) => {
            if (!drag) return;
            const deltaDays = (e.clientX - drag.startX) / scale;
            if (drag.mode === "move") commitMove(drag.id, drag.origStart + deltaDays);
            else commitResize(drag.id, drag.origDur + deltaDays);
            setDrag(null);
          }}
          onMouseUp={() => setDrag(null)}
          onMouseLeave={() => setDrag(null)}
        >
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

          <svg ref={svgRef} width={chartW + 20} height={svgH} style={{ flex: "0 0 auto", cursor: drag ? "grabbing" : "default" }} aria-label="Gantt editável com dependências">
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
              const isLinkSource = linkFrom === r.id;
              return (
                <g key={`bar-${r.id}`}>
                  <rect
                    x={p.x0}
                    y={p.y + 6}
                    width={w}
                    height={14}
                    rx={3}
                    fill={color}
                    opacity={0.95}
                    stroke={isLinkSource ? "var(--warn)" : "transparent"}
                    strokeWidth={isLinkSource ? 2 : 0}
                    style={{ cursor: linkMode ? "crosshair" : "move" }}
                    onMouseDown={(e) => {
                      if (linkMode) return;
                      e.preventDefault();
                      setDrag({ id: r.id, mode: "move", startX: e.clientX, origStart: r.start, origDur: r.duration });
                    }}
                    onClick={() => {
                      if (!linkMode) return;
                      if (linkFrom === null) { setLinkFrom(r.id); return; }
                      if (linkFrom === r.id) { setLinkFrom(null); return; }
                      createDependency.mutate({ projectId, predecessorId: linkFrom, successorId: r.id, type: "FS", lag: 0 });
                      setLinkFrom(null);
                      setLinkMode(false);
                    }}
                  >
                    <title>{`${r.wbsCode}: ${r.name} | ${r.inicio} a ${r.termino} | Dur: ${r.duration}d | Progresso: ${r.progress}% | arraste p/ mover`}</title>
                  </rect>
                  <rect x={p.x0} y={p.y + 6} width={Math.max(3, w * (r.progress / 100))} height={14} rx={3} fill="#1e8a4f" opacity={0.6} style={{ pointerEvents: "none" }} />
                  <rect
                    x={p.x1 - 4}
                    y={p.y + 4}
                    width={8}
                    height={18}
                    fill="transparent"
                    style={{ cursor: "ew-resize" }}
                    onMouseDown={(e) => {
                      if (linkMode) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDrag({ id: r.id, mode: "resize", startX: e.clientX, origStart: r.start, origDur: r.duration });
                    }}
                  >
                    <title>Arraste para mudar a duração</title>
                  </rect>
                </g>
              );
            })}

            {dependencies.map(arrow)}

            {baselines.length > 0 && <text x={LABEL_W} y={svgH - 16} fontSize={9} fill="#55607a">BASELINE REAL ({baselines.length} baselines do banco)</text>}
          </svg>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 10 }}>
        <b>M5:</b> arraste a barra para mover; arraste a alça direita para mudar a duração; use "Ligar" e clique em 2 barras para criar FS. Cada ação grava via API e recalcula o CPM.
        <b> M6:</b> exporte PNG ou PDF. <b>M3/M4:</b> setas FS/SS com lag, zoom, colunas, filtro.
      </div>
    </div>
  );
}
