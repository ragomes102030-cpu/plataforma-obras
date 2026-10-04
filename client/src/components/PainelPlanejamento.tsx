import { useEffect, useMemo, useState } from "react";
import { Activity, Camera, CheckCircle2, GitBranch, Play, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = {
  projetoId: number;
};

const TIPOS = ["FS", "SS", "FF", "SF"] as const;

function nomeAtividade(
  activities: Array<{ id: number; wbsCode: string; name: string }>,
  id: number
): string {
  const activity = activities.find(item => item.id === id);
  return activity ? `${activity.wbsCode} — ${activity.name}` : `#${id}`;
}

/**
 * Centro de planejamento da obra.
 *
 * O padrão adotado aqui é o mesmo dos planejadores profissionais:
 * atividade -> relacionamento lógico -> cálculo determinístico -> baseline.
 * A interface apenas orquestra as operações; o backend continua sendo a fonte
 * da verdade dos cálculos.
 */
export function PainelPlanejamento({ projetoId }: Props) {
  const utils = trpc.useUtils();
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const calcular = trpc.planning.calculateCpm.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
  });
  const criarDependencia = trpc.planning.createDependency.useMutation({
    onSuccess: async () => {
      setMensagem("Dependência adicionada. Recalcule o CPM para atualizar o caminho crítico.");
      await utils.planning.list.invalidate({ projectId: projetoId });
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
  });
  const capturarBaseline = trpc.planning.captureBaseline.useMutation({
    onSuccess: async result => {
      setMensagem(`Baseline "${baselineNome.trim()}" criada com ${result.activityCount} atividades.`);
      setBaselineNome("");
      await utils.planning.list.invalidate({ projectId: projetoId });
    },
  });

  const activities = plano.data?.activities ?? [];
  const dependencies = plano.data?.dependencies ?? [];
  const baselines = plano.data?.baselines ?? [];

  const [pred, setPred] = useState("");
  const [succ, setSucc] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("FS");
  const [lag, setLag] = useState("0");
  const [baselineNome, setBaselineNome] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!pred && activities[0]) setPred(String(activities[0].id));
    if (!succ && activities[1]) setSucc(String(activities[1].id));
  }, [activities, pred, succ]);

  const resumo = useMemo(() => {
    const planejadas = activities.filter(
      activity => Number(activity.durationDays) > 0 && Number(activity.startOffset) >= 0
    ).length;
    const criticas = activities.filter(activity => Number(activity.critical) === 1).length;
    const cpmStale =
      activities.length > 0 &&
      activities.some(
        activity =>
          !activity.cpmCalculatedAt ||
          new Date(activity.cpmCalculatedAt).getTime() < new Date(activity.updatedAt).getTime()
      );
    return { planejadas, criticas, cpmStale };
  }, [activities]);

  const cpmExecutadoAgora = calcular.data?.valid === true;
  const podeCapturarBaseline =
    cpmExecutadoAgora &&
    !calcular.isPending &&
    calcular.data?.valid === true;

  const executarCpm = () => {
    setMensagem(null);
    calcular.mutate({ projectId: projetoId });
  };

  const enviarDependencia = () => {
    const predecessorId = Number(pred);
    const successorId = Number(succ);
    const lagDias = Number(lag);

    if (!predecessorId || !successorId) {
      setMensagem("Selecione a predecessora e a sucessora.");
      return;
    }
    if (predecessorId === successorId) {
      setMensagem("Uma atividade não pode depender dela mesma.");
      return;
    }
    if (!Number.isInteger(lagDias)) {
      setMensagem("O lag deve ser um número inteiro de dias.");
      return;
    }

    setMensagem(null);
    criarDependencia.mutate({
      projectId: projetoId,
      predecessorId,
      successorId,
      type: tipo,
      lag: lagDias,
    });
  };

  const executarBaseline = () => {
    const nome = baselineNome.trim();
    if (!nome) {
      setMensagem("Informe um nome para a baseline.");
      return;
    }
    capturarBaseline.mutate({ projectId: projetoId, name: nome });
  };

  if (plano.isPending) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-loading">
          <RefreshCw size={14} className="pl-spin" />
          Carregando núcleo de planejamento…
        </div>
      </section>
    );
  }

  if (plano.isError) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-alerta erro">{plano.error.message}</div>
      </section>
    );
  }

  return (
    <section className="pl-planejamento-panel">
      <header className="pl-planejamento-head">
        <div>
          <div className="pl-planejamento-kicker">
            <Activity size={13} />
            PLANEJAMENTO DA OBRA
          </div>
          <h2>Atividades, lógica, CPM e baseline</h2>
          <p>
            A EAP define o escopo. Aqui ela vira uma rede de atividades que o
            motor calcula e que o engenheiro pode congelar como referência.
          </p>
        </div>
        <button
          type="button"
          className="pl-planejamento-cpm"
          onClick={executarCpm}
          disabled={calcular.isPending || activities.length === 0}
        >
          <Play size={13} />
          {calcular.isPending ? "Calculando…" : "Calcular CPM"}
        </button>
      </header>

      <div className="pl-planejamento-cards">
        <div>
          <span>Atividades</span>
          <strong>{activities.length}</strong>
          <small>{resumo.planejadas} com início e duração</small>
        </div>
        <div>
          <span>Dependências</span>
          <strong>{dependencies.length}</strong>
          <small>ligações lógicas na versão atual</small>
        </div>
        <div>
          <span>Caminho crítico</span>
          <strong>{calcular.data?.criticalPath?.length ?? resumo.criticas}</strong>
          <small>atividades com folga total ≤ 0</small>
        </div>
        <div className={resumo.cpmStale ? "alerta" : ""}>
          <span>Estado do CPM</span>
          <strong>{resumo.cpmStale ? "Desatualizado" : "Calculado"}</strong>
          <small>
            {resumo.cpmStale
              ? "Edite as atividades e recalcule antes de congelar"
              : "rede e datas coerentes com a última execução"}
          </small>
        </div>
      </div>

      {calcular.data?.valid === false && (
        <div className="pl-planejamento-alerta erro">
          <strong>CPM não validado.</strong>{" "}
          {calcular.data.issues?.[0]?.message ?? "A rede precisa de correção antes do cálculo."}
        </div>
      )}

      {calcular.data?.valid === true && (
        <div className="pl-planejamento-alerta sucesso">
          <CheckCircle2 size={14} />
          <span>
            CPM válido · {calcular.data.projectDuration} dias úteis · calendário{" "}
            {"da obra"}
          </span>
        </div>
      )}

      {mensagem && <div className="pl-planejamento-alerta">{mensagem}</div>}

      <div className="pl-planejamento-grid">
        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><GitBranch size={13} /> Rede de dependências</strong>
              <span>Use a lógica entre atividades para construir o cronograma, não apenas datas digitadas.</span>
            </div>
          </div>

          {activities.length < 2 ? (
            <p className="pl-planejamento-vazio">É preciso ter pelo menos duas atividades para criar uma dependência.</p>
          ) : (
            <div className="pl-dependencia-form">
              <label>
                Predecessora
                <select value={pred} onChange={event => setPred(event.target.value)}>
                  {activities.map(activity => (
                    <option key={activity.id} value={activity.id}>
                      {activity.wbsCode} — {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select value={tipo} onChange={event => setTipo(event.target.value as (typeof TIPOS)[number])}>
                  {TIPOS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Sucessora
                <select value={succ} onChange={event => setSucc(event.target.value)}>
                  {activities.map(activity => (
                    <option key={activity.id} value={activity.id}>
                      {activity.wbsCode} — {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lag (dias)
                <input value={lag} onChange={event => setLag(event.target.value)} inputMode="numeric" />
              </label>
              <button
                type="button"
                className="pl-planejamento-secondary"
                onClick={enviarDependencia}
                disabled={criarDependencia.isPending}
              >
                {criarDependencia.isPending ? "Salvando…" : "Adicionar"}
              </button>
            </div>
          )}

          {dependencies.length > 0 && (
            <div className="pl-dependencia-lista">
              {dependencies.slice(0, 10).map(dependency => (
                <div key={dependency.id} className="pl-dependencia-item">
                  <span>{nomeAtividade(activities, dependency.predecessorId)}</span>
                  <strong>{dependency.type}{dependency.lag ? ` ${dependency.lag > 0 ? "+" : ""}${dependency.lag}d` : ""}</strong>
                  <span>{nomeAtividade(activities, dependency.successorId)}</span>
                </div>
              ))}
              {dependencies.length > 10 && (
                <small>Mostrando 10 de {dependencies.length} dependências.</small>
              )}
            </div>
          )}
        </div>

        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><Camera size={13} /> Baseline do cronograma</strong>
              <span>Congela as datas e durações calculadas para comparação futura.</span>
            </div>
          </div>

          <div className="pl-baseline-form">
            <input
              value={baselineNome}
              onChange={event => setBaselineNome(event.target.value)}
              placeholder="Ex.: Planejamento aprovado v1"
              maxLength={160}
            />
            <button
              type="button"
              className="pl-planejamento-secondary"
              onClick={executarBaseline}
              disabled={!podeCapturarBaseline || capturarBaseline.isPending}
              title={
                !podeCapturarBaseline
                  ? "Calcule e valide o CPM antes de capturar uma baseline."
                  : undefined
              }
            >
              {capturarBaseline.isPending ? "Congelando…" : "Capturar baseline"}
            </button>
          </div>

          {baselines.length === 0 ? (
            <p className="pl-planejamento-vazio">Nenhuma baseline registrada.</p>
          ) : (
            <div className="pl-baseline-lista">
              {baselines.slice(0, 5).map(baseline => (
                <div key={baseline.id} className="pl-baseline-item">
                  <div>
                    <strong>{baseline.name}</strong>
                    <small>{baseline.status}</small>
                  </div>
                  <span>{new Date(baseline.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
