import { Activity, CircleHelp, Dices, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Risco de prazo sobre o cronograma da versão atual.
 *
 * O CPM da aba ao lado devolve um prazo só. Aqui a pergunta é outra: com que
 * confiança dá para prometer uma data. Os números vêm do servidor; o componente
 * não faz conta, só apresenta — e diz em voz alta quando o dado não sustenta
 * prazo nenhum (rede desconectada, atividade sem duração).
 */

type Props = {
  projetoId: number;
  activities: {
    id: number;
    wbsCode?: string | null;
    name?: string | null;
    durationDays: number | string | null;
    /** Faixa declarada na tabela de atividades. Ausente = incerteza do painel. */
    durationOptimisticDays?: number | null;
    durationPessimisticDays?: number | null;
  }[];
  dependencies: {
    predecessorId: number;
    successorId: number;
    type?: string | null;
    lag?: number | string | null;
  }[];
};

const RELACOES = ["FS", "SS", "FF", "SF"] as const;
type Relacao = (typeof RELACOES)[number];

function normalizarRelacao(valor: string | null | undefined): Relacao {
  const limpo = (valor ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  return (RELACOES as readonly string[]).includes(limpo) ? (limpo as Relacao) : "FS";
}

function dias(valor: number): string {
  return `${Math.round(valor)}d`;
}

export function PainelMonteCarlo({ projetoId, activities, dependencies }: Props) {
  const [simular, setSimular] = useState(false);

  const payload = useMemo(
    () => ({
      projectId: projetoId,
      activities: activities.map(activity => ({
        id: activity.id,
        wbsCode: String(activity.wbsCode ?? ""),
        name: String(activity.name ?? ""),
        durationDays: Number(activity.durationDays ?? 0),
        durationOptimisticDays: activity.durationOptimisticDays ?? null,
        durationPessimisticDays: activity.durationPessimisticDays ?? null,
      })),
      dependencies: dependencies.map(dependency => ({
        predecessorId: dependency.predecessorId,
        successorId: dependency.successorId,
        type: normalizarRelacao(dependency.type),
        lag: Math.round(Number(dependency.lag ?? 0)),
      })),
      iterations: 5000,
      uncertainty: 0.25,
    }),
    [projetoId, activities, dependencies]
  );

  const simulacao = trpc.planning.simulateScheduleRisk.useQuery(payload, {
    enabled: simular,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const resultado = simulacao.data;
  const alturaMaxima = resultado ? Math.max(...resultado.histogram.map(item => item.count), 1) : 1;

  return (
    <div className="pl-planejamento-box">
      <div className="pl-planejamento-box-head">
        <div>
          <strong>
            <Dices size={13} /> Risco de prazo — Monte Carlo
          </strong>
          <span>
            O CPM responde um prazo. Isto responde a chance de cumprir a data: distribuição de
            duração conforme as premissas informadas, P50/P80 e as atividades que mais empurram o término.
          </span>
        </div>
        <button
          type="button"
          className="pl-planejamento-cpm"
          onClick={() => {
            if (simular) void simulacao.refetch();
            else setSimular(true);
          }}
          disabled={simulacao.isFetching || activities.length === 0}
          title={
            activities.length === 0
              ? "Crie atividades primeiro."
              : "5000 simulações com incerteza de 25% na duração."
          }
        >
          <Dices size={13} />
          {simulacao.isFetching ? "Simulando…" : simular ? "Simular de novo" : "Simular risco"}
        </button>
      </div>

      {simulacao.isError && <div className="pl-planejamento-alerta erro">{simulacao.error.message}</div>}

      {resultado && (
        <>
          {resultado.alerts.map(alerta => (
            <div key={alerta} className="pl-planejamento-alerta">
              <TriangleAlert size={13} /> {alerta}
            </div>
          ))}

          <div className="pl-planejamento-alerta">
            <CircleHelp size={13} />{" "}
            {resultado.threePointCoverage.declared === resultado.threePointCoverage.total
              ? "Todas as atividades têm faixa otimista/pessimista declarada — a simulação usa o risco que você estudou."
              : `${resultado.threePointCoverage.declared} de ${resultado.threePointCoverage.total} atividades têm faixa declarada. As demais usam a incerteza de 25% do painel; declarar a faixa de cada uma muda o P80.`}
          </div>

          <div className="pl-planejamento-cards">
            <div>
              <span>Determinístico</span>
              <strong>{dias(resultado.deterministicDuration)}</strong>
              <small>prazo usando as durações mais prováveis</small>
            </div>
            <div>
              <span>P50</span>
              <strong>{dias(resultado.p50)}</strong>
              <small>metade das simulações termina até aqui</small>
            </div>
            <div>
              <span>P80</span>
              <strong>{dias(resultado.p80)}</strong>
              <small>80% das simulações terminam até aqui; confira as premissas</small>
            </div>
            <div>
              <span>P90</span>
              <strong>{dias(resultado.p90)}</strong>
              <small>cenário conservador</small>
            </div>
            <div>
              <span>Desvio</span>
              <strong>±{dias(resultado.stdDev)}</strong>
              <small>{resultado.iterations} simulações</small>
            </div>
          </div>

          <div className="pl-planejamento-box-head">
            <div>
              <strong>
                <Activity size={13} /> Distribuição do término
              </strong>
              <span>Quanto mais larga a curva, menos previsível é a obra.</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 96, padding: "0 4px 12px" }}>
            {resultado.histogram.map(faixa => (
              <div
                key={faixa.days}
                title={`${faixa.days} dias: ${faixa.count} simulações`}
                style={{
                  flex: 1,
                  minWidth: 2,
                  height: `${Math.max(4, (faixa.count / alturaMaxima) * 100)}%`,
                  background: "var(--pl-barra, #3b82f6)",
                  borderRadius: 2,
                  opacity: faixa.days >= resultado.p80 ? 0.45 : 0.9,
                }}
              />
            ))}
          </div>

          <div className="pl-planejamento-box-head">
            <div>
              <strong>O que mais empurra o prazo</strong>
              <span>
                Correlação entre a duração da atividade e o término da obra. Não é culpa — é onde
                intervir rende mais.
              </span>
            </div>
          </div>
          <div className="pl-cpm-tabela">
            {resultado.sensitivity.slice(0, 8).map(item => (
              <div key={item.id} className="pl-cpm-linha">
                <span>{item.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-block",
                      height: 6,
                      width: `${Math.min(100, Math.abs(item.correlation) * 100)}%`,
                      background: "var(--pl-barra, #3b82f6)",
                      borderRadius: 3,
                    }}
                  />
                </span>
                <span>{(item.correlation * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>

          <div className="pl-planejamento-box-head">
            <div>
              <strong>Criticidade</strong>
              <span>
                Em quantas simulações a atividade virou caminho crítico. Acima de 50% é onde o atraso
                nasce.
              </span>
            </div>
          </div>
          <div className="pl-cpm-tabela">
            {resultado.criticality.slice(0, 8).map(item => (
              <div key={item.id} className={item.index >= 0.5 ? "pl-cpm-linha critica" : "pl-cpm-linha"}>
                <span>{item.label}</span>
                <span>{(item.index * 100).toFixed(0)}%</span>
                <span>{item.index >= 0.5 ? "crítica" : "folga"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
