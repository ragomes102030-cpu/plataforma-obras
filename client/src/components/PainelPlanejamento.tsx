import { useEffect, useMemo, useState } from "react";
import { Activity, Camera, CheckCircle2, GitBranch, ListPlus, Play, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = {
  projetoId: number;
};

type ProposalItem = {
  eapNodeId: number;
  wbsCode: string;
  name: string;
  phase: string;
  requiresDecompositionReview: boolean;
  duration: number | null;
  plannedQuantity: number | null;
  unit?: string | null;
  rationale: string;
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
 * Fluxo: EAP aprovada → proposta de atividades → revisão do engenheiro →
 * atividade persistida → dependências → CPM → baseline.
 *
 * A proposta NÃO inventa duração nem grava automaticamente. A duração é ato
 * de planejamento e deve ser informada pelo engenheiro, ou derivada apenas
 * quando houver quantidade + produtividade fundamentadas.
 */
export function PainelPlanejamento({ projetoId }: Props) {
  const utils = trpc.useUtils();
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );

  const [proposta, setProposta] = useState<ProposalItem[]>([]);
  const [duracoes, setDuracoes] = useState<Record<number, string>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [pred, setPred] = useState("");
  const [succ, setSucc] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("FS");
  const [lag, setLag] = useState("0");
  const [baselineNome, setBaselineNome] = useState("");

  const gerarProposta = trpc.planning.generateFromEap.useMutation({
    onSuccess: result => {
      setProposta(result.proposal as ProposalItem[]);
      setDuracoes({});
      setMensagem(
        result.pending
          ? `${result.pending} folha(s) elegível(is) aguardando revisão e duração.`
          : result.message
      );
    },
    onError: error => setMensagem(error.message),
  });

  const criarAtividade = trpc.planning.criarAtividadeDaFolha.useMutation({
    onSuccess: async result => {
      const nodeId = criarAtividade.variables?.wbsNodeId;
      if (nodeId) setProposta(atual => atual.filter(item => item.eapNodeId !== nodeId));
      setMensagem("Atividade criada a partir da folha EAP. Revise início e lógica antes do CPM.");
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
    onError: error => setMensagem(error.message),
  });

  const calcular = trpc.planning.calculateCpm.useMutation({
    onSuccess: async result => {
      setMensagem(
        result.valid
          ? `CPM válido · ${result.projectDuration} dias úteis.`
          : result.issues?.[0]?.message ?? "A rede precisa de correção antes do cálculo."
      );
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
    onError: error => setMensagem(error.message),
  });

  const criarDependencia = trpc.planning.createDependency.useMutation({
    onSuccess: async () => {
      setMensagem("Dependência adicionada. Recalcule o CPM para atualizar o caminho crítico.");
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
    onError: error => setMensagem(error.message),
  });

  const capturarBaseline = trpc.planning.captureBaseline.useMutation({
    onSuccess: async result => {
      setMensagem(`Baseline "${baselineNome.trim()}" criada com ${result.activityCount} atividades.`);
      setBaselineNome("");
      await utils.planning.list.invalidate({ projectId: projetoId });
    },
    onError: error => setMensagem(error.message),
  });

  const activities = plano.data?.activities ?? [];
  const dependencies = plano.data?.dependencies ?? [];
  const baselines = plano.data?.baselines ?? [];

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

  const cpmExecutado = calcular.data?.valid === true;
  const semRede = activities.length === 0;
  const podeCapturarBaseline = cpmExecutado && !semRede && !calcular.isPending;

  const enviarDependencia = () => {
    const predecessorId = Number(pred);
    const successorId = Number(succ);
    const lagDias = Number(lag);
    if (!predecessorId || !successorId) return setMensagem("Selecione a predecessora e a sucessora.");
    if (predecessorId === successorId) return setMensagem("Uma atividade não pode depender dela mesma.");
    if (!Number.isInteger(lagDias)) return setMensagem("O lag deve ser um número inteiro de dias.");
    setMensagem(null);
    criarDependencia.mutate({ projectId: projetoId, predecessorId, successorId, type: tipo, lag: lagDias });
  };

  const adicionarAtividade = (item: ProposalItem) => {
    const raw = duracoes[item.eapNodeId]?.trim() ?? "";
    const durationDays = raw ? Number(raw) : undefined;
    if (!durationDays || !Number.isInteger(durationDays) || durationDays < 1) {
      setMensagem(`Informe uma duração inteira em dias para ${item.wbsCode}.`);
      return;
    }
    criarAtividade.mutate({
      projectId: projetoId,
      wbsNodeId: item.eapNodeId,
      durationDays,
      plannedQuantity: item.plannedQuantity ?? undefined,
      unit: item.unit ?? undefined,
    });
  };

  if (plano.isPending) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-loading">
          <RefreshCw size={14} className="pl-spin" /> Carregando núcleo de planejamento…
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
          <div className="pl-planejamento-kicker"><Activity size={13} /> PLANEJAMENTO DA OBRA</div>
          <h2>Atividades, lógica, CPM e baseline</h2>
          <p>
            A EAP aprovada define o escopo. Gere uma proposta a partir das folhas,
            revise a decomposição e informe a duração antes de criar atividades.
          </p>
        </div>
        <button
          type="button"
          className="pl-planejamento-cpm"
          onClick={() => {
            setMensagem(null);
            gerarProposta.mutate({ projectId: projetoId });
          }}
          disabled={gerarProposta.isPending}
          title="Ler as folhas terminais da EAP aprovada e preparar uma proposta de atividades"
        >
          <ListPlus size={13} />
          {gerarProposta.isPending ? "Lendo EAP…" : "Gerar atividades da EAP"}
        </button>
      </header>

      {mensagem && <div className="pl-planejamento-alerta">{mensagem}</div>}

      {proposta.length > 0 && (
        <div className="pl-planejamento-box pl-atividades-proposta">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><ListPlus size={13} /> Proposta derivada da EAP</strong>
              <span>
                {proposta.length} folha(s) aguardando revisão. Nenhuma foi persistida
                automaticamente; duração não é inventada pelo sistema.
              </span>
            </div>
          </div>
          <div className="pl-proposta-nota">
            Confirme se cada pacote representa uma única atividade. Se precisar de
            decomposição, faça-a antes de adicionar a atividade. O início poderá ser
            ajustado na grade do cronograma.
          </div>
          <div className="pl-proposta-lista">
            {proposta.map(item => (
              <div key={item.eapNodeId} className="pl-proposta-item">
                <div className="pl-proposta-identificacao">
                  <strong>{item.wbsCode} · {item.name}</strong>
                  <small>{item.phase}{item.unit ? ` · ${item.unit}` : ""}</small>
                  <span>{item.rationale}</span>
                </div>
                <label className="pl-proposta-duracao">
                  Duração (dias)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={duracoes[item.eapNodeId] ?? ""}
                    onChange={event =>
                      setDuracoes(atual => ({
                        ...atual,
                        [item.eapNodeId]: event.target.value,
                      }))
                    }
                    placeholder="ex.: 10"
                  />
                </label>
                <button
                  type="button"
                  className="pl-planejamento-secondary"
                  onClick={() => adicionarAtividade(item)}
                  disabled={criarAtividade.isPending}
                >
                  {criarAtividade.isPending ? "Salvando…" : "Adicionar atividade"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pl-planejamento-cards">
        <div><span>Atividades</span><strong>{activities.length}</strong><small>{resumo.planejadas} com início e duração</small></div>
        <div><span>Dependências</span><strong>{dependencies.length}</strong><small>ligações lógicas na versão atual</small></div>
        <div><span>Caminho crítico</span><strong>{calcular.data?.criticalPath?.length ?? resumo.criticas}</strong><small>atividades com folga total ≤ 0</small></div>
        <div className={resumo.cpmStale ? "alerta" : ""}>
          <span>Estado do CPM</span>
          <strong>{semRede ? "Sem rede" : resumo.cpmStale ? "Desatualizado" : "Calculado"}</strong>
          <small>
            {semRede
              ? "Crie atividades antes de calcular o caminho crítico"
              : resumo.cpmStale
                ? "Edite as atividades e recalcule antes de congelar"
                : "rede e datas coerentes com a última execução"}
          </small>
        </div>
      </div>

      <div className="pl-planejamento-grid">
        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><GitBranch size={13} /> Rede de dependências</strong>
              <span>Use a lógica entre atividades para construir o cronograma, não apenas datas digitadas.</span>
            </div>
          </div>
          {activities.length < 2 ? (
            <p className="pl-planejamento-vazio">
              É preciso ter pelo menos duas atividades para criar uma dependência.
            </p>
          ) : (
            <div className="pl-dependencia-form">
              <label>Predecessora
                <select value={pred} onChange={event => setPred(event.target.value)}>
                  {activities.map(activity => <option key={activity.id} value={activity.id}>{activity.wbsCode} — {activity.name}</option>)}
                </select>
              </label>
              <label>Tipo
                <select value={tipo} onChange={event => setTipo(event.target.value as (typeof TIPOS)[number])}>
                  {TIPOS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Sucessora
                <select value={succ} onChange={event => setSucc(event.target.value)}>
                  {activities.map(activity => <option key={activity.id} value={activity.id}>{activity.wbsCode} — {activity.name}</option>)}
                </select>
              </label>
              <label>Lag (dias)
                <input value={lag} onChange={event => setLag(event.target.value)} inputMode="numeric" />
              </label>
              <button type="button" className="pl-planejamento-secondary" onClick={enviarDependencia} disabled={criarDependencia.isPending}>
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
              {dependencies.length > 10 && <small>Mostrando 10 de {dependencies.length} dependências.</small>}
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
            <input value={baselineNome} onChange={event => setBaselineNome(event.target.value)} placeholder="Ex.: Planejamento aprovado v1" maxLength={160} />
            <button
              type="button"
              className="pl-planejamento-secondary"
              onClick={() => {
                const nome = baselineNome.trim();
                if (!nome) return setMensagem("Informe um nome para a baseline.");
                capturarBaseline.mutate({ projectId: projetoId, name: nome });
              }}
              disabled={!podeCapturarBaseline || capturarBaseline.isPending}
              title={!podeCapturarBaseline ? "Calcule e valide o CPM antes de capturar uma baseline." : undefined}
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
                  <div><strong>{baseline.name}</strong><small>{baseline.status}</small></div>
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
