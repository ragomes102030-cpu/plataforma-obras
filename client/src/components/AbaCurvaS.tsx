import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { buildSCurve, type SCurveResult } from "@shared/s-curve";
import { acumularRealizado, realizadoNoDia, type PontoRealizado } from "@shared/curva-realizado";
import { brazilianHolidays, defaultCalendar, indexOf } from "@shared/work-calendar";
import { calcularPesosDaCurva } from "@/lib/curva-s-pesos";
import { EstadoCarregando } from "./EstadoCarregando";

/** Percentual em pt-BR, com vírgula. `toFixed` imprimia "29.0%". */
function pctBr(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function ppBr(valor: number): string {
  const sinal = valor > 0 ? "+" : "";
  return `${sinal}${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
}

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

  // Linha do PLANO APROVADO: as mesmas atividades, com as datas da baseline.
  // Ver as três curvas juntas é o que separa "a obra está atrasada" de "a obra
  // está atrasada em relação ao que eu aprovei, por causa destas atividades" —
  // e é assim que a reunião de obra começa em qualquer software de mercado.
  // Datas de referência da obra (início e hoje) para converter dia ↔ data.
  const grade = trpc.planning.grade.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  const comparacao = trpc.planning.compararComBaseline.useQuery(
    { projectId: Number(projetoId) },
    {
      enabled:
        Number(projetoId) > 0 && (planejamento.data?.baselines?.length ?? 0) > 0,
    }
  );

  const curvaBaseline = useMemo(() => {
    if (!comparacao.data || pesos.total <= 0) return null;
    const atividades = (comparacao.data.linhas ?? [])
      .filter(
        linha =>
          linha.atividadeId != null &&
          linha.baselineInicio != null &&
          linha.baselineFim != null
      )
      .map(linha => {
        const custo = pesos.custoPorAtividade.get(linha.atividadeId!) ?? 0;
        return {
          id: String(linha.atividadeId),
          // O snapshot guarda início e fim; a duração sai da diferença para não
          // depender de a duração ter mudado depois.
          duration: Math.max(1, linha.baselineFim! - linha.baselineInicio!),
          plannedPercent: (custo / pesos.total) * 100,
          actualPercent: 0,
          earlyStart: linha.baselineInicio!,
        };
      })
      .filter(atividade => atividade.plannedPercent > 0);

    if (atividades.length === 0) return null;
    return buildSCurve(atividades);
  }, [comparacao.data, pesos]);

  // `earlyStart` é DIA DE TRABALHO (0, 1, 2…), não data. A versão anterior fazia
  // new Date(earlyStart) e new Date(0) = 1970; como a primeira atividade começa no
  // dia 0 (falsy), o cálculo desabava e o cabeçalho mostrava o dia 0 para sempre:
  // "Planejado até hoje 0,0% — Realizado 0,0%" mesmo com 10 atividades em 100%.
  // A ponte dia↔data vem do calendário da obra (`planning.grade`).
  const inicioObra = grade.data?.inicioObra ?? null;
  const calendario = useMemo(() => {
    if (!inicioObra) return null;
    const ano = Number(inicioObra.slice(0, 4));
    const base = defaultCalendar(ano);
    // Uma obra de 580 dias atravessa dois ou três anos; sem os feriados do ano
    // seguinte o "hoje" cairia alguns dias fora do eixo.
    return {
      ...base,
      exceptions: [ano, ano + 1, ano + 2].flatMap(y => brazilianHolidays(y)),
    };
  }, [inicioObra]);
  const hojeNum = hoje && inicioObra && calendario ? indexOf(calendario, inicioObra, hoje) : 0;
  const aindaNaoComecou = hoje != null && inicioObra != null && hojeNum < 0;
  const dataDeInicio = inicioObra
    ? new Date(`${inicioObra}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : null;

  // Peso e quantidade planejada por código da EAP — a mesma chave do lançamento
  // de produção, que sobrevive à troca de versão do plano.
  const pesosPorCodigo = useMemo(() => {
    const mapa = new Map<string, { peso: number; planejado: number }>();
    if (pesos.total <= 0) return mapa;
    for (const atividade of planejamento.data?.activities ?? []) {
      const custo = pesos.custoPorAtividade.get(atividade.id) ?? 0;
      if (custo <= 0) continue;
      mapa.set(atividade.wbsCode, {
        peso: (custo / pesos.total) * 100,
        planejado: Number(atividade.plannedQuantity ?? 0),
      });
    }
    return mapa;
  }, [planejamento.data, pesos]);

  const producao = trpc.production.entries.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  // REALIZADO DATADO PELA PRODUÇÃO: o que foi confirmado até cada dia. Antes o
  // realizado era "planejado × % concluído" espalhado dentro da janela PLANEJADA
  // — atividade feita fora do prazo não aparecia e o realizado podia "voltar no
  // tempo" quando alguém lançava atrasado.
  const pontosRealizado: PontoRealizado[] = useMemo(
    () =>
      acumularRealizado(
        (producao.data ?? [])
          .filter(entrada => entrada.status === "confirmada")
          .map(entrada => ({
            codigo: entrada.codigoEap ?? null,
            quantidade: Number(entrada.quantity ?? 0),
            data: new Date(entrada.productionDate).toISOString().slice(0, 10),
          })),
        pesosPorCodigo,
        data => (calendario && inicioObra ? indexOf(calendario, inicioObra, data) : 0)
      ),
    [producao.data, pesosPorCodigo, calendario, inicioObra]
  );
  const realizadoHoje = realizadoNoDia(pontosRealizado, hojeNum);

  // A linha verde só existe até onde há lançamento; estendê-la com o último valor
  // até hoje evita a impressão de que a execução "parou" no último apontamento.
  //
  // ATENÇÃO: este hook precisa ficar ANTES dos returns de carregamento. Movê-lo
  // para depois deles quebra a ordem dos hooks (React #310) e a aba inteira cai
  // com "Ocorreu um erro inesperado" — foi o que aconteceu na 1ª versão.
  const serieRealizado = useMemo(() => {
    const pontos = [...pontosRealizado];
    const ultimo = pontos[pontos.length - 1];
    const duracao = curve?.duration ?? 0;
    const limite = Math.min(Math.max(hojeNum, 0), Math.max(duracao, 1));
    if (ultimo && limite > ultimo.dia) {
      pontos.push({ dia: limite, percentual: ultimo.percentual });
    }
    return pontos;
  }, [pontosRealizado, hojeNum, curve?.duration]);

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

  const planejadoHoje =
    [...curve.points].reverse().find(p => p.day <= Math.min(hojeNum, curve.duration)) ??
    curve.points[0];
  // Desvio = realizado (pela produção) menos planejado (até hoje), em pontos
  // percentuais da obra.
  const desvio = realizadoHoje - planejadoHoje.planned;
  const statusHoje = aindaNaoComecou
    ? "indeterminado"
    : desvio > 0.5
      ? "adiantado"
      : desvio < -0.5
        ? "atrasado"
        : "no_prazo";
  // Eixo comum às três curvas: a baseline pode ser mais longa (ou mais curta)
  // que o plano de hoje, e escalas diferentes fariam a comparação mentir.
  const eixoDias = Math.max(curve.duration, curvaBaseline?.duration ?? 0) || curve.duration;
  const x = (dia: number) => 50 + (dia / eixoDias) * 530;

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
              : `Planejado até hoje: ${pctBr(planejadoHoje.planned)} — Realizado: ${pctBr(realizadoHoje)} — Desvio: ${ppBr(desvio)}`}
          </p>
          <p className="xl-curva-regua">
            Tudo nesta tela é ponderado pelo valor do orçamento. O painel da obra pondera pela
            quantidade — por isso os percentuais são diferentes, e os dois estão certos.
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
          {Array.from({ length: Math.floor(eixoDias / 50) + 1 }, (_, i) => i * 50).map(day => (
            <text key={day} x={x(day)} y="275" textAnchor="middle" fontSize="10" fill="#94a3b8">{day}d</text>
          ))}

          {/* Linha do hoje */}
          {hojeNum > 0 && hojeNum <= eixoDias && (
            <line
              x1={x(hojeNum)}
              y1="20"
              x2={x(hojeNum)}
              y2="260"
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
          )}

          {/* Plano aprovado (baseline) */}
          {curvaBaseline && (
            <polyline
              fill="none"
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="5,3"
              points={curvaBaseline.points.map(p => `${x(p.day)},${260 - p.planned * 2.4}`).join(" ")}
            />
          )}

          {/* Curva planejada */}
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={curve.points.map(p => `${x(p.day)},${260 - p.planned * 2.4}`).join(" ")}
          />

          {/* Curva real — datada pela produção confirmada, não pelo planejado */}
          <polyline
            fill="none"
            stroke={desvio < 0 ? "#ef4444" : "#22c55e"}
            strokeWidth="2"
            points={serieRealizado.map(p => `${x(p.dia)},${260 - p.percentual * 2.4}`).join(" ")}
          />

          {/* Legenda */}
          <rect x="380" y="10" width="12" height="3" fill="#3b82f6" />
          <text x="396" y="15" fontSize="10" fill="#94a3b8">Planejado</text>
          <rect x="380" y="25" width="12" height="3" fill={desvio < 0 ? "#ef4444" : "#22c55e"} />
          <text x="396" y="30" fontSize="10" fill="#94a3b8">Realizado</text>
          {hojeNum > 0 && hojeNum <= eixoDias && (
            <>
              <rect x="380" y="40" width="12" height="3" fill="#f59e0b" />
              <text x="396" y="45" fontSize="10" fill="#94a3b8">Hoje</text>
            </>
          )}
          {curvaBaseline && (
            <>
              <rect x="380" y="55" width="12" height="3" fill="#64748b" />
              <text x="396" y="60" fontSize="10" fill="#94a3b8">Plano aprovado</text>
            </>
          )}
        </svg>
      </div>

      {/* Cards de resumo */}
      <div className="xl-cartoes">
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Duração do plano</span>
          <strong className="xl-cartao-valor">{curve.duration} dias úteis</strong>
          {curvaBaseline && curvaBaseline.duration !== curve.duration && (
            <span className="xl-cartao-nota">
              aprovado: {curvaBaseline.duration} dias úteis
            </span>
          )}
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Planejado até hoje</span>
          <strong className="xl-cartao-valor">{pctBr(planejadoHoje.planned)}</strong>
          <span className="xl-cartao-nota">por valor do orçamento</span>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Realizado até hoje</span>
          <strong className="xl-cartao-valor">{pctBr(realizadoHoje)}</strong>
          <span className="xl-cartao-nota">por valor lançado na produção</span>
        </div>
        <div className={`xl-cartao ${desvio < 0 ? "xl-cartao-ruim" : "xl-cartao-bom"}`}>
          <span className="xl-cartao-titulo">Desvio até hoje</span>
          <strong className="xl-cartao-valor">{ppBr(desvio)}</strong>
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
                  // Mesmo cálculo de peso da curva (nó e, se falhar, código da
                  // EAP). Antes esta tabela casava só por `wbsNodeId` e mostrava
                  // 0,0% para todo mundo enquanto o gráfico desenhava a curva.
                  const cost = pesos.custoPorAtividade.get(a.id) ?? 0;
                  const weight = pesos.total > 0 ? (cost / pesos.total) * 100 : 0;
                  return (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{a.earlyStart}d</td>
                      <td>{a.durationDays}d</td>
                      <td>{pctBr(weight)}</td>
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
