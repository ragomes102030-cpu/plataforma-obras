import { useMemo } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { buildSCurve } from "@shared/s-curve";
import { realizadoNoDia } from "@shared/curva-realizado";
import {
  prepararInsumosDaCurvaFisica,
  acumularProducaoFisica,
  coberturaDeProducao,
} from "@shared/curva-fisica";
import { isPhysicalWeightQaEvidence } from "@shared/physical-weight-qa";
import { dateAt, indexOf } from "@shared/work-calendar";

export function CurvaFisicaDashboard({
  projetoId,
  codigosExemplo,
  hoje,
  abrirAba,
}: {
  projetoId: number;
  codigosExemplo: ReadonlySet<string>;
  hoje: string;
  abrirAba: (aba: string) => void;
}) {
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );
  const grade = trpc.planning.grade.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );
  const producao = trpc.production.entries.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );
  const inicio = grade.data?.inicioObra ?? null;
  const ano = inicio ? Number(inicio.slice(0, 4)) : 0;
  const calendario = trpc.planning.getCalendarForCurve.useQuery(
    { projectId: projetoId, startYear: ano },
    { enabled: projetoId > 0 && ano >= 2000 && ano <= 2100, retry: false }
  );
  const atividades = useMemo(
    () =>
      (plano.data?.activities ?? []).filter(
        a =>
          Number(a.exemplo ?? 0) !== 1 && !codigosExemplo.has(a.wbsCode ?? "")
      ),
    [plano.data, codigosExemplo]
  );
  const base = useMemo(
    () =>
      prepararInsumosDaCurvaFisica(
        atividades.map(a => ({
          activityId: a.id,
          quantidade:
            a.plannedQuantity == null ? null : Number(a.plannedQuantity),
          pesoFisico:
            a.physicalWeight == null ? null : Number(a.physicalWeight),
          pesoFisicoAprovado: a.physicalWeightApprovedAt != null,
        }))
      ),
    [atividades]
  );
  const dados = useMemo(() => {
    if (
      !base.disponivel ||
      !inicio ||
      !calendario.data ||
      !producao.data ||
      atividades.some(
        a =>
          !a.cpmCalculatedAt ||
          !a.updatedAt ||
          !Number.isFinite(new Date(a.cpmCalculatedAt).getTime()) ||
          !Number.isFinite(new Date(a.updatedAt).getTime()) ||
          new Date(a.cpmCalculatedAt).getTime() <
            new Date(a.updatedAt).getTime() ||
          !a.durationDays ||
          a.durationDays <= 0 ||
          a.earlyStart == null
      )
    )
      return null;
    const cal = {
      weekPattern: calendario.data.weekPattern,
      exceptions: calendario.data.exceptions,
    };
    const curva = buildSCurve(
      atividades.map(a => ({
        id: String(a.id),
        duration: a.durationDays,
        earlyStart: a.earlyStart!,
        plannedPercent: base.porAtividade.get(a.id)!.peso,
        actualPercent: 0,
      }))
    );
    const entradas = producao.data
      .filter(
        e =>
          e.status === "confirmada" &&
          e.unidadeCompativel === true &&
          Number(e.exemplo ?? 0) !== 1 &&
          e.vinculo === "atual" &&
          (!(e.productionDate instanceof Date) || Number.isFinite(e.productionDate.getTime())) &&
          base.porAtividade.has(e.activityId)
      )
      .map(e => ({
        activityId: e.activityId,
        quantidade: Number(e.quantity),
        data:
          e.productionDate instanceof Date
            ? e.productionDate.toISOString().slice(0, 10)
            : String(e.productionDate).slice(0, 10),
      }))
      .filter(
        e =>
          /^\d{4}-\d{2}-\d{2}$/.test(e.data) &&
          Number.isFinite(Date.parse(e.data + "T12:00:00Z")) &&
          new Date(e.data + "T12:00:00Z").toISOString().slice(0, 10) === e.data &&
          e.data <= hoje &&
          Number.isFinite(e.quantidade) &&
          e.quantidade >= 0
      );
    const pontos = acumularProducaoFisica(
      entradas.map(e => ({
        activityId: e.activityId,
        quantidade: e.quantidade,
        dia: indexOf(cal, inicio, e.data),
      })),
      base.porAtividade
    );
    const hojeNum = hoje < inicio ? -1 : indexOf(cal, inicio, hoje);
    const entradasDatadas = entradas.map(e => ({ activityId: e.activityId, dia: indexOf(cal, inicio, e.data) }));
    const cobertura = coberturaDeProducao(entradasDatadas, base.porAtividade, hojeNum);
    const fim = Math.max(curva.duration, hojeNum, ...pontos.map(p => p.dia));
    const passo = Math.max(1, Math.ceil(fim / 150));
    const dias: number[] = [];
    for (let dia = 0; dia <= fim; dia += passo) dias.push(dia);
    dias.push(fim, curva.duration);
    for (const ponto of pontos) dias.push(ponto.dia);
    if (hojeNum >= 0) dias.push(hojeNum);
    const serie = [...new Set(dias)]
      .sort((a, b) => a - b)
      .map(dia => ({
        data: dateAt(cal, inicio, dia),
        planejado: curva.points[Math.min(dia, curva.duration)]?.planned ?? 0,
        realizado:
          pontos.length && dia >= pontos[0]!.dia && dia <= hojeNum
            ? realizadoNoDia(pontos, dia)
            : null,
      }));
    return { serie, cobertura };
  }, [atividades, base, calendario.data, inicio, hoje, producao.data]);
  const qa = atividades.some(a =>
    isPhysicalWeightQaEvidence(a.physicalWeightEvidence)
  );
  const carregando =
    plano.isPending ||
    grade.isPending ||
    producao.isPending ||
    (ano >= 2000 && calendario.isPending);
  const erro =
    plano.isError || grade.isError || producao.isError || calendario.isError;
  return (
    <section className="ct-card ct-curve" aria-labelledby="ct-curve-title">
      <div className="ct-card-head">
        <div>
          <span className="ct-overline">ACOMPANHAMENTO FÍSICO</span>
          <h3 id="ct-curve-title">Curva S física</h3>
          <p>
            Planejamento e produção confirmada, ponderados pelos pesos físicos
            aprovados.
          </p>
        </div>
      </div>
      {qa && (
        <div className="ct-data-note ct-data-note-qa" role="note">
          Os pesos incluem premissas de teste; não representam medição real.
        </div>
      )}
      {carregando ? (
        <div className="ct-chart-empty" role="status">
          Carregando planejamento e produção…
        </div>
      ) : erro ? (
        <div className="ct-chart-empty" role="alert">
          Não foi possível consultar os dados da curva.
        </div>
      ) : !dados ? (
        <div className="ct-chart-empty">
          <strong>Curva física ainda não disponível</strong>
          <span>
            Confira quantidades, pesos aprovados, calendário e CPM atualizado.
          </span>
          <button type="button" onClick={() => abrirAba("atividades")}>
            Conferir atividades
          </button>
        </div>
      ) : (
        <>
          <div className="ct-chart-key">
            <span className="ct-key-plano">Planejado atual</span>
            <span className="ct-key-real">Produção confirmada (parcial)</span>
          </div>
          <div
            className="ct-chart-box"
            role="img"
            aria-label="Curva física planejada e produção confirmada por data"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados.serie}>
                <XAxis dataKey="data" tick={{ fontSize: 10 }} minTickGap={45} />
                <YAxis domain={[0, 100]} tickFormatter={n => n + "%"} />
                <Tooltip
                  formatter={v =>
                    typeof v === "number" ? v.toFixed(1) + "%" : "Sem dado"
                  }
                />
                <Line
                  dataKey="planejado"
                  name="Planejado"
                  stroke="#187d9c"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="realizado"
                  name="Produção confirmada"
                  stroke="#25a6a0"
                  dot={false}
                  isAnimationActive={false}
                  type="stepAfter"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="ct-chart-footer">
            <span>
              {dados.cobertura.registradas} de {dados.cobertura.total} atividades têm produção confirmada. A curva mostra apenas o registrado; atividades sem registro permanecem sem dado. Consulte a linha de base no cronograma.
            </span>
            <button type="button" onClick={() => abrirAba("producao")}>
              Conferir produção
            </button>
          </div>
        </>
      )}
    </section>
  );
}
