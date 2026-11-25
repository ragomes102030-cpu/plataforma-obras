import { useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { buildSCurve } from "@shared/s-curve";
import { acumularRealizado, realizadoNoDia } from "@shared/curva-realizado";
import { dateAt, indexOf } from "@shared/work-calendar";
import { calcularPesosDaCurva } from "@/lib/curva-s-pesos";
import { isPhysicalWeightQaEvidence } from "@shared/physical-weight-qa";
import { calcularProducaoQa } from "@shared/qa-production-simulation";
import { AlertTriangle, ArrowUpRight, ChartNoAxesCombined } from "lucide-react";

/**
 * A Curva S desta central é SOMENTE DE LEITURA.
 * Reaproveita os motores puros da aba Curva S; nunca fabrica históricos.
 * A fonte é o orçamento APROVADO, o CPM e os lançamentos de produção CONFIRMADOS.
 */
type Props = {
  projetoId: number;
  codigosExemplo: ReadonlySet<string>;
  hoje: string;
  abrirAba: (aba: string) => void;
};
type Faixa = "90" | "365" | "total";
const pct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const pctExibir = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? pct(n) : "Sem dado";
const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const inicioValido = (iso: string | null | undefined) => Boolean(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso));
const soFinito = (n: number) => Number.isFinite(n) ? n : 0;

export function CurvaSControlTower({ projetoId, codigosExemplo, hoje, abrirAba }: Props) {
  const [faixa, setFaixa] = useState<Faixa>("total");
  const [pontoSelecionado, setPontoSelecionado] = useState<number | null>(null);
  const planejamento = trpc.planning.list.useQuery({ projectId: projetoId }, { enabled: projetoId > 0, retry: false });
  const budget = trpc.budgets.approvedForCurve.useQuery({ projectId: projetoId }, { enabled: projetoId > 0, retry: false });
  const grade = trpc.planning.grade.useQuery({ projectId: projetoId }, { enabled: projetoId > 0, retry: false });
  const producao = trpc.production.entries.useQuery({ projectId: projetoId }, { enabled: projetoId > 0, retry: false });
  const inicio = grade.data?.inicioObra ?? null;
  const ano = inicioValido(inicio) ? Number(inicio!.slice(0, 4)) : 0;
  const calendario = trpc.planning.getCalendarForCurve.useQuery(
    { projectId: projetoId, startYear: ano },
    { enabled: projetoId > 0 && ano >= 2000 && ano <= 2100, retry: false }
  );
  const comparacao = trpc.planning.compararComBaseline.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 && (planejamento.data?.baselines?.length ?? 0) > 0, retry: false }
  );
  const atividadesDaObra = useMemo(
    () => (planejamento.data?.activities ?? []).filter(a => !codigosExemplo.has(a.wbsCode ?? "")),
    [codigosExemplo, planejamento.data],
  );
  const cenarioQa = atividadesDaObra.length > 0 && atividadesDaObra.every(a => a.physicalWeightApprovedAt != null && isPhysicalWeightQaEvidence(a.physicalWeightEvidence));
  const idsDasAtividadesDaObra = useMemo(() => new Set(atividadesDaObra.map(a => a.id)), [atividadesDaObra]);
  const pesos = useMemo(
    () => calcularPesosDaCurva(atividadesDaObra, budget.data?.items ?? []),
    [atividadesDaObra, budget.data]
  );
  const serie = useMemo(() => {
    if (!planejamento.data || !budget.data?.items?.length || pesos.total <= 0) return null;
    const insumos = atividadesDaObra
      .filter(a => Boolean(a.cpmCalculatedAt) && a.durationDays > 0)
      .map(a => ({
        id: String(a.id),
        duration: a.durationDays,
        earlyStart: a.earlyStart ?? 0,
        plannedPercent: 100 * (pesos.custoPorAtividade.get(a.id) ?? 0) / pesos.total,
        actualPercent: a.progress ?? 0,
      }))
      .filter(a => a.plannedPercent > 0);
    return insumos.length > 0 ? buildSCurve(insumos) : null;
  }, [atividadesDaObra, budget.data, pesos]);

  const planoAprovado = useMemo(() => {
    if (!comparacao.data || pesos.total <= 0) return null;
    const insumos = (comparacao.data.linhas ?? [])
      .filter(l => l.atividadeId != null && idsDasAtividadesDaObra.has(l.atividadeId) && l.baselineInicio != null && l.baselineFim != null)
      .map(l => ({
        id: String(l.atividadeId),
        duration: Math.max(1, l.baselineFim! - l.baselineInicio!),
        earlyStart: l.baselineInicio!,
        plannedPercent: 100 * (pesos.custoPorAtividade.get(l.atividadeId!) ?? 0) / pesos.total,
        actualPercent: 0,
      }))
      .filter(a => a.plannedPercent > 0);
    return insumos.length > 0 ? buildSCurve(insumos) : null;
  }, [comparacao.data, idsDasAtividadesDaObra, pesos]);

  const cal = calendario.data && inicioValido(inicio) ? {
    weekPattern: calendario.data.weekPattern,
    exceptions: calendario.data.exceptions,
  } : null;
  const hojeNum = cal && inicio ? indexOf(cal, inicio, hoje) : 0;

  const acumuladoConfirmado = useMemo(() => {
    if (!cal || !inicio || !serie || !producao.data || !planejamento.data) return null;
    const pesosPorCodigo = new Map<string, { peso: number; planejado: number }>();
    for (const atividade of atividadesDaObra) {
      const custo = pesos.custoPorAtividade.get(atividade.id) ?? 0;
      if (custo <= 0 || !atividade.wbsCode) continue;
      pesosPorCodigo.set(atividade.wbsCode, {
        peso: 100 * custo / pesos.total,
        planejado: Number(atividade.plannedQuantity ?? 0),
      });
    }
    const confirmados = producao.data
      .filter(e => e.status === "confirmada" && e.unidadeCompativel === true && Number(e.exemplo ?? 0) !== 1 && e.vinculo === "atual")
      .map(e => {
        const data = e.productionDate instanceof Date ? e.productionDate.toISOString().slice(0, 10) : String(e.productionDate).slice(0, 10);
        return { codigo: e.codigoEap ?? null, quantidade: Number(e.quantity ?? 0), data };
      })
      .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.data) && e.data <= hoje && Number.isFinite(e.quantidade));
    if (!confirmados.some(e => Boolean(e.codigo && pesosPorCodigo.has(e.codigo) && pesosPorCodigo.get(e.codigo)!.planejado > 0 && e.quantidade > 0))) return null;
    return acumularRealizado(confirmados, pesosPorCodigo, data => indexOf(cal, inicio, data));
  }, [calendario.data, inicio, serie, producao.data, atividadesDaObra, pesos.total, pesos.custoPorAtividade]);

  const simulacaoQa = useMemo(() => {
    if (!producao.data || !planejamento.data) return null;
    const custosPorCodigo = new Map<string, { valorOrcado: number; quantidadePlanejada: number }>();
    for (const atividade of atividadesDaObra) {
      if (!atividade.wbsCode || custosPorCodigo.has(atividade.wbsCode)) continue;
      custosPorCodigo.set(atividade.wbsCode, {
        valorOrcado: pesos.custoPorAtividade.get(atividade.id) ?? 0,
        quantidadePlanejada: Number(atividade.plannedQuantity ?? 0),
      });
    }
    return calcularProducaoQa(
      producao.data.map(e => ({
        status: e.status,
        exemplo: e.exemplo,
        unidadeCompativel: e.unidadeCompativel,
        vinculo: e.vinculo,
        codigo: e.codigoEap ?? null,
        quantidade: Number(e.quantity ?? 0),
        data: e.productionDate instanceof Date ? e.productionDate.toISOString().slice(0, 10) : String(e.productionDate).slice(0, 10),
      })),
      custosPorCodigo,
      pesos.total,
      hoje,
    );
  }, [atividadesDaObra, hoje, planejamento.data, pesos.custoPorAtividade, pesos.total, producao.data]);

  const pontosQa = useMemo(() => {
    if (!cal || !inicio || !simulacaoQa?.pontos.length) return null;
    return [
      { dia: 0, percentual: 0 },
      ...simulacaoQa.pontos.map(ponto => ({ dia: Math.max(0, indexOf(cal, inicio, ponto.data)), percentual: ponto.percentual })),
    ];
  }, [cal, inicio, simulacaoQa]);

  const curvaDados = useMemo(() => {
    if (!serie || !cal || !inicio) return null;
    const termino = Math.max(serie.duration, planoAprovado?.duration ?? 0, 1);
    const limiteFinal = faixa === "total" ? termino : Math.min(termino, Math.max(0, hojeNum));
    const limiteInicio = faixa === "total" ? 0 : Math.max(0, limiteFinal - Number(faixa));
    const passo = Math.max(1, Math.ceil((limiteFinal - limiteInicio) / 155));
    const dias: number[] = [];
    for (let day = limiteInicio; day <= limiteFinal; day += passo) dias.push(day);
    dias.push(limiteFinal);
    if (hojeNum >= limiteInicio && hojeNum <= limiteFinal) dias.push(hojeNum);
    const dados = [...new Set(dias)].sort((a, b) => a - b).map(dia => ({
      dia,
      planejado: soFinito(serie.points[Math.min(dia, serie.duration)]?.planned ?? 0),
      realizado: acumuladoConfirmado && dia <= hojeNum ? soFinito(realizadoNoDia(acumuladoConfirmado, dia)) : null,
      simulacaoQa: pontosQa && dia <= hojeNum ? soFinito(realizadoNoDia(pontosQa, dia)) : null,
      baseline: planoAprovado ? soFinito(planoAprovado.points[Math.min(dia, planoAprovado.duration)]?.planned ?? 0) : null,
    }));
    return { dados, inicio: limiteInicio, fim: limiteFinal };
  }, [serie, planoAprovado, acumuladoConfirmado, pontosQa, cal, inicio, faixa, hojeNum]);

  const temBaseline = (planejamento.data?.baselines?.length ?? 0) > 0;
  // A leitura inicial usa a DATA DE REFERÊNCIA, não o fim futuro da obra.
  // Sem esse cursor, um planejamento de anos abre dizendo "sem realizado" no último dia.
  const indiceHoje = curvaDados?.dados.findIndex(p => p.dia === hojeNum) ?? -1;
  const indiceSelecionado = curvaDados
    ? Math.min(pontoSelecionado ?? (indiceHoje >= 0 ? indiceHoje : curvaDados.dados.length - 1), curvaDados.dados.length - 1)
    : 0;
  const itemSelecionado = curvaDados?.dados[indiceSelecionado] ?? null;

  const emCarregamento = planejamento.isPending || budget.isPending || grade.isPending || producao.isPending || (ano >= 2000 && calendario.isPending) || (temBaseline && comparacao.isPending);
  const falhou = planejamento.isError || budget.isError || grade.isError || producao.isError || (ano >= 2000 && calendario.isError) || comparacao.isError;
  const pronto = Boolean(curvaDados && serie && cal && inicio);
  return (
    <section className="ct-card ct-curve" aria-labelledby="ct-curve-title">
      <div className="ct-card-head">
        <div><span className="ct-overline">LEITURA TEMPORAL · VALOR ORÇAMENTÁRIO</span><h3 id="ct-curve-title">Curva S ponderada pelo valor do orçamento</h3><p>Plano e realizado real por valor; quando houver lançamentos sintéticos compatíveis, a simulação QA aparece em série separada.</p></div>
        {pronto && <div className="ct-filtros" role="group" aria-label="Período da Curva S">
          {([{ key: "90", label: "90 dias" }, { key: "365", label: "12 meses" }, { key: "total", label: "Toda obra" }] as const).map(f =>
            <button key={f.key} type="button" onClick={() => { setFaixa(f.key); setPontoSelecionado(null); }} aria-pressed={faixa === f.key} className={faixa === f.key ? "selecionado" : ""}>{f.label}</button>
          )}
        </div>}
      </div>
      {(cenarioQa || simulacaoQa?.lancamentosValidos) && <div className="ct-data-note ct-data-note-qa" role="note"><AlertTriangle size={17}/><span><strong>CENÁRIO QA:</strong> a linha de simulação usa somente lançamentos QA compatíveis, ligados ao plano atual e confirmados; não é medição real. A linha de realizado continua separada.</span></div>}
      {emCarregamento ? <div className="ct-chart-empty" role="status"><span className="ct-skeleton" />Preparando a série de produção e o cronograma…</div>
        : falhou ? <div className="ct-chart-empty" role="alert"><AlertTriangle size={22} />Não foi possível consultar a série de planejamento. <button type="button" onClick={() => abrirAba("curva-s")}>Abrir diagnóstico da Curva S</button></div>
        : !pronto ? <div className="ct-chart-empty"><ChartNoAxesCombined size={25} /><strong>Curva S ainda não disponível</strong><span>É necessário um CPM calculado, orçamento aprovado associado às atividades e calendário válido. Nenhum histórico é inventado.</span><button type="button" onClick={() => abrirAba("curva-s")}>Ver o que falta <ArrowUpRight size={14}/></button></div>
        : <>
          <div className="ct-chart-key"><span className="ct-key-plano">Plano por valor</span>{acumuladoConfirmado && <span className="ct-key-real">Realizado por valor</span>}{pontosQa && <span className="ct-key-base">Simulação QA por valor</span>}{planoAprovado && <span className="ct-key-base">Baseline por valor</span>}</div>
          <div className="ct-chart-box" role="img" aria-label="Curva S ponderada pelo valor do orçamento. O realizado real e a simulação QA, quando disponíveis, aparecem em séries separadas. Percentuais em relação ao valor total.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvaDados!.dados} margin={{ top: 12, right: 14, left: -12, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="#e6edf1" vertical={false} />
                <XAxis dataKey="dia" type="number" scale="linear" domain={[curvaDados!.inicio, curvaDados!.fim]} tickLine={false} tick={{ fontSize: 11, fill: "#6a8090" }} axisLine={false}
                  tickFormatter={d => cal && inicio ? dataBr(dateAt(cal, inicio, Number(d))) : String(d)} minTickGap={38} />
                <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6a8090" }} tickFormatter={n => n + "%"} />
                <Tooltip formatter={v => pctExibir(v)} labelFormatter={v => cal && inicio ? dataBr(dateAt(cal, inicio, Number(v))) : String(v)}
                  contentStyle={{ borderRadius: 10, border: "1px solid #dce6eb", fontSize: 12 }} />
                {hojeNum >= curvaDados!.inicio && hojeNum <= curvaDados!.fim && <ReferenceLine x={hojeNum} stroke="#d59d4b" strokeDasharray="4 5" />}
                <Line dataKey="planejado" name="Plano por valor" stroke="#187d9c" strokeWidth={3} dot={false} isAnimationActive={false} type="monotone" />
                {acumuladoConfirmado && <Line dataKey="realizado" name="Realizado por valor" stroke="#25a6a0" strokeWidth={3} dot={false} isAnimationActive={false} type="stepAfter" connectNulls={false} />}
                {pontosQa && <Line dataKey="simulacaoQa" name="Simulação QA por valor" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} type="stepAfter" connectNulls={false} />}
                {planoAprovado && <Line dataKey="baseline" name="Baseline por valor" stroke="#899aaa" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} type="monotone" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {itemSelecionado && <div className="ct-chart-explorador">
            <label htmlFor="ct-cursor-data">Explorar evolução</label>
            <input id="ct-cursor-data" aria-label="Selecionar ponto da série acumulada no tempo" type="range" min={0} max={Math.max(0, curvaDados!.dados.length - 1)} value={indiceSelecionado}
              onChange={e => setPontoSelecionado(Number(e.target.value))} />
            <output htmlFor="ct-cursor-data" aria-live="polite">
              {dataBr(dateAt(cal!, inicio!, itemSelecionado.dia))} · Plano por valor {pct(itemSelecionado.planejado)}
              {itemSelecionado.realizado == null ? " · Sem realizado real apurado" : " · Realizado por valor " + pct(itemSelecionado.realizado)}
              {itemSelecionado.simulacaoQa == null ? " · Sem simulação QA compatível" : " · Simulação QA por valor " + pct(itemSelecionado.simulacaoQa)}
            </output>
          </div>}
          <div className="ct-chart-footer">
            <span>{!acumuladoConfirmado ? "Sem realizado real compatível para exibir." : "Realizado ponderado por produção real confirmada e vinculada à versão atual."}{simulacaoQa?.lancamentosValidos ? ` Simulação QA separada: ${simulacaoQa.lancamentosValidos} lançamento(s), EV QA ${simulacaoQa.percentual.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%.` : " Sem apontamento QA compatível para a série de simulação."}{simulacaoQa?.lancamentosUnidadeIncompativel ? ` ${simulacaoQa.lancamentosUnidadeIncompativel} QA excluído(s) por unidade incompatível.` : ""}{simulacaoQa?.lancamentosForaDaVersao ? ` ${simulacaoQa.lancamentosForaDaVersao} QA excluído(s) por vínculo com versão anterior.` : ""}</span>
            <button type="button" onClick={() => abrirAba("curva-s")}>Abrir Curva S <ArrowUpRight size={14}/></button>
          </div>
        </>}
    </section>
  );
}
