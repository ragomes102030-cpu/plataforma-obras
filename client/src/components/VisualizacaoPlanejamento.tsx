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

export function VisualizacaoPlanejamento({ linhas, inicioObra, hoje }: Props) {
  const [view, setView] = useState<View>("gantt");

  const dados = useMemo(() => {
    if (!linhas.length) return null;
    const min = linhas.reduce((v, l) => Math.min(v, dateMs(l.inicio)), dateMs(linhas[0]!.inicio));
    const max = linhas.reduce((v, l) => Math.max(v, dateMs(l.inicio) + Math.max(1, l.duracao - 1) * 86400000), min);
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
        <h3>Visualização de planejamento</h3>
        <p>Crie atividades no cronograma para visualizar o Gantt e a linha de balanço.</p>
      </div>
    );
  }

  return (
    <section className="pl-visual">
      <header className="pl-visual-header">
        <div>
          <strong>PLANEJAMENTO VISUAL</strong>
          <span>Gantt + Linha de Balanço · leitura de engenharia</span>
        </div>
        <div className="pl-visual-tabs">
          <button className={view === "gantt" ? "ativo" : ""} onClick={() => setView("gantt")}>
            <GanttChartSquare size={14} /> Gantt
          </button>
          <button className={view === "lob" ? "ativo" : ""} onClick={() => setView("lob")}>
            <GitBranch size={14} /> Linha de balanço
          </button>
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
  const width = Math.max(980, dados.total * 18);
  const rowH = 30;
  const left = 360;
  const top = 46;
  const height = top + linhas.length * rowH + 24;
  const x = (iso: string) => left + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * (width - left) / dados.total;
  const hojeX = x(hoje);
  const tickStep = dados.total > 150 ? 30 : 15;
  const ticks: string[] = [];
  for (let d = 0; d <= dados.total; d += tickStep) ticks.push(addDays(dados.start, d));

  return (
    <div className="pl-gantt-scroll">
      <svg className="pl-gantt" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de Gantt da obra">
        <rect x="0" y="0" width={width} height={height} className="pl-gantt-bg" />
        <rect x="0" y="0" width={left} height={height} className="pl-gantt-left" />
        <text x="14" y="21" className="pl-gantt-title">ATIVIDADE</text>
        <text x={left + 10} y="21" className="pl-gantt-title">LINHA DO TEMPO</text>
        {ticks.map(t => {
          const xx = x(t);
          return (
            <g key={t}>
              <line x1={xx} x2={xx} y1="32" y2={height - 12} className="pl-gantt-grid" />
              <text x={xx + 3} y="44" className="pl-gantt-date">{fmt(t)}</text>
            </g>
          );
        })}
        {inicioObra && <text x={left + 10} y={height - 5} className="pl-gantt-note">Início da obra: {fmt(inicioObra)}</text>}
        <line x1={hojeX} x2={hojeX} y1="28" y2={height - 12} className="pl-gantt-hoje" />
        <text x={hojeX + 4} y="21" className="pl-gantt-hoje-label">HOJE</text>

        {linhas.map((l, i) => {
          const y = top + i * rowH;
          const start = x(l.inicio);
          const end = x(addDays(l.inicio, Math.max(1, l.duracao) - 1));
          const w = Math.max(8, end - start);
          const critical = /fundação|estrutura|contenção/i.test(l.atividade);
          const progressW = w * Math.max(0, Math.min(100, l.executado && l.quantidade ? (l.executado / l.quantidade) * 100 : 0)) / 100;
          return (
            <g key={`${l.codigo}-${i}`}>
              <rect x="0" y={y - 1} width={width} height={rowH} className={i % 2 ? "pl-gantt-row alt" : "pl-gantt-row"} />
              <text x="14" y={y + 18} className="pl-gantt-code">{l.codigo}</text>
              <text x="70" y={y + 18} className="pl-gantt-name">{l.atividade.slice(0, 39)}</text>
              <text x={left - 8} y={y + 18} textAnchor="end" className="pl-gantt-front">{l.pavimento || l.frente}</text>
              <rect x={start} y={y + 7} width={w} height="16" rx="3" className={critical ? "pl-gantt-bar critical" : "pl-gantt-bar"} />
              {progressW > 0 && <rect x={start} y={y + 7} width={progressW} height="16" rx="3" className="pl-gantt-progress" />}
              {l.duracao > 0 && <text x={start + w + 5} y={y + 19} className="pl-gantt-duration">{l.duracao}d</text>}
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
  const width = Math.max(980, dados.total * 18);
  const height = 440;
  const left = 90;
  const top = 45;
  const bottom = 45;
  const plotH = height - top - bottom;
  const floors = Array.from(new Set(linhas.map(l => l.pavimento).filter(Boolean))) as string[];
  const floorNames = floors.length ? floors : Array.from(new Set(linhas.map(l => l.frente)));
  const yByFloor = new Map(floorNames.map((f, i) => [f, top + plotH - (i * plotH) / Math.max(1, floorNames.length - 1)]));
  const x = (iso: string) => left + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * (width - left - 25) / dados.total;

  const fases = Array.from(new Set(linhas.map(l => l.frente)));
  return (
    <div className="pl-lob-scroll">
      <svg className="pl-lob" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Linha de balanço da obra">
        <rect x="0" y="0" width={width} height={height} className="pl-lob-bg" />
        <text x="14" y="23" className="pl-gantt-title">PAVIMENTO / FRENTE</text>
        {floorNames.map((f, i) => {
          const yy = yByFloor.get(f)!;
          return (
            <g key={f}>
              <line x1={left} x2={width - 15} y1={yy} y2={yy} className="pl-lob-grid" />
              <text x={left - 10} y={yy + 4} textAnchor="end" className="pl-lob-floor">{f}</text>
            </g>
          );
        })}
        <line x1={left} x2={left} y1={top} y2={height - bottom} className="pl-lob-axis" />
        <line x1={left} x2={width - 15} y1={height - bottom} y2={height - bottom} className="pl-lob-axis" />

        {fases.map((fase, faseIndex) => {
          const pontos = linhas
            .filter(l => l.frente === fase && l.pavimento)
            .map(l => {
              const yy = yByFloor.get(l.pavimento!)!;
              return { x: x(l.inicio), y: yy, fim: x(addDays(l.inicio, Math.max(1, l.duracao) - 1)) };
            })
            .sort((a, b) => a.y - b.y);
          if (pontos.length < 2) return null;
          return (
            <g key={fase}>
              <polyline points={pontos.map(p => `${p.x},${p.y}`).join(" ")} className={`pl-lob-line line-${faseIndex % 4}`} />
              {pontos.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" className={`pl-lob-point line-${faseIndex % 4}`} />)}
              <text x={pontos[pontos.length - 1]!.x + 8} y={pontos[pontos.length - 1]!.y + 4} className="pl-lob-label">{fase}</text>
            </g>
          );
        })}
        <text x={width / 2} y={height - 10} textAnchor="middle" className="pl-lob-caption">
          tempo →
        </text>
      </svg>
    </div>
  );
}
