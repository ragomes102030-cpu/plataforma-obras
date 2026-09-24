import { trpc } from "@/lib/trpc";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, PieChart } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart as ReAreaChart, Bar, BarChart as ReBarChart, Cell, Line, LineChart as ReLineChart, Pie, PieChart as RePieChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useLocation } from "wouter";
import { NAV_PATHS } from "@/nav-paths";

function barColor(index: number): string {
  const palette = ["#4f7c8f", "#7aa28a", "#b78b58", "#8e7aa8", "#a56b75"];
  return palette[index % palette.length];
}

function dayKey(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  }
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function GraficosView({
  projectId,
  projectName,
  activities,
}: {
  projectId: number;
  projectName: string;
  activities: any[];
}) {
  const entriesQuery = trpc.production.entries.useQuery({ projectId });
  const controlQuery = trpc.planning.control.useQuery({ projectId });
  const evmQuery = trpc.planning.evm.useQuery({ projectId });
  const scurveQuery = trpc.planning.scurve.useQuery({ projectId });
  const budgetQuery = trpc.budgets.list.useQuery({ projectId });
  const wbsQuery = trpc.projects.wbs.useQuery({ projectId });
  const [, navigate] = useLocation();
  const entries = entriesQuery.data ?? [];
  const control = controlQuery.data;
  const evm = evmQuery.data;
  const scurve = scurveQuery.data;

  const productionByDay = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const entry of entries) {
      const day = dayKey(entry.productionDate);
      byDay.set(day, (byDay.get(day) ?? 0) + Number(entry.quantity || 0));
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  }, [entries]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Concluído: 0,
      "Em andamento": 0,
      "Não iniciado": 0,
      "Em risco": 0,
    };
    for (const activity of activities) {
      if (activity.progress >= 100) counts["Concluído"] += 1;
      else if (activity.status === "Em risco") counts["Em risco"] += 1;
      else if (activity.progress > 0) counts["Em andamento"] += 1;
      else counts["Não iniciado"] += 1;
    }
    return counts;
  }, [activities]);

  const statusTotal = Math.max(
    1,
    Object.values(statusCounts).reduce((sum, value) => sum + value, 0)
  );

  const productionByDayChart = useMemo(
    () => productionByDay.map(([day, qty]) => ({ day: day.slice(5), qty })),
    [productionByDay]
  );

  const statusChart = useMemo(
    () =>
      Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        pct: (count / statusTotal) * 100,
      })),
    [statusCounts, statusTotal]
  );

  const deviations = useMemo(() => {
    const rows = control?.activities ?? [];
    return rows
      .filter((row) => Math.abs(row.variance) >= 0.1)
      .sort((a, b) => a.variance - b.variance)
      .slice(0, 40);
  }, [control]);

  const planned = control?.totals.plannedProgress ?? 0;
  const actual = control?.totals.actualProgress ?? 0;

  const donutData = useMemo(() => {
    const realized = Math.min(100, Math.max(0, actual));
    return [
      { name: "Realizado", value: realized, fill: "#4f7c8f" },
      { name: "A realizar", value: Math.max(0, 100 - realized), fill: "#e7eded" },
    ];
  }, [actual]);

  const costByBranch = useMemo(() => {
    const items = budgetQuery.data?.items ?? [];
    if (!items.length) return [];
    const nodes = wbsQuery.data ?? [];
    const wbsById = new Map(nodes.map((node) => [node.id, node]));
    const byBranch = new Map<string, { base: number; segments: Map<string, number> }>();
    for (const item of items) {
      const lineTotal = Number(item.quantity) * Number(item.unitPrice);
      if (lineTotal <= 0) continue;
      const node = item.wbsNodeId != null ? wbsById.get(item.wbsNodeId) : undefined;
      const code = node?.code ?? item.code ?? "";
      const parts = code.split(".");
      const branchCode = parts.slice(0, 2).join(".");
      const branchName = node?.name ? `${branchCode} – ${node.name}` : branchCode || "Sem ramo";
      const segmentCode = parts.slice(0, 3).join(".");
      const segmentName = segmentCode || branchName;
      const entry = byBranch.get(branchName) ?? { base: 0, segments: new Map<string, number>() };
      entry.base += lineTotal;
      entry.segments.set(segmentName, (entry.segments.get(segmentName) ?? 0) + lineTotal);
      byBranch.set(branchName, entry);
    }
    const branches = [...byBranch.entries()]
      .map(([name, data]) => ({ name, ...data, total: data.base }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    return branches;
  }, [budgetQuery.data, wbsQuery.data]);

  const costKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const branch of costByBranch) {
      for (const key of branch.segments.keys()) keys.add(key);
    }
    return [...keys];
  }, [costByBranch]);

  const costChartData = useMemo(
    () =>
      costByBranch.map((branch) => {
        const row: Record<string, number | string> = { branch: branch.name };
        for (const key of costKeys) row[key] = branch.segments.get(key) ?? 0;
        return row;
      }),
    [costByBranch, costKeys]
  );

  const cumulativeProduction = useMemo(() => {
    let acc = 0;
    return productionByDayChart.map((row) => {
      acc += row.qty;
      return { day: row.day, qty: acc };
    });
  }, [productionByDayChart]);

  const donutChartConfig = {
    Realizado: { label: "Realizado", color: "#4f7c8f" },
    "A realizar": { label: "A realizar", color: "#e7eded" },
  } as const;

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <LineChart size={22} />
        </div>
        <div>
          <p className="eyebrow accent">GRÁFICOS</p>
          <h2>Gráficos</h2>
          <p>
            {projectName} · planejado × realizado, produção e distribuição de status
            das atividades.
          </p>
        </div>
        <span className="module-hero-status">
          <span />{" "}
          {activities.length === 0
            ? "Sem atividades"
            : entries.length === 0
              ? "Sem produção"
              : "Com dados"}
        </span>
        <div className="module-hero-actions">
          {activities.length === 0 ? (
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Cronogramas"])}
            >
              Cronogramas
            </button>
          ) : null}
          {entries.length === 0 ? (
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Produção"])}
            >
              Produção
            </button>
          ) : null}
        </div>
      </div>

      <div className="catalog-summary-grid">
        <div
          className="module-card budget-summary-card clickable-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate(NAV_PATHS["Cronogramas"])}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Cronogramas"]);
          }}
        >
          <span className="eyebrow">PLANEJADO</span>
          <strong>{planned}%</strong>
          <p>Curva física do CPM.</p>
        </div>
        <div
          className="module-card budget-summary-card clickable-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate(NAV_PATHS["Produção"])}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Produção"]);
          }}
        >
          <span className="eyebrow">REALIZADO</span>
          <strong>{actual}%</strong>
          <p>Avanço por medições.</p>
        </div>
        <div
          className="module-card budget-summary-card budget-total-card clickable-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate(NAV_PATHS["Cronogramas"])}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") navigate(NAV_PATHS["Cronogramas"]);
          }}
        >
          <span className="eyebrow">ATIVIDADES</span>
          <strong>{activities.length}</strong>
          <p>No cronograma ativo.</p>
        </div>
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Avanço físico (donut)</h3>
            <p>Percentual realizado sobre a curva física planejada.</p>
          </div>
          <PieChart size={17} className="sparkle" />
        </div>
        {donutChartConfig == null ? null : (
          <ChartContainer config={donutChartConfig} className="h-[220px] w-full aspect-auto">
            <RePieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={3}>
                {donutData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
            </RePieChart>
          </ChartContainer>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>EVM — valor agregado (cap. 18)</h3>
            <p>PV, EV e AC com SPI, CPI, desvios e projeção EAC.</p>
          </div>
          <LineChart size={17} className="sparkle" />
        </div>
        {evmQuery.isPending ? (
          <div className="module-empty">Carregando EVM...</div>
        ) : !evm || !evm.available ? (
          <div className="module-empty">
            <LineChart size={20} />
            <span>
              <strong>Sem dados de EVM.</strong> Configure a base de dados da obra.
            </span>
          </div>
        ) : (
          <>
            <div className="control-summary" style={{ marginBottom: 12 }}>
              <div>
                <span className="eyebrow">SPI</span>
                <strong className={evm.spi !== null && evm.spi < 1 ? "negative-variance" : "positive-variance"}>
                  {evm.spi ?? "—"}
                </strong>
              </div>
              <div>
                <span className="eyebrow">CPI</span>
                <strong className={evm.cpi !== null && evm.cpi < 1 ? "negative-variance" : "positive-variance"}>
                  {evm.cpi ?? "—"}
                </strong>
              </div>
              <div>
                <span className="eyebrow">SV</span>
                <strong className={evm.sv < 0 ? "negative-variance" : "positive-variance"}>
                  {formatMoney(evm.sv)}
                </strong>
              </div>
              <div>
                <span className="eyebrow">CV</span>
                <strong className={evm.cv !== null && evm.cv < 0 ? "negative-variance" : "positive-variance"}>
                  {evm.cv === null ? "—" : formatMoney(evm.cv)}
                </strong>
              </div>
            </div>
            <div className="catalog-summary-grid" style={{ marginBottom: 12 }}>
              <div className="budget-summary-card">
                <span className="eyebrow">BAC</span>
                <strong>{formatMoney(evm.bac)}</strong>
                <p>Orçamento ao concluir.</p>
              </div>
              <div className="budget-summary-card">
                <span className="eyebrow">PV / EV / AC</span>
                <strong style={{ fontSize: 16 }}>
                  {formatMoney(evm.pv)} · {formatMoney(evm.ev)} · {evm.ac === null ? "—" : formatMoney(evm.ac)}
                </strong>
                <p>Planejado × realizado × custo.</p>
              </div>
              <div className="budget-summary-card budget-total-card">
                <span className="eyebrow">EAC / VAC / ETC</span>
                <strong style={{ fontSize: 16 }}>
                  {evm.eac === null ? "—" : formatMoney(evm.eac)} · {evm.vac === null ? "—" : formatMoney(evm.vac)} · {evm.etc === null ? "—" : formatMoney(evm.etc)}
                </strong>
                <p>Estimativa ao término.</p>
              </div>
            </div>
            {evm.note ? (
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 0 }}>{evm.note}</p>
            ) : null}
            <div className="control-summary">
              <div>
                <span className="eyebrow">PLANEJADO</span>
                <strong>{evm.plannedPct}%</strong>
              </div>
              <div>
                <span className="eyebrow">REALIZADO</span>
                <strong>{evm.actualPct}%</strong>
              </div>
              <div>
                <span className="eyebrow">REFERÊNCIA</span>
                <strong style={{ fontSize: 14 }}>{new Date(evm.asOf).toLocaleDateString("pt-BR")}</strong>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Curva S (cap. 14)</h3>
            <p>Avanço físico acumulado planejado × realizado.</p>
          </div>
          <LineChart size={17} className="sparkle" />
        </div>
        {scurveQuery.isPending ? (
          <div className="module-empty">Carregando curva S...</div>
        ) : !scurve || !scurve.available || scurve.points.length === 0 ? (
          <div className="module-empty">
            <LineChart size={20} />
            <span>
              <strong>Sem curva.</strong>{" "}
              {scurve?.note ?? "Monte o cronograma e lance a produção para desenhar a curva."}
            </span>
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Cronogramas"])}
            >
              Abrir Cronogramas
            </button>
          </div>
        ) : (
          <ChartContainer
            config={{
              planned: { label: "Planejado %", color: "#4f7c8f" },
              actual: { label: "Realizado %", color: "#b78b58" },
            }}
            className="h-[240px] w-full aspect-auto"
          >
            <ReLineChart data={scurve.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,162,138,0.25)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value: string) => value.slice(5)}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(value: number) => `${value}%`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line dataKey="planned" type="monotone" stroke="var(--color-planned)" strokeWidth={2} dot={false} />
              <Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={2} dot={false} />
            </ReLineChart>
          </ChartContainer>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Planejado × realizado</h3>
            <p>Comparação executiva dos totais de avanço físico.</p>
          </div>
          <PieChart size={17} className="sparkle" />
        </div>
        <div className="control-summary" style={{ marginBottom: 12 }}>
          <div>
            <span className="eyebrow">PLANEJADO</span>
            <strong>{planned}%</strong>
          </div>
          <div>
            <span className="eyebrow">REALIZADO</span>
            <strong>{actual}%</strong>
          </div>
          <div>
            <span className="eyebrow">DESVIO</span>
            <strong
              className={
                control && control.totals.variance < 0
                  ? "negative-variance"
                  : "positive-variance"
              }
            >
              {control && control.totals.variance > 0 ? "+" : ""}
              {control?.totals.variance ?? 0} pp
            </strong>
          </div>
        </div>
        <div className="lob-kpis">
          {[
            { label: "Planejado", value: planned },
            { label: "Realizado", value: actual },
          ].map((item, index) => (
            <div key={item.label}>
              <span className="eyebrow">{item.label.toUpperCase()}</span>
              <div
                style={{
                  height: 12,
                  borderRadius: 6,
                  background: "#e7eded",
                  marginTop: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, item.value))}%`,
                    height: "100%",
                    background: barColor(index),
                  }}
                />
              </div>
              <strong style={{ display: "block", marginTop: 6 }}>
                {item.value}%
              </strong>
            </div>
          ))}
        </div>
        {!control && entriesQuery.isPending ? (
          <div className="module-empty">Carregando indicadores...</div>
        ) : null}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Custo por frente (orçamento)</h3>
            <p>Distribuição do orçamento por ramo da WBS (barras empilhadas).</p>
          </div>
          <PieChart size={17} className="sparkle" />
        </div>
        {budgetQuery.isPending ? (
          <div className="module-empty">Carregando orçamento...</div>
        ) : costChartData.length === 0 ? (
          <div className="module-empty">
            <PieChart size={20} />
            <span>
              <strong>Sem orçamento.</strong> Lance os itens do orçamento para
              ver a distribuição de custo por frente.
            </span>
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Orçamento"])}
            >
              Ir para Orçamento
            </button>
          </div>
        ) : (
          <>
            <ChartContainer
              config={Object.fromEntries(
                costKeys.map((key, index) => [
                  key,
                  { label: key, color: barColor(index) },
                ])
              )}
              className="h-[260px] w-full aspect-auto"
            >
              <ReBarChart data={costChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,162,138,0.25)" vertical={false} />
                <XAxis
                  dataKey="branch"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                  interval={0}
                  angle={-18}
                  height={52}
                  tickFormatter={(value: string) =>
                    value.length > 22 ? `${value.slice(0, 21)}…` : value
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(value: number) => compactMoney(value)}
                />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                {costKeys.map((key, index) => (
                  <Bar key={key} dataKey={key} stackId="cost" fill={barColor(index)} maxBarSize={64} />
                ))}
              </ReBarChart>
            </ChartContainer>
            <div className="control-summary" style={{ marginTop: 12 }}>
              <div>
                <span className="eyebrow">FRENTES</span>
                <strong>{costByBranch.length}</strong>
              </div>
              <div>
                <span className="eyebrow">MAIOR FRENTE</span>
                <strong style={{ fontSize: 13 }}>
                  {costByBranch[0]?.name ?? "—"}
                </strong>
              </div>
              <div>
                <span className="eyebrow">TOTAL</span>
                <strong>
                  {formatMoney(
                    costByBranch.reduce((sum, branch) => sum + branch.total, 0)
                  )}
                </strong>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Desvios por atividade</h3>
            <p>Maiores desvios entre o avanço planejado e o realizado, por atividade.</p>
          </div>
          <PieChart size={17} className="sparkle" />
        </div>
        {!control && entriesQuery.isPending ? (
          <div className="module-empty">Carregando atividades...</div>
        ) : deviations.length === 0 ? (
          <div className="module-empty">
            <PieChart size={20} />
            <span>
              <strong>Sem desvios relevantes.</strong>{" "}
              {activities.length === 0
                ? "Monte o cronograma para comparar os avanços."
                : "Planejado e realizado em linha."}
            </span>
          </div>
        ) : (
          <div className="deviation-list">
            <div className="deviation-row deviation-row-head">
              <span>Atividade</span>
              <span>Planejado</span>
              <span>Realizado</span>
              <span>Desvio</span>
            </div>
            {deviations.map((row) => (
              <div className="deviation-row" key={row.id}>
                <div className="deviation-info">
                  <strong>{row.name}</strong>
                  <span>
                    {row.phase} · {row.wbsCode}
                  </span>
                </div>
                <div className="deviation-cell">
                  <span>{row.plannedProgress}%</span>
                  <div className="deviation-bar">
                    <div style={{ width: `${Math.min(100, Math.max(0, row.plannedProgress))}%` }} />
                  </div>
                </div>
                <div className="deviation-cell">
                  <span>{row.actualProgress}%</span>
                  <div className="deviation-bar deviation-bar-actual">
                    <div style={{ width: `${Math.min(100, Math.max(0, row.actualProgress))}%` }} />
                  </div>
                </div>
                <b
                  className={`deviation-badge ${
                    row.variance < 0 ? "negative-variance" : "positive-variance"
                  }`}
                >
                  {row.variance > 0 ? "+" : ""}
                  {row.variance} pp
                </b>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Produção por dia (últimos lançamentos)</h3>
            <p>Colunas com a quantidade apontada em cada data.</p>
          </div>
          <LineChart size={16} className="sparkle" />
        </div>
        {productionByDay.length === 0 ? (
          <div className="module-empty">
            <LineChart size={20} />
            <span>
              <strong>Sem lançamentos.</strong> A curva de produção por dia
              começa com o primeiro apontamento confirmado.
            </span>
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Produção"])}
            >
              Ir para Produção
            </button>
          </div>
        ) : (
          <ChartContainer
            config={{
              qty: { label: "Quantidade", color: "#4f7c8f" },
            }}
            className="h-[220px] w-full aspect-auto"
          >
            <ReBarChart data={productionByDayChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,162,138,0.25)" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="qty" fill="var(--color-qty)" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </ReBarChart>
          </ChartContainer>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Produção acumulada</h3>
            <p>Área com a soma diária acumulada dos últimos lançamentos.</p>
          </div>
          <LineChart size={16} className="sparkle" />
        </div>
        {cumulativeProduction.length === 0 ? (
          <div className="module-empty">
            <LineChart size={20} />
            <span>
              <strong>Sem lançamentos.</strong> A área acumulada começa com o
              primeiro apontamento confirmado.
            </span>
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Produção"])}
            >
              Ir para Produção
            </button>
          </div>
        ) : (
          <ChartContainer
            config={{
              qty: { label: "Acumulado", color: "#4f7c8f" },
            }}
            className="h-[220px] w-full aspect-auto"
          >
            <ReAreaChart data={cumulativeProduction} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="productionAccumulatedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f7c8f" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4f7c8f" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,162,138,0.25)" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="qty"
                stroke="var(--color-qty)"
                strokeWidth={2}
                fill="url(#productionAccumulatedFill)"
              />
            </ReAreaChart>
          </ChartContainer>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Situação das atividades</h3>
            <p>Distribuição percentual por status (padrão relatório executivo).</p>
          </div>
        </div>
        {activities.length === 0 ? (
          <div className="module-empty">
            <PieChart size={20} />
            <span>
              <strong>Sem atividades.</strong> O mapa de status depende do
              cronograma da obra.
            </span>
            <button
              type="button"
              className="outline-button"
              onClick={() => navigate(NAV_PATHS["Cronogramas"])}
            >
              Abrir Cronogramas
            </button>
          </div>
        ) : (
          <ChartContainer
            config={{
              pct: { label: "% das atividades" },
            }}
            className="h-[220px] w-full aspect-auto"
          >
            <ReBarChart data={statusChart} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,162,138,0.25)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => `${value}%`} />
              <YAxis
                type="category"
                dataKey="status"
                tickLine={false}
                axisLine={false}
                width={96}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent formatter={(value) => `${Number(value).toFixed(1)}%`} />
                }
              />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]} maxBarSize={16} background={{ fill: "#eef1f2", radius: 3 }}>
                {statusChart.map((entry, index) => (
                  <Cell key={entry.status} fill={barColor(index)} />
                ))}
              </Bar>
            </ReBarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
