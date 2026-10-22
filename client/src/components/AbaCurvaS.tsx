import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { buildSCurve, type SCurveResult } from "@shared/s-curve";
import { calcularPesosDaCurva } from "@/lib/curva-s-pesos";
import { EstadoCarregando } from "./EstadoCarregando";

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

  // O diagnóstico de pesos serve tanto para desenhar a curva quanto para
  // explicar o vazio ("sobraram R$ X sem atividade nesta versão da EAP").
  const pesos = useMemo(
    () =>
      calcularPesosDaCurva(
        planejamento.data?.activities ?? [],
        budget.data?.items ?? []
      ),
    [planejamento.data, budget.data]
  );

  const curve: SCurveResult | null = useMemo(() => {
    const activities = planejamento.data?.activities ?? [];
    const budgetItems = budget.data?.items ?? [];
    if (activities.length === 0 || budgetItems.length === 0) return null;

    // Mapeia custo por atividade: primeiro pelo nó da EAP, depois pelo código
    // (o orçamento pode estar apontando para os nós de uma versão anterior).
    const totalCost = pesos.total;
    if (totalCost <= 0) return null;
    const costByActivityId = pesos.custoPorAtividade;

    const curveActivities = activities
      .filter(a => a.cpmCalculatedAt && a.durationDays > 0)
      .map(a => {
        const cost = costByActivityId.get(a.id) ?? 0;
        const weight = totalCost > 0 ? (cost / totalCost) * 100 : 0;
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
  }, [planejamento.data, budget.data, pesos]);

  // Carregando ≠ vazio. As duas consultas desta aba são pesadas (atividades +
  // itens de orçamento) e, no plano gratuito, a tela ficava 10-30 s dizendo
  // "sem dados" para uma obra que tem os dois.
  if (Number(projetoId) > 0 && (planejamento.isPending || budget.isPending)) {
    return (
      <div className="xl-painel">
        <EstadoCarregando
          rotulo="Carregando atividades e orçamento…"
          detalhe="A curva S cruza o caminho crítico com o valor de cada item de orçamento."
          linhas={4}
        />
      </div>
    );
  }

  if (!curve) {
    // Dizer o motivo certo importa: antes a tela mandava "calcular CPM E
    // definir orçamento" mesmo quando só um dos dois faltava, e o engenheiro
    // ia procurar defeito no lugar errado.
    const atividades = planejamento.data?.activities ?? [];
    const itens = budget.data?.items ?? [];
    const motivos: string[] = [];
    if (atividades.length === 0) motivos.push("a obra não tem atividades no planejamento");
    else if (!atividades.some(a => a.cpmCalculatedAt)) motivos.push("o CPM nunca foi calculado (aba BASELINE ou GANTT → Calcular CPM)");
    else if (!atividades.some(a => a.cpmCalculatedAt && a.durationDays > 0)) motivos.push("as atividades estão com duração zero");
    if (itens.length === 0) motivos.push("a obra não tem itens de orçamento aprovados");
    else if (!itens.some(i => i.wbsNodeId)) motivos.push("os itens de orçamento não estão ligados à EAP");
    else if (pesos.custoPorAtividade.size === 0 && pesos.valorSemDestino > 0) {
      // O valor existe, mas não encontra atividade nesta versão da EAP. Dizer
      // "o orçamento não chegou às atividades" deixava o engenheiro procurando
      // um problema de orçamento quando o problema era de vínculo entre versões.
      motivos.push(
        `R$ ${pesos.valorSemDestino.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} em ` +
          `${pesos.itensSemDestino} item(ns) de orçamento estão ligados a pacotes que não existem na versão atual da EAP`
      );
    }

    return (
      <div className="xl-painel">
        <div className="xl-painel-intro">
          <div>
            <span className="xl-painel-kicker">CURVA S</span>
            <h2>Sem dados para curva S</h2>
            <p>
              {motivos.length > 0
                ? `Falta: ${motivos.join("; ")}.`
                : "Nenhuma atividade ficou com peso de custo — o valor do orçamento não chegou às atividades."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const inicioPlanejado = planejamento.data?.activities?.[0]?.earlyStart ?? null;
  const hojeNum =
    hoje && inicioPlanejado
      ? Math.floor((new Date(hoje).getTime() - new Date(inicioPlanejado).getTime()) / 86400000)
      : 0;
  const aindaNaoComecou = hoje != null && inicioPlanejado != null && hojeNum < 0;
  // O ponto de referência é HOJE, não o fim da obra. Antes, o desvio vinha do
  // último ponto (`finalActual - finalPlanned`): qualquer obra sem execução
  // lançada aparecia como "Obra atrasada" com -100% de desvio, no primeiro dia
  // e mesmo antes da data de início. Agora compara o realizado com o planejado
  // até hoje, e antes do início a resposta honesta é "ainda não começou".
  const pontoHoje = aindaNaoComecou
    ? { day: 0, planned: 0, actual: 0 }
    : [...curve.points].reverse().find(p => p.day <= Math.min(hojeNum, curve.duration)) ??
      curve.points[0];
  const desvio = pontoHoje.actual - pontoHoje.planned;
  const statusHoje = aindaNaoComecou
    ? "indeterminado"
    : desvio > 0.5
      ? "adiantado"
      : desvio < -0.5
        ? "atrasado"
        : "no_prazo";
  const dataDeInicio = inicioPlanejado
    ? new Date(inicioPlanejado).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : null;

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">CURVA S — CONTROLE DE PRAZO</span>
          <h2>
            {aindaNaoComecou && "Obra ainda não começou"}
            {!aindaNaoComecou && statusHoje === "adiantado" && "Obra adiantada"}
            {!aindaNaoComecou && statusHoje === "no_prazo" && "Obra no prazo"}
            {!aindaNaoComecou && statusHoje === "atrasado" && "Obra atrasada"}
          </h2>
          <p>
            {aindaNaoComecou
              ? `Início planejado em ${dataDeInicio ?? "data não definida"} — não existe atraso antes de a obra começar.`
              : `Planejado até hoje: ${pontoHoje.planned.toFixed(1)}% — Realizado acumulado: ${pontoHoje.actual.toFixed(1)}% — Desvio: ${desvio.toFixed(1)} p.p.`}
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
          <span className="xl-cartao-titulo">Desvio até hoje</span>
          <strong className="xl-cartao-valor">{desvio.toFixed(1)} p.p.</strong>
          <span className="xl-cartao-nota">
            {aindaNaoComecou
              ? "obra ainda não começou"
              : desvio < 0
                ? "atrasado"
                : desvio > 0
                  ? "adiantado"
                  : "em cima do planejado"}
          </span>
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
                  const totalCost = budgetItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
                  const cost = budgetItems
                    .filter(item => item.wbsNodeId === a.wbsNodeId)
                    .reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
                  const weight = totalCost > 0 ? (cost / totalCost) * 100 : 0;
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
