import { trpc } from "@/lib/trpc";
import { ClipboardCheck, Scale } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { NAV_PATHS } from "@/nav-paths";

function monthKey(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 7);
}

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

/**
 * Medição (nível operacional): períodos derivados dos lançamentos de produção
 * + controle planejado×realizado. Medição financeira global (parcelas/saldo de
 * contrato) depende da decisão D2 em docs/analise-planilhas/regras-conflitantes.md.
 */
export function MedicaoView({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const entriesQuery = trpc.production.entries.useQuery({ projectId });
  const controlQuery = trpc.planning.control.useQuery({ projectId });
  const activitiesQuery = trpc.projects.activities.useQuery({ projectId });
  const [, navigate] = useLocation();

  const entries = entriesQuery.data ?? [];
  const control = controlQuery.data;
  const activities = activitiesQuery.data ?? [];

  const periods = useMemo(() => {
    const byMonth = new Map<
      string,
      { quantity: number; count: number; confirmed: number }
    >();
    for (const entry of entries) {
      const key = monthKey(entry.productionDate);
      const bucket = byMonth.get(key) ?? {
        quantity: 0,
        count: 0,
        confirmed: 0,
      };
      bucket.quantity += Number(entry.quantity || 0);
      bucket.count += 1;
      if (entry.status === "confirmada") {
        bucket.confirmed += 1;
      }
      byMonth.set(key, bucket);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, ...value }));
  }, [entries]);

  const totalProduced = entries.reduce(
    (sum, entry) => sum + Number(entry.quantity || 0),
    0
  );
  const totalConfirmed = entries.filter(
    entry => entry.status === "confirmada"
  ).length;
  const plannedProgress = control?.totals.plannedProgress ?? 0;
  const actualProgress = control?.totals.actualProgress ?? 0;
  const variance = control?.totals.variance ?? 0;

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Scale size={22} />
        </div>
        <div>
          <p className="eyebrow accent">MEDIÇÃO</p>
          <h2>Medição</h2>
          <p>
            {projectName} · períodos de produção e avanço físico para acompanhamento
            da medição.
          </p>
        </div>
        <span className="module-hero-status">
          <span />{" "}
          {periods.length === 0 ? "Sem períodos" : `${periods.length} período(s)`}
        </span>
      </div>

      <div className="catalog-summary-grid">
        <div className="module-card budget-summary-card">
          <span className="eyebrow">PLANEJADO</span>
          <strong>{plannedProgress}%</strong>
          <p>Avanço físico planejado (CPM).</p>
        </div>
        <div className="module-card budget-summary-card">
          <span className="eyebrow">REALIZADO</span>
          <strong>{actualProgress}%</strong>
          <p>Medições confirmadas no controle.</p>
        </div>
        <div className="module-card budget-summary-card budget-total-card">
          <span className="eyebrow">DESVIO</span>
          <strong
            className={variance < 0 ? "negative-variance" : "positive-variance"}
          >
            {variance > 0 ? "+" : ""}
            {variance} pp
          </strong>
          <p>Real menos planejado.</p>
        </div>
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Períodos de produção (base da medição)</h3>
            <p>
              Agrupamento mensal dos lançamentos. Medição financeira por parcela de
              contrato fica para a decisão D2 do modelo consolidado.
            </p>
          </div>
          <ClipboardCheck size={17} className="sparkle" />
        </div>
        {entriesQuery.isPending ? (
          <div className="module-empty">Carregando períodos...</div>
        ) : periods.length === 0 ? (
          <div className="module-empty">
            <Scale size={20} />
            <span>
              <strong>Nenhum período ainda.</strong> A medição começa após o
              primeiro apontamento de produção.
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
          <div className="budget-table-wrap">
            <table className="budget-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Lançamentos</th>
                  <th>Confirmados</th>
                  <th>Qtd. produzida</th>
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period.key}>
                    <td>
                      <strong>{formatMonth(period.key)}</strong>
                    </td>
                    <td>{period.count}</td>
                    <td>{period.confirmed}</td>
                    <td>
                      {period.quantity.toLocaleString("pt-BR", {
                        maximumFractionDigits: 3,
                      })}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td>{entries.length}</td>
                  <td>{totalConfirmed}</td>
                  <td>
                    <strong>
                      {totalProduced.toLocaleString("pt-BR", {
                        maximumFractionDigits: 3,
                      })}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Planejado × realizado por atividade</h3>
            <p>Base para conferência da medição física item a item.</p>
          </div>
        </div>
        {control && control.activities.length ? (
          <div className="control-list">
            {control.activities.map(activity => (
              <div className="control-row" key={activity.id}>
                <div>
                  <strong>
                    {activity.wbsCode} · {activity.name}
                  </strong>
                  <span>
                    {activity.actualQuantity.toFixed(3)} realizado de{" "}
                    {activity.plannedQuantity.toFixed(3)}
                  </span>
                </div>
                <div className="control-bars">
                  <div>
                    <i style={{ width: `${activity.plannedProgress}%` }} />
                    <em style={{ width: `${activity.actualProgress}%` }} />
                  </div>
                  <b
                    className={
                      activity.variance < 0 ? "negative-variance" : ""
                    }
                  >
                    {activity.variance > 0 ? "+" : ""}
                    {activity.variance} pp
                  </b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="module-empty">
            <Scale size={20} />
            <span>
              {activities.length
                ? "Informe quantidades planejadas no cronograma para comparar com o realizado."
                : "Sem atividades no cronograma — comece pela EAP e pelo cronograma."}
            </span>
            <button
              type="button"
              className="outline-button"
              onClick={() =>
                navigate(
                  activities.length
                    ? NAV_PATHS["Cronogramas"]
                    : NAV_PATHS["EAP"]
                )
              }
            >
              {activities.length ? "Abrir Cronogramas" : "Abrir EAP"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
