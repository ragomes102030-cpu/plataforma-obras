import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { buildSCurve, type SCurveResult } from "@shared/s-curve";

/**
 * Aba CURVA S — valor planejado acumulado × valor realizado acumulado.
 *
 * Mostra se a obra está adiantada, no prazo ou atrasada, e quanto do valor
 * total deveria estar pronto hoje vs quanto está.
 *
 * Usa o motor puro de `shared/s-curve.ts` com dados reais do banco:
 * - Atividades com CPM calculado (earlyStart, durationDays)
 * - Progresso físico real (0-100%)
 * - Peso = custo planejado (quantity × unitPrice)
 */

type Props = {
  projetoId: number;
  hoje: string | null;
};

export function AbaCurvaS({ projetoId, hoje }: Props) {
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  const planejamento = trpc.planning.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  const budget = trpc.budgets.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  const curve: SCurveResult | null = useMemo(() => {
    const activities = planejamento.data?.activities ?? [];
    if (activities.length === 0) return null;

    // Busca orçamento para peso
    const budgetItems = budget.data?.items ?? [];
    const costByWbs = new Map<string, number>();
    for (const item of budgetItems) {
      if (item.wbsNodeId) {
        const wbsNode = (planejamento.data as any)?.wbsNodes?.find((n: any) => n.id === item.wbsNodeId);
        if (wbsNode?.code) {
          costByWbs.set(wbsNode.code, (costByWbs.get(wbsNode.code) ?? 0) + Number(item.quantity) * Number(item.unitPrice));
        }
      }
    }

    const totalCost = Array.from(costByWbs.values()).reduce((s, v) => s + v, 0);

    const curveActivities = activities
      .filter(a => a.cpmCalculatedAt && a.durationDays > 0)
      .map(a => {
        const weight = totalCost > 0 ? ((costByWbs.get(a.wbsCode) ?? 0) / totalCost) * 100 : 0;
        return {
          id: a.id.toString(),
          duration: a.durationDays,
          plannedPercent: weight,
          actualPercent: a.progress ?? 0,
          earlyStart: a.earlyStart ?? 0,
        };
      })
      .filter(a => a.plannedPercent > 0);

    if (curveActivities.length === 0) return null;
    return buildSCurve(curveActivities);
  }, [planejamento.data, budget.data]);

  if (!curve) {
    return (
      <div className="xl-painel">
        <div className="xl-painel-intro">
          <div>
            <span className="xl-painel-kicker">CURVA S</span>
            <h2>Sem dados para curva S</h2>
            <p>A curva S precisa de atividades com CPM calculado e orçamento definido.</p>
          </div>
        </div>
      </div>
    );
  }

  const hojeNum = hoje ? Math.floor((new Date(hoje).getTime() - new Date(planejamento.data?.activities?.[0]?.earlyStart ?? 0).getTime()) / 86400000) : 0;
  const pontoHoje = curve.points.find(p => p.day === hojeNum) ?? curve.points[0];
  const desvio = curve.deviation;

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">CURVA S — CONTROLE DE PRAZO</span>
          <h2>
            {curve.status === "adiantado" && "Obra adiantada"}
            {curve.status === "no_prazo" && "Obra no prazo"}
            {curve.status === "atrasado" && "Obra atrasada"}
            {curve.status === "indeterminado" && "Indeterminado"}
          </h2>
          <p>
            Planejado acumulado: {pontoHoje.planned.toFixed(1)}% — Realizado acumulado: {pontoHoje.actual.toFixed(1)}% — Desvio: {desvio.toFixed(1)}%
          </p>
        </div>
        <button
          type="button"
          className="xl-btn"
          onClick={() => setMostrarDetalhes(!mostrarDetalhes)}
        >
          {mostrarDetalhes ? "Ocultar detalhes" : "Ver detalhes"}
        </button>
      </div>

      {/* Gráfico SVG simples */}
      <div className="xl-curva-container">
        <svg viewBox="0 0 600 300" className="xl-curva-svg" style={{ width: "100%", maxHeight: "300px" }}>
          {/* Eixos */}
          <line x1="50" y1="20" x2="50" y2="260" stroke="#334155" strokeWidth="1" />
          <line x1="50" y1="260" x2="580" y2="260" stroke="#334155" strokeWidth="1" />

          {/* Grid horizontal */}
          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line x1="50" y1={260 - v * 2.4} x2="580" y2={260 - v * 2.4} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="2,2" />
              <text x="45" y={263 - v * 2.4} textAnchor="end" fontSize="10" fill="#94a3b8">{v}%</text>
            </g>
          ))}

          {/* Grid vertical (a cada 50 dias) */}
          {Array.from({ length: Math.floor(curve.duration / 50) + 1 }, (_, i) => i * 50).map(day => (
            <text key={day} x={50 + (day / curve.duration) * 530} y="275" textAnchor="middle" fontSize="10" fill="#94a3b8">{day}d</text>
          ))}

          {/* Linha do hoje */}
          {hojeNum > 0 && hojeNum <= curve.duration && (
            <line
              x1={50 + (hojeNum / curve.duration) * 530}
              y1="20"
              x2={50 + (hojeNum / curve.duration) * 530}
              y2="260"
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
          )}

          {/* Curva planejada */}
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={curve.points.map(p => `${50 + (p.day / curve.duration) * 530},${260 - p.planned * 2.4}`).join(" ")}
          />

          {/* Curva real */}
          <polyline
            fill="none"
            stroke={desvio < 0 ? "#ef4444" : "#22c55e"}
            strokeWidth="2"
            points={curve.points.map(p => `${50 + (p.day / curve.duration) * 530},${260 - p.actual * 2.4}`).join(" ")}
          />

          {/* Legenda */}
          <rect x="380" y="10" width="12" height="3" fill="#3b82f6" />
          <text x="396" y="15" fontSize="10" fill="#94a3b8">Planejado</text>
          <rect x="380" y="25" width="12" height="3" fill={desvio < 0 ? "#ef4444" : "#22c55e"} />
          <text x="396" y="30" fontSize="10" fill="#94a3b8">Realizado</text>
          {hojeNum > 0 && hojeNum <= curve.duration && (
            <>
              <rect x="380" y="40" width="12" height="3" fill="#f59e0b" />
              <text x="396" y="45" fontSize="10" fill="#94a3b8">Hoje</text>
            </>
          )}
        </svg>
      </div>

      {/* Cards de resumo */}
      <div className="xl-cartoes">
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Duração total</span>
          <strong className="xl-cartao-valor">{curve.duration} dias</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Planejado acumulado</span>
          <strong className="xl-cartao-valor">{pontoHoje.planned.toFixed(1)}%</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Realizado acumulado</span>
          <strong className="xl-cartao-valor">{pontoHoje.actual.toFixed(1)}%</strong>
        </div>
        <div className={`xl-cartao ${desvio < 0 ? "xl-cartao-ruim" : "xl-cartao-bom"}`}>
          <span className="xl-cartao-titulo">Desvio</span>
          <strong className="xl-cartao-valor">{desvio.toFixed(1)}%</strong>
          <span className="xl-cartao-nota">{desvio < 0 ? "atrasado" : "adiantado"}</span>
        </div>
      </div>

      {/* Tabela de detalhes */}
      {mostrarDetalhes && (
        <div className="xl-tabela-container">
          <table className="xl-tabela">
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Início</th>
                <th>Duração</th>
                <th>Peso</th>
                <th>Realizado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(planejamento.data?.activities ?? [])
                .filter(a => a.cpmCalculatedAt && a.durationDays > 0)
                .map(a => {
                  const budgetItems = budget.data?.items ?? [];
                  const costByWbs = new Map<string, number>();
                  for (const item of budgetItems) {
                    if (item.wbsNodeId) {
                      const wbsNode = (planejamento.data as any)?.wbsNodes?.find((n: any) => n.id === item.wbsNodeId);
                      if (wbsNode?.code) {
                        costByWbs.set(wbsNode.code, (costByWbs.get(wbsNode.code) ?? 0) + Number(item.quantity) * Number(item.unitPrice));
                      }
                    }
                  }
                  const totalCost = Array.from(costByWbs.values()).reduce((s, v) => s + v, 0);
                  const weight = totalCost > 0 ? ((costByWbs.get(a.wbsCode) ?? 0) / totalCost) * 100 : 0;
                  return (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.earlyStart}d</td>
                      <td>{a.durationDays}d</td>
                      <td>{weight.toFixed(1)}%</td>
                      <td>{a.progress ?? 0}%</td>
                      <td>{(a.progress ?? 0) >= 100 ? "Concluído" : (a.progress ?? 0) > 0 ? "Em andamento" : "Não iniciado"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
