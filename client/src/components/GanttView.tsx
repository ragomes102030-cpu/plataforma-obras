import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  defaultCalendar,
  dateAt as dateAtWorkCalendar,
} from "@shared/work-calendar";

type Dep = { predecessorId: number; successorId: number; type: string; lag?: number };
type Activity = { id: number; wbsCode?: string; name?: string; durationDays?: number; startOffset?: number; critical?: number; progress?: number; phase?: string; status?: string; earlyStart?: number | null; totalFloat?: number | null; freeFloat?: number | null; mustStartOn?: string | Date | null; finishNoLaterThan?: string | Date | null };
type Zoom = "dia" | "semana" | "mes";

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;


const isoOf = (v: string | Date) => (v instanceof Date ? v : new Date(v));
const constraintLabel = (v: string | Date) => {
  const d = isoOf(v);
  if (Number.isNaN(d.getTime())) return null;
  return localIso(d);
};

const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const ROW_H = 26;
const LABEL_W = 320;
const HEADER_H = 46;
const ZOOM_FACTOR: Record<Zoom, number> = { mes: 1, semana: 3, dia: 10 };

export function GanttView({ projectId, plannedStart, onSelectActivity, fill = false }: { projectId: number; plannedStart?: string | Date; onSelectActivity?: (id: number) => void; fill?: boolean }) {
  const utils = trpc.useUtils();
  const planning = trpc.planning.list.useQuery({ projectId });
  const activities: Activity[] = planning.data?.activities ?? [];
  const dependencies: Dep[] = (planning.data?.dependencies ?? []) as Dep[];
  const baselines = planning.data?.baselines ?? [];

  const [zoom, setZoom] = useState<Zoom>("mes");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [cols, setCols] = useState({ eap: true, nome: true, inicio: true, termino: true, dur: true, pct: true, fft: false });
  const [colsOpen, setColsOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: number; mode: "move" | "resize"; startX: number; origStart: number; origDur: number } | null>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const headerSvgRef = useRef<SVGSVGElement>(null);
  const draggedRef = useRef(false);

  const svgToImage = async (svg: SVGSVGElement): Promise<HTMLImageElement> => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[stroke='var(--warn)']").forEach((n) => n.setAttribute("stroke", "#c48a00"));
    const data = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const rasterize = async (): Promise<HTMLCanvasElement | null> => {
    const svg = svgRef.current;
    const headerSvg = headerSvgRef.current;
    if (!svg) return null;
    const w = svg.clientWidth || chartWFallback();
    const headerH = headerSvg?.clientHeight || 0;
    const bodyH = svg.clientHeight || 400;
    const h = headerH + bodyH;
    try {
      const bodyImg = await svgToImage(svg);
      const headerImg = headerSvg ? await svgToImage(headerSvg) : null;
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (headerImg) ctx.drawImage(headerImg, 0, 0, canvas.width, headerH * 2);
      ctx.drawImage(bodyImg, 0, headerH * 2, canvas.width, canvas.height - headerH * 2);
      return canvas;
    } catch {
      return null;
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

  const calendar = useMemo(() => {
    if (!projectStart) return undefined;
    return defaultCalendar(new Date(projectStart).getFullYear());
  }, [projectStart]);

  const dateAt = (o: number) =>
    projectStart === null || !calendar
      ? `+${o}d`
      : dateAtWorkCalendar(calendar, localIso(new Date(projectStart)), o);

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
        freeFloat: a.freeFloat ?? null,
        mustStartOnLabel: a.mustStartOn ? constraintLabel(a.mustStartOn) : null,
        finishNoLaterThanLabel: a.finishNoLaterThan ? constraintLabel(a.finishNoLaterThan) : null,
      })),
    [visible, projectStart]
  );

  const posById = useMemo(() => {
    const m = new Map<number, { y: number; x0: number; x1: number }>();
    rows.forEach((r) => {
      const y = r.idx * ROW_H;
      const x0 = LABEL_W + r.start * scale;
      const x1 = x0 + Math.max(6, r.duration * scale);
      m.set(r.id, { y, x0, x1 });
    });
    return m;
  }, [rows, scale]);

  const ticks = useMemo(() => {
    const count = zoom === "dia" ? 10 : zoom === "semana" ? 7 : 6;
    const step = Math.max(1, Math.round(maxDay / count));
    const out: number[] = [];
    for (let d = 0; d <= maxDay + step; d += step) out.push(d);
    return out;
  }, [maxDay, zoom]);

  const monthGroups = useMemo(() => {
    if (!calendar) return new Map<string, number>();
    const groups = new Map<string, number>();
    const start = localIso(new Date(projectStart!));
    for (const d of ticks) {
      const ds = dateAtWorkCalendar(calendar, start, d);
      if (ds.startsWith("+")) continue;
      const [, mm, yyyy] = ds.split("/");
      const label = `${MONTH_NAMES[parseInt(mm) - 1]} ${yyyy}`;
      if (!groups.has(label)) groups.set(label, d);
    }
    return groups;
  }, [maxDay, zoom, calendar, projectStart]);

  const svgH = rows.length * ROW_H + 40;

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
        <path d={d} fill="none" stroke="#8b98a8" strokeWidth={1} markerEnd="url(#arrowhead)" />
        <text x={(midX + xEnd) / 2} y={(y0 + y1) / 2 - 2} fontSize={8} fill="#8b98a8">{t}{lag !== 0 ? (lag > 0 ? `+${lag}` : `${lag}`) : ""}</text>
      </g>
    );
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)", padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--primary)" }}>Gantt da obra</h2>
      <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 10 }}>
        Atividades: {total} · visíveis: {rows.length} · Críticas: {criticalCount} · Dependências: {dependencies.length} ·
        início da obra {projectStart === null ? "não informado" : new Date(projectStart).toLocaleDateString("pt-BR")} · calendário de dias úteis {calendar ? "(com feriados)" : ""}
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
              {k === "eap" ? "EAP" : k === "nome" ? "Nome" : k === "inicio" ? "Início" : k === "termino" ? "Término" : k === "dur" ? "Duração" : k === "fft" ? "FFL" : "%"}
            </label>
          ))}
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: "var(--ok)", marginBottom: 6 }}>{msg}</div>}
      {planning.isPending && !activities.length && (
        <div style={{ padding: 12, color: "var(--text2)" }}>Carregando atividades...</div>
      )}
      {planning.error && !activities.length && (
        <div style={{ padding: 12, color: "var(--crit)" }}>
          Não foi possível carregar as atividades.{" "}
          <button onClick={() => planning.refetch()} style={{ textDecoration: "underline", cursor: "pointer", background: "none", border: "none", color: "var(--crit)" }}>
            Tentar novamente
          </button>
        </div>
      )}
      {planning.error && activities.length > 0 && (
        <div style={{ padding: 6, fontSize: 11, color: "var(--warn)" }}>
          Falha ao atualizar; exibindo os últimos dados carregados.
        </div>
      )}

      <div style={{ overflow: "auto", maxHeight: fill ? "calc(100vh - 300px)" : 460, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surf)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: 0, position: "sticky", top: 0, zIndex: 3 }}>
          <div style={{ flex: `0 0 ${LABEL_W}px`, height: HEADER_H, background: "var(--thead-bg)" }} />
          <svg ref={headerSvgRef} width={chartW + 20} height={HEADER_H} style={{ flex: "0 0 auto" }} aria-hidden="true">
            <rect x={0} y={0} width={chartW} height={HEADER_H - 16} fill="var(--primary)" rx="4" />
            {Array.from(monthGroups).map(([label, idx]) => (
              <text key={`m-${label}`} x={idx * scale + 4} y={13} fill="#ffffff" fontSize={10} fontWeight={700}>
                {label}
              </text>
            ))}
            {ticks.map((d) => (
              <g key={`htick-${d}`}>
                <line x1={d * scale} y1={HEADER_H - 16} x2={d * scale} y2={HEADER_H} stroke="#8b98a8" strokeWidth={0.5} opacity={0.28} />
                <text x={d * scale + 3} y={20} fill="#ffffff" fontSize={9} fontWeight={600}>
                  {dateAt(d)}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div
          style={{ display: "flex", alignItems: "flex-start", minWidth: 0 }}
          onMouseMove={(e) => {
            if (!drag) return;
            draggedRef.current = true;
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
              <tr style={{ background: "var(--thead-bg)", color: "var(--thead-text)", position: "sticky", top: HEADER_H, zIndex: 3 }}>
                {cols.eap && <th style={{ textAlign: "left", padding: 5 }}>EAP</th>}
                {cols.nome && <th style={{ textAlign: "left", padding: 5 }}>Nome</th>}
                {cols.inicio && <th style={{ textAlign: "left", padding: 5 }}>Início</th>}
                {cols.termino && <th style={{ textAlign: "left", padding: 5 }}>Término</th>}
                {cols.dur && <th style={{ textAlign: "left", padding: 5 }}>Dur.</th>}
                {cols.fft && <th style={{ textAlign: "left", padding: 5 }}>FFL</th>}
                {cols.pct && <th style={{ textAlign: "left", padding: 5 }}>%</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ height: ROW_H, borderBottom: "1px solid var(--line)", background: r.critical ? "var(--row-critical-bg)" : undefined, cursor: linkMode ? "crosshair" : "pointer" }} onClick={() => { if (!linkMode) onSelectActivity?.(r.id); }} title="Clique para editar">
                  {cols.eap && <td style={{ padding: "0 5px", color: r.critical ? "var(--crit)" : "inherit", fontWeight: r.critical ? 600 : 400 }}>{r.wbsCode}</td>}
                  {cols.nome && <td style={{ padding: "0 5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }} title={r.name}>{r.name}</td>}
                  {cols.inicio && <td style={{ padding: "0 5px" }}>{r.inicio}</td>}
                  {cols.termino && <td style={{ padding: "0 5px" }}>{r.termino}</td>}
                  {cols.dur && <td style={{ padding: "0 5px" }}>{r.duration}d</td>}
                  {cols.fft && <td style={{ padding: "0 5px", color: (r.freeFloat ?? 0) > 0 ? "var(--text2)" : "var(--warn)" }}>{r.freeFloat ?? 0}d</td>}
                  {cols.pct && <td style={{ padding: "0 5px", fontWeight: 600, color: r.progress > 0 ? "var(--ok)" : "var(--text2)" }}>{r.progress}%</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <svg ref={svgRef} width={chartW + 20} height={svgH} style={{ flex: "0 0 auto", cursor: drag ? "grabbing" : "default" }} aria-label="Gantt editável com dependências">
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#8b98a8" />
              </marker>
            </defs>

            {ticks.map(d => (
              <line key={`tick-${d}`} x1={LABEL_W + d * scale} y1={0} x2={LABEL_W + d * scale} y2={svgH - 20} stroke="#8b98a8" strokeWidth={0.5} opacity={0.28} />
            ))}

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
                    style={{ cursor: linkMode ? "crosshair" : drag?.id === r.id ? "grabbing" : "move" }}
                    onMouseDown={(e) => {
                      if (linkMode) return;
                      e.preventDefault();
                      draggedRef.current = false;
                      setDrag({ id: r.id, mode: "move", startX: e.clientX, origStart: r.start, origDur: r.duration });
                    }}
                    onClick={() => {
                      if (linkMode) {
                        if (linkFrom === null) { setLinkFrom(r.id); return; }
                        if (linkFrom === r.id) { setLinkFrom(null); return; }
                        createDependency.mutate({ projectId, predecessorId: linkFrom, successorId: r.id, type: "FS", lag: 0 });
                        setLinkFrom(null);
                        setLinkMode(false);
                        return;
                      }
                      if (draggedRef.current) return;
                      onSelectActivity?.(r.id);
                    }}
                  >
                    <title>{`${r.wbsCode}: ${r.name} | ${r.inicio} a ${r.termino} | Dur: ${r.duration}d | FFL: ${r.freeFloat ?? 0}d | Progresso: ${r.progress}%${r.mustStartOnLabel ? ` | MSO: ${r.mustStartOnLabel}` : ""}${r.finishNoLaterThanLabel ? ` | FNLT: ${r.finishNoLaterThanLabel}` : ""} | arraste p/ mover`}</title>
                  </rect>
                  <rect x={p.x0} y={p.y + 6} width={Math.max(3, w * (r.progress / 100))} height={14} rx={3} fill="#1e8a4f" opacity={0.6} style={{ pointerEvents: "none" }} />
                  {r.mustStartOnLabel && (
                    <g style={{ pointerEvents: "none" }}>
                      <line x1={p.x0} y1={p.y + 2} x2={p.x0} y2={p.y + 24} stroke="#5b21b6" strokeWidth={2} strokeDasharray="3 2" />
                      <text x={p.x0 + 3} y={p.y + 11} fontSize={7} fill="#5b21b6" fontWeight={700}>MSO</text>
                    </g>
                  )}
                  {r.finishNoLaterThanLabel && (
                    <g style={{ pointerEvents: "none" }}>
                      <line x1={p.x1} y1={p.y + 2} x2={p.x1} y2={p.y + 24} stroke="#b45309" strokeWidth={2} strokeDasharray="3 2" />
                      <text x={p.x1 - 26} y={p.y + 11} fontSize={7} fill="#b45309" fontWeight={700}>FNLT</text>
                    </g>
                  )}
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
                      draggedRef.current = false;
                      setDrag({ id: r.id, mode: "resize", startX: e.clientX, origStart: r.start, origDur: r.duration });
                    }}
                  >
                    <title>Arraste para mudar a duração</title>
                  </rect>
                </g>
              );
            })}

            {dependencies.map(arrow)}

            {baselines.length > 0 && <text x={LABEL_W} y={svgH - 16} fontSize={9} fill="#8b98a8">BASELINE REAL ({baselines.length} baselines do banco)</text>}
          </svg>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 10 }}>
        <b>M5:</b> arraste a barra para mover; arraste a alça direita para mudar a duração; use "Ligar" e clique em 2 barras para criar FS. Cada ação grava via API e recalcula o CPM.
        <b> M6:</b> exporte PNG ou PDF. <b>M3/M4:</b> setas FS/SS com lag, zoom, colunas, filtro. <b>Onda 0.4:</b> MSO (roxo tracejado) = <i>must start on</i>; FNLT (ambar tracejado) = <i>finish no later than</i>; FFL = folga livre em dias uteis.
      </div>
    </div>
  );
}
