import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { GitBranch, GanttChartSquare } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";

type Props = {
  linhas: EntradaDaLinha[];
  inicioObra: IsoDate | null;
  hoje: IsoDate;
  projetoId: number;
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
  projetoId,
  view = "gantt",
}: Props & { view?: PlanejamentoView }) {
  const planejamento = trpc.planning.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: view === "gantt" && Number(projetoId) > 0 }
  );
  const atividades = planejamento.data?.activities ?? [];
  const atividadePorCodigo = useMemo(
    () => new Map(atividades.map(activity => [activity.wbsCode, activity])),
    [atividades]
  );
  const cpmCalculado = atividades.length > 0 && atividades.some(activity => activity.cpmCalculatedAt);

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
          <span>{view === "gantt" ? "Sequência, duração, avanço e caminho crítico" : "Tempo na vertical · localização/frentes na horizontal"}</span>
        </div>
      </header>
      {view === "gantt" && !cpmCalculado && atividades.length > 0 && (
        <div className="pl-gantt-cpm-aviso">
          O Gantt está usando o início/duração informados. Calcule o CPM para destacar o caminho crítico do plano.
        </div>
      )}
      {view === "gantt" && planejamento.isError && (
        <div className="pl-gantt-cpm-aviso erro">
          Não foi possível carregar o estado do CPM: {planejamento.error.message}
        </div>
      )}
      {view === "gantt" ? (
        <Gantt linhas={linhas} atividades={atividadePorCodigo} dados={dados} hoje={hoje} inicioObra={inicioObra} />
      ) : (
        <LinhaDeBalanco linhas={linhas} dados={dados} />
      )}
    </section>
  );
}

function Gantt({
  linhas,
  atividades,
  dados,
  hoje,
  inicioObra,
}: {
  linhas: EntradaDaLinha[];
  atividades: Map<string, { critical: number; totalFloat: number | null; cpmCalculatedAt: Date | string | null }>;
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
        <text x={width - 12} y="22" textAnchor="end" className="pl-gantt-critical-note">
          {Array.from(atividades.values()).filter(item => item.critical === 1).length} críticas
        </text>
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
          const progresso = l.executado && l.quantidade ? (l.executado / l.quantidade) * 100 : 0;
          const atividade = atividades.get(l.codigo);
          const critica = atividade?.critical === 1;
          const classeBarra = critica ? "pl-gantt-bar critical" : "pl-gantt-bar";
          const progressW =
            w * Math.max(0, Math.min(100, progresso)) / 100;
          return (
            <g key={`${l.codigo}-${i}`}>
              <rect x="0" y={y - 1} width={width} height={rowH} className={i % 2 ? "pl-gantt-row alt" : "pl-gantt-row"} />
              <text x="14" y={y + 20} className="pl-gantt-code">{l.codigo}</text>
              <text x="70" y={y + 20} className="pl-gantt-name">{l.atividade.slice(0, 46)}</text>
              <text x={left - 8} y={y + 20} textAnchor="end" className="pl-gantt-front">{l.pavimento || l.frente}</text>
              <rect x={start} y={y + 8} width={w} height="18" rx="3" className={classeBarra} />
              {progressW > 0 && <rect x={start} y={y + 8} width={progressW} height="18" rx="3" className="pl-gantt-progress" />}
              {l.duracao > 0 && (
                <text x={start + w + 5} y={y + 21} className={critica ? "pl-gantt-duration critical" : "pl-gantt-duration"}>
                  {l.duracao}d{critica ? " · CRÍTICA" : ""}
                </text>
              )}
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
  // Modelo Prevision: tempo no eixo X, localizações no eixo Y.
  // Cada serviço repetitivo vira uma faixa colorida por localização e uma
  // linha de ritmo que conecta o início do serviço entre os pavimentos.
  const locations = Array.from(
    new Set(linhas.map(l => l.pavimento || l.frente).filter(Boolean))
  );
  const locationOrder = [...locations].sort((a, b) => {
    const na = Number(String(a).match(/-?\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
    const nb = Number(String(b).match(/-?\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  });

  const servicos = Array.from(
    new Map(
      linhas.map(l => {
        const key = l.atividade.trim().toLocaleLowerCase("pt-BR");
        return [key, l.atividade.trim()];
      })
    ).entries()
  ).map(([key, label]) => ({ key, label }));

  const left = 170;
  const right = 50;
  const top = 82;
  const bottom = 42;
  const rowH = 42;
  const pxPerDay = dados.total > 360 ? 4 : dados.total > 180 ? 5 : 7;
  const width = Math.max(1200, left + right + dados.total * pxPerDay);
  const height = Math.max(420, top + Math.max(1, locationOrder.length) * rowH + bottom);
  const x = (iso: string) =>
    left + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * pxPerDay;
  const yByLocation = new Map(locationOrder.map((location, i) => [location, top + i * rowH + rowH / 2]));

  const monthTicks: string[] = [];
  let cursor = new Date(`${dados.start}T12:00:00Z`);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= dateMs(dados.end)) {
    monthTicks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const weekTicks: string[] = [];
  for (let d = 0; d <= dados.total; d += 7) weekTicks.push(addDays(dados.start, d));

  const fmtMes = (iso: string) => {
    const [y, m] = iso.split("-");
    return `${m}/${y.slice(2)}`;
  };

  return (
    <div className="pl-lob-scroll pl-planejamento-scroll">
      <svg
        className="pl-lob pl-lob-prevision"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Linha de balanço com tempo horizontal e localizações verticais"
      >
        <rect x="0" y="0" width={width} height={height} className="pl-lob-bg" />

        <text x="14" y="22" className="pl-gantt-title">LINHA DE BALANÇO</text>
        <text x="14" y="43" className="pl-lob-subtitle">
          FLUXO POR LOCALIZAÇÃO · RITMO DAS EQUIPES
        </text>

        <rect x={left} y="28" width={width - left - right} height="28" className="pl-lob-header" />
        {monthTicks.map(month => {
          const xx = x(month);
          return (
            <g key={month}>
              <line x1={xx} x2={xx} y1="28" y2={height - bottom} className="pl-lob-month-grid" />
              <text x={xx + 6} y="45" className="pl-lob-month">{fmtMes(month)}</text>
            </g>
          );
        })}

        {weekTicks.filter(d => dateMs(d) <= dateMs(dados.end)).map(d => {
          const xx = x(d);
          return (
            <g key={d}>
              <line x1={xx} x2={xx} y1={56} y2={height - bottom} className="pl-lob-week-grid" />
              <text x={xx + 2} y="68" className="pl-lob-date">{fmt(d)}</text>
            </g>
          );
        })}

        <text x={left - 12} y="45" textAnchor="end" className="pl-lob-axis-title">
          LOCALIZAÇÃO
        </text>

        {locationOrder.map((location, i) => {
          const yy = yByLocation.get(location)!;
          return (
            <g key={location}>
              <rect
                x="0"
                y={yy - rowH / 2}
                width={width}
                height={rowH}
                className={i % 2 ? "pl-lob-row alt" : "pl-lob-row"}
              />
              <line x1={left} x2={width - right} y1={yy + rowH / 2} y2={yy + rowH / 2} className="pl-lob-row-grid" />
              <text x={left - 12} y={yy + 4} textAnchor="end" className="pl-lob-location">
                {location}
              </text>
            </g>
          );
        })}

        {servicos.map((servico, serviceIndex) => {
          const pontos = linhas
            .filter(l => l.atividade.trim().toLocaleLowerCase("pt-BR") === servico.key)
            .filter(l => Boolean(l.pavimento || l.frente))
            .map(l => {
              const location = l.pavimento || l.frente;
              const yy = yByLocation.get(location);
              if (yy == null) return null;
              const startX = x(l.inicio);
              const endX = x(addDays(l.inicio, Math.max(1, l.duracao) - 1));
              return {
                location,
                x: startX,
                y: yy,
                width: Math.max(8, endX - startX),
                duracao: l.duracao,
                codigo: l.codigo,
              };
            })
            .filter(Boolean) as Array<{ location: string; x: number; y: number; width: number; duracao: number; codigo: string }>;

          if (!pontos.length) return null;

          const colorClass = `lob-service-${serviceIndex % 8}`;
          const linha = [...pontos].sort((a, b) => a.y - b.y);
          const polyline = linha.length > 1
            ? linha.map(p => `${p.x},${p.y}`).join(" ")
            : "";

          return (
            <g key={servico.key}>
              {polyline && (
                <polyline points={polyline} className={`pl-lob-rhythm ${colorClass}`} />
              )}
              {pontos.map(p => (
                <g key={`${servico.key}-${p.location}-${p.codigo}`}>
                  <title>{`${servico.label} · ${p.location} · ${p.duracao} dias · início ${fmt(pontos.length ? linhas.find(l => l.codigo === p.codigo)?.inicio || dados.start : dados.start)}`}</title>
                  <rect
                    x={p.x}
                    y={p.y - 10}
                    width={p.width}
                    height="20"
                    rx="2"
                    className={`pl-lob-service ${colorClass}`}
                  />
                  {p.width > 55 && (
                    <text x={p.x + 5} y={p.y + 4} className="pl-lob-service-label">
                      {servico.label.slice(0, 24)}
                    </text>
                  )}
                </g>
              ))}
              {linha.length > 1 && (
                <text
                  x={linha[linha.length - 1]!.x + linha[linha.length - 1]!.width + 8}
                  y={linha[linha.length - 1]!.y + 4}
                  className={`pl-lob-rhythm-label ${colorClass}`}
                >
                  {servico.label}
                </text>
              )}
            </g>
          );
        })}

        <line x1={left} x2={width - right} y1={56} y2={56} className="pl-lob-axis" />
        <line x1={left} x2={left} y1={56} y2={height - bottom} className="pl-lob-axis" />
        <text x={width / 2} y={height - 12} textAnchor="middle" className="pl-lob-caption">
          TEMPO →
        </text>
      </svg>
    </div>
  );
}
