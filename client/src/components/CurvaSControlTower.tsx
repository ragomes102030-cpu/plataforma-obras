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
import { AlertTriangle, ArrowUpRight, ChartNoAxesCombined } from "lucide-react";

/**
 * A Curva S desta central é SOMENTE DE LEITURA.
 * Reaproveita os motores puros da aba Curva S; nunca fabrica históricos.
 * A fonte é o orçamento APROVADO, o CPM e os lançamentos de produção CONFIRMADOS.
 */
type Props = {
  projetoId: number;
  hoje: string;
  abrirAba: (aba: string) => void;
  /** Somente para expor divergência de régua, nunca corrigir a série artificialmente. */
  painelReal: number;
  painelPlanejado: number;
};
type Faixa = "90" | "365" | "total";
const pct = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const pctExibir = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? pct(n) : "Sem dado";
const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const inicioValido = (iso: string | null | undefined) => Boolean(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso));
const soFinito = (n: number) => Number.isFinite(n) ? n : 0;

export function CurvaSControlTower({ projetoId, hoje, abrirAba, painelReal, painelPlanejado }: Props) {
  const [faixa, setFaixa] = useState<Faixa>("total");
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
  const pesos = useMemo(
    () => calcularPesosDaCurva(planejamento.data?.activities ?? [], budget.data?.items ?? []),
    [planejamento.data, budget.data]
  );
  const serie = useMemo(() => {
    if (!planejamento.data || !budget.data?.items?.length || pesos.total <= 0) return null;
    const insumos = planejamento.data.activities
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
  }, [planejamento.data, budget.data, pesos]);

  const planoAprovado = useMemo(() => {
    if (!comparacao.data || pesos.total <= 0) return null;
    const insumos = (comparacao.data.linhas ?? [])
      .filter(l => l.atividadeId != null && l.baselineInicio != null && l.baselineFim != null)
      .map(l => ({
        id: String(l.atividadeId),
        duration: Math.max(1, l.baselineFim! - l.baselineInicio!),
        earlyStart: l.baselineInicio!,
        plannedPercent: 100 * (pesos.custoPorAtividade.get(l.atividadeId!) ?? 0) / pesos.total,
        actualPercent: 0,
      }))
      .filter(a => a.plannedPercent > 0);
    return insumos.length > 0 ? buildSCurve(insumos) : null;
  }, [comparacao.data, pesos]);

  const cal = calendario.data && inicioValido(inicio) ? {
    weekPattern: calendario.data.weekPattern,
    exceptions: calendario.data.exceptions,
  } : null;
  const hojeNum = cal && inicio ? indexOf(cal, inicio, hoje) : 0;

  const acumuladoConfirmado = useMemo(() => {
    if (!cal || !inicio || !serie || !producao.data || !planejamento.data) return null;
    const pesosPorCodigo = new Map<string, { peso: number; planejado: number }>();
    for (const atividade of planejamento.data.activities) {
      const custo = pesos.custoPorAtividade.get(atividade.id) ?? 0;
      if (custo <= 0 || !atividade.wbsCode) continue;
      pesosPorCodigo.set(atividade.wbsCode, {
        peso: 100 * custo / pesos.total,
        planejado: Number(atividade.plannedQuantity ?? 0),
      });
    }
    const confirmados = producao.data
      .filter(e => e.status === "confirmada")
      .map(e => {
        const data = e.productionDate instanceof Date ? e.productionDate.toISOString().slice(0, 10) : String(e.productionDate).slice(0, 10);
        return { codigo: e.codigoEap ?? null, quantidade: Number(e.quantity ?? 0), data };
      })
      .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.data) && Number.isFinite(e.quantidade));
    if (!confirmados.some(e => Boolean(e.codigo && pesosPorCodigo.has(e.codigo) && pesosPorCodigo.get(e.codigo)!.planejado > 0 && e.quantidade > 0))) return null;
    return acumularRealizado(confirmados, pesosPorCodigo, data => indexOf(cal, inicio, data));
  }, [calendario.data, inicio, serie, producao.data, planejamento.data, pesos.total, pesos.custoPorAtividade]);

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
      baseline: planoAprovado ? soFinito(planoAprovado.points[Math.min(dia, planoAprovado.duration)]?.planned ?? 0) : null,
    }));
    return { dados, inicio: limiteInicio, fim: limiteFinal };
  }, [serie, planoAprovado, acumuladoConfirmado, cal, inicio, faixa, hojeNum]);

  const temBaseline = (planejamento.data?.baselines?.length ?? 0) > 0;
  const emCarregamento = planejamento.isPending || budget.isPending || grade.isPending || producao.isPending || (ano >= 2000 && calendario.isPending) || (temBaseline && comparacao.isPending);
  const falhou = planejamento.isError || budget.isError || grade.isError || producao.isError || (ano >= 2000 && calendario.isError) || comparacao.isError;
  const pronto = Boolean(curvaDados && serie && cal && inicio);
  const erroRegua = Boolean(
    pronto && acumuladoConfirmado && hojeNum >= 0 &&
    (Math.abs((serie?.points[Math.min(hojeNum, serie!.duration)]?.planned ?? 0) / 100 - painelPlanejado) > .002 ||
     Math.abs(realizadoNoDia(acumuladoConfirmado, hojeNum) / 100 - painelReal) > .002)
  );

  return (
    <section className="ct-card ct-curve" aria-labelledby="ct-curve-title">
      <div className="ct-card-head">
        <div><span className="ct-overline">LEITURA TEMPORAL</span><h3 id="ct-curve-title">Curva S de desempenho</h3><p>Planejamento atualizado, produção confirmada e baseline, quando aprovada.</p></div>
        {pronto && <div className="ct-filtros" role="group" aria-label="Período da Curva S">
          {([{ key: "90", label: "90 dias" }, { key: "365", label: "12 meses" }, { key: "total", label: "Toda obra" }] as const).map(f =>
            <button key={f.key} type="button" onClick={() => setFaixa(f.key)} aria-pressed={faixa === f.key} className={faixa === f.key ? "selecionado" : ""}>{f.label}</button>
          )}
        </div>}
      </div>
      {emCarregamento ? <div className="ct-chart-empty" role="status"><span className="ct-skeleton" />Preparando a série de produção e o cronograma…</div>
        : falhou ? <div className="ct-chart-empty" role="alert"><AlertTriangle size={22} />Não foi possível consultar a série de planejamento. <button type="button" onClick={() => abrirAba("curva-s")}>Abrir diagnóstico da Curva S</button></div>
        : !pronto ? <div className="ct-chart-empty"><ChartNoAxesCombined size={25} /><strong>Curva S ainda não disponível</strong><span>É necessário um CPM calculado, orçamento aprovado associado às atividades e calendário válido. Nenhum histórico é inventado.</span><button type="button" onClick={() => abrirAba("curva-s")}>Ver o que falta <ArrowUpRight size={14}/></button></div>
        : <>
          <div className="ct-chart-key"><span className="ct-key-plano">Planejado</span><span className="ct-key-real">Realizado</span>{planoAprovado && <span className="ct-key-base">Baseline</span>}</div>
          <div className="ct-chart-box" role="img" aria-label={"Curva S com séries reais de planejamento e produção, em porcentagem, desde o início da obra. " + (!acumuladoConfirmado ? "Sem lançamentos confirmados válidos para o realizado." : "Realizado obtido de lançamentos confirmados.")}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvaDados!.dados} margin={{ top: 12, right: 14, left: -12, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="#e6edf1" vertical={false} />
                <XAxis dataKey="dia" type="number" scale="linear" domain={[curvaDados!.inicio, curvaDados!.fim]} tickLine={false} tick={{ fontSize: 11, fill: "#6a8090" }} axisLine={false}
                  tickFormatter={d => cal && inicio ? dataBr(dateAt(cal, inicio, Number(d))) : String(d)} minTickGap={38} />
                <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6a8090" }} tickFormatter={n => n + "%"} />
                <Tooltip formatter={v => pctExibir(v)} labelFormatter={v => cal && inicio ? dataBr(dateAt(cal, inicio, Number(v))) : String(v)}
                  contentStyle={{ borderRadius: 10, border: "1px solid #dce6eb", fontSize: 12 }} />
                {hojeNum >= curvaDados!.inicio && hojeNum <= curvaDados!.fim && <ReferenceLine x={hojeNum} stroke="#d59d4b" strokeDasharray="4 5" />}
                <Line dataKey="planejado" name="Planejado" stroke="#187d9c" strokeWidth={3} dot={false} isAnimationActive={false} type="monotone" />
                <Line dataKey="realizado" name="Realizado" stroke="#25a6a0" strokeWidth={3} dot={false} isAnimationActive={false} type="stepAfter" connectNulls={false} />
                {planoAprovado && <Line dataKey="baseline" name="Baseline" stroke="#899aaa" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} type="monotone" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="ct-chart-footer">
            <span>{!acumuladoConfirmado ? "Sem apontamentos confirmados suficientes: realizado não exibido." : "Realizado datado pela produção confirmada."}</span>
            <button type="button" onClick={() => abrirAba("curva-s")}>Abrir Curva S <ArrowUpRight size={14}/></button>
          </div>
          {erroRegua && <p className="ct-aviso-regua" role="note"><AlertTriangle size={15}/> Os percentuais desta curva (orçamento aprovado e produção confirmada) diferem dos cartões (cronograma e orçamento da versão ativa). Verifique versões e lançamentos antes de comparar.</p>}
        </>}
    </section>
  );
}
