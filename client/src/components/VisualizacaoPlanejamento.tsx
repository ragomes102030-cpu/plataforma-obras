import { useMemo, useState } from "react";
import { GitBranch, GanttChartSquare } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";

type Props = {
  linhas: EntradaDaLinha[];
  inicioObra: IsoDate | null;
  hoje: IsoDate;
};

type View = "gantt" | "lob";

function dateMs(s: string): number {
  return new Date(`${s}T12:00:00Z`).getTime();
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}${y !== undefined ? "" : ""}`;
}

export type PlanejamentoView = "gantt" | "lob";

export function VisualizacaoPlanejamento({
  linhas,
  inicioObra,
  hoje,
  view = "gantt",
}: Props & { view?: PlanejamentoView }) {
  const dados = useMemo(() => {
    if (!linhas.length) return null;
    const min = linhas.reduce((v, l) => Math.min(v, dateMs(l.inicio)), dateMs(linhas[0]!.inicio));
    const max = linhas.reduce(
      (v, l) => Math.max(v, dateMs(l.inicio) + Math.max(1, l.duracao - 1) * 86400000),
      min
    );
    const inicio = new Date(min);
    inicio.setUTCDate(1);
    const fim = new Date(max);
    fim.setUTCDate(1);
    fim.setUTCMonth(fim.getUTCMonth() + 1);
    const start = inicio.toISOString().slice(0, 10);
    const end = fim.toISOString().slice(0, 10);
    const total = Math.max(1, Math.round((dateMs(end) - dateMs(start)) / 86400000));
    return { start, end, total };
  }, [linhas]);

  if (!dados) {
    return (
      <div className="pl-visual-vazio">
        <h3>{view === "gantt" ? "Gantt" : "Linha de Balanço"}</h3>
        <p>Crie atividades no planejamento para visualizar esta ferramenta.</p>
      </div>
    );
  }

  return (
    <section className="pl-visual pl-visual-full">
      <header className="pl-visual-header">
        <div>
          <strong>{view === "gantt" ? "GANTT — PLANEJAMENTO DA OBRA" : "LINHA DE BALANÇO — FLUXO DA PRODUÇÃO"}</strong>
          <span>{view === "gantt" ? "Sequência, duração e avanço das atividades" : "Tempo na vertical · localização/frentes na horizontal"}</span>
        </div>
      </header>
      {view === "gantt" ? (
        <Gantt linhas={linhas} dados={dados} hoje={hoje} inicioObra={inicioObra} />
      ) : (
        <LinhaDeBalanco linhas={linhas} dados={dados} />
      )}
    </section>
  );
}

function Gantt({
  linhas,
  dados,
  hoje,
  inicioObra,
}: {
  linhas: EntradaDaLinha[];
  dados: { start: string; end: string; total: number };
  hoje: IsoDate;
  inicioObra: IsoDate | null;
}) {
  const width = Math.max(1400, dados.total * 22);
  const rowH = 34;
  const left = 430;
  const top = 58;
  const height = top + linhas.length * rowH + 30;
  const x = (iso: string) =>
    left + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * (width - left) / dados.total;
  const hojeX = x(hoje);
  const tickStep = dados.total > 180 ? 30 : dados.total > 90 ? 14 : 7;
  const ticks: string[] = [];
  for (let d = 0; d <= dados.total; d += tickStep) ticks.push(addDays(dados.start, d));

  return (
    <div className="pl-gantt-scroll pl-planejamento-scroll">
      <svg className="pl-gantt pl-gantt-large" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de Gantt da obra">
        <rect x="0" y="0" width={width} height={height} className="pl-gantt-bg" />
        <rect x="0" y="0" width={left} height={height} className="pl-gantt-left" />
        <text x="14" y="22" className="pl-gantt-title">ATIVIDADE / LOCALIZAÇÃO</text>
        <text x={left + 10} y="22" className="pl-gantt-title">LINHA DO TEMPO</text>
        {ticks.map(t => {
          const xx = x(t);
          return (
            <g key={t}>
              <line x1={xx} x2={xx} y1="34" y2={height - 14} className="pl-gantt-grid" />
              <text x={xx + 3} y="48" className="pl-gantt-date">{fmt(t)}</text>
            </g>
          );
        })}
        {inicioObra && <text x={left + 10} y={height - 6} className="pl-gantt-note">Início da obra: {fmt(inicioObra)}</text>}
        <line x1={hojeX} x2={hojeX} y1="30" y2={height - 14} className="pl-gantt-hoje" />
        <text x={hojeX + 4} y="22" className="pl-gantt-hoje-label">HOJE</text>

        {linhas.map((l, i) => {
          const y = top + i * rowH;
          const start = x(l.inicio);
          const end = x(addDays(l.inicio, Math.max(1, l.duracao) - 1));
          const w = Math.max(8, end - start);
          const progressW =
            w * Math.max(0, Math.min(100, l.executado && l.quantidade ? (l.executado / l.quantidade) * 100 : 0)) / 100;
          return (
            <g key={`${l.codigo}-${i}`}>
              <rect x="0" y={y - 1} width={width} height={rowH} className={i % 2 ? "pl-gantt-row alt" : "pl-gantt-row"} />
              <text x="14" y={y + 20} className="pl-gantt-code">{l.codigo}</text>
              <text x="70" y={y + 20} className="pl-gantt-name">{l.atividade.slice(0, 46)}</text>
              <text x={left - 8} y={y + 20} textAnchor="end" className="pl-gantt-front">{l.pavimento || l.frente}</text>
              <rect x={start} y={y + 8} width={w} height="18" rx="3" className="pl-gantt-bar" />
              {progressW > 0 && <rect x={start} y={y + 8} width={progressW} height="18" rx="3" className="pl-gantt-progress" />}
              {l.duracao > 0 && <text x={start + w + 5} y={y + 21} className="pl-gantt-duration">{l.duracao}d</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LinhaDeBalanco({
  linhas,
  dados,
}: {
  linhas: EntradaDaLinha[];
  dados: { start: string; end: string; total: number };
}) {
  const width = Math.max(1050, Math.max(1, new Set(linhas.map(l => l.pavimento || l.frente)).size) * 110 + 150);
  const rowH = 28;
  const top = 56;
  const left = 125;
  const right = 35;
  const bottom = 25;
  const height = Math.max(620, top + dados.total * rowH + bottom);
  const floorNames = Array.from(new Set(linhas.map(l => l.pavimento).filter(Boolean))) as string[];
  const locations = floorNames.length ? floorNames : Array.from(new Set(linhas.map(l => l.frente)));
  const xByLocation = new Map(locations.map((f, i) => [f, left + i * ((width - left - right) / Math.max(1, locations.length - 1))]));
  const y = (iso: string) => top + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * rowH;
  const fases = Array.from(new Set(linhas.map(l => l.frente)));

  return (
    <div className="pl-lob-scroll pl-planejamento-scroll">
      <svg className="pl-lob pl-lob-vertical" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Linha de balanço da obra com datas na vertical">
        <rect x="0" y="0" width={width} height={height} className="pl-lob-bg" />
        <text x="14" y="22" className="pl-gantt-title">DATA</text>
        <text x={left} y="22" className="pl-gantt-title">LOCALIZAÇÃO / FRENTE</text>

        {Array.from({ length: Math.ceil(dados.total / 7) + 1 }, (_, i) => addDays(dados.start, i * 7))
          .filter(d => dateMs(d) <= dateMs(dados.end))
          .map(d => {
            const yy = y(d);
            return (
              <g key={d}>
                <line x1={left} x2={width - right} y1={yy} y2={yy} className="pl-lob-grid" />
                <text x={left - 10} y={yy + 4} textAnchor="end" className="pl-lob-floor">{fmt(d)}</text>
              </g>
            );
          })}

        {locations.map(location => {
          const xx = xByLocation.get(location)!;
          return (
            <g key={location}>
              <line x1={xx} x2={xx} y1={top} y2={height - bottom} className="pl-lob-grid" />
              <text x={xx} y="42" textAnchor="middle" className="pl-lob-floor">{location}</text>
            </g>
          );
        })}

        <line x1={left} x2={width - right} y1={top} y2={top} className="pl-lob-axis" />
        <line x1={left} x2={left} y1={top} y2={height - bottom} className="pl-lob-axis" />

        {fases.map((fase, faseIndex) => {
          const pontos = linhas
            .filter(l => l.frente === fase && l.pavimento)
            .map(l => {
              const xx = xByLocation.get(l.pavimento!)!;
              return { x: xx, y: y(l.inicio), yFim: y(addDays(l.inicio, Math.max(1, l.duracao) - 1)) };
            })
            .sort((a, b) => a.x - b.x);
          if (pontos.length < 2) return null;
          return (
            <g key={fase}>
              <polyline points={pontos.map(p => `${p.x},${p.y}`).join(" ")} className={`pl-lob-line line-${faseIndex % 4}`} />
              {pontos.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" className={`pl-lob-point line-${faseIndex % 4}`} />
              ))}
              <text x={pontos[pontos.length - 1]!.x + 8} y={pontos[pontos.length - 1]!.y + 4} className="pl-lob-label">{fase}</text>
            </g>
          );
        })}
        <text x={width / 2} y={height - 8} textAnchor="middle" className="pl-lob-caption">
          DATAS NA VERTICAL · LOCALIZAÇÕES / FRENTES NA HORIZONTAL
        </text>
      </svg>
    </div>
  );
}
