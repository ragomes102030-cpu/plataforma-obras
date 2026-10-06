import { Camera, CheckCircle2, LockKeyhole, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type Props = { projetoId: number };

export function AbaBaseline({ projetoId }: Props) {
  const utils = trpc.useUtils();
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);

  const capturar = trpc.planning.captureBaseline.useMutation({
    onSuccess: async result => {
      setMensagem(`Baseline "${nome.trim()}" criada com ${result.activityCount} atividade(s).`);
      setNome("");
      await utils.planning.list.invalidate({ projectId: projetoId });
    },
    onError: error => setMensagem(error.message),
  });

  const activities = plano.data?.activities ?? [];
  const baselines = plano.data?.baselines ?? [];

  const resumo = useMemo(() => {
    const validas = activities.filter(activity => Number(activity.durationDays) >= 1);
    const semCpm = validas.filter(activity => !activity.cpmCalculatedAt);
    const desatualizadas = validas.filter(
      activity =>
        activity.cpmCalculatedAt &&
        new Date(activity.cpmCalculatedAt).getTime() < new Date(activity.updatedAt).getTime()
    );
    const cpmOk = activities.length > 0 && validas.length === activities.length && semCpm.length === 0 && desatualizadas.length === 0;
    return {
      cpmOk,
      validas: validas.length,
      semDuracao: activities.length - validas.length,
      semCpm: semCpm.length,
      desatualizadas: desatualizadas.length,
    };
  }, [activities]);

  const podeCapturar = resumo.cpmOk && !capturar.isPending;

  if (plano.isPending) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-loading">
          <RefreshCw size={14} className="pl-spin" /> Carregando baseline…
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
          <div className="pl-planejamento-kicker"><LockKeyhole size={13} /> BASELINE DO CRONOGRAMA</div>
          <h2>Congelar a linha de base do planejamento</h2>
          <p>
            A baseline registra uma fotografia das datas e durações calculadas para
            comparar o planejado com o realizado. Ela não substitui a EAP aprovada e não altera a versão de trabalho.
          </p>
        </div>
      </header>

      {mensagem && <div className="pl-planejamento-alerta">{mensagem}</div>}

      <div className="pl-planejamento-cards">
        <div><span>Atividades</span><strong>{activities.length}</strong><small>{resumo.validas} com duração válida</small></div>
        <div><span>CPM</span><strong>{resumo.cpmOk ? "OK" : "Pendente"}</strong><small>{resumo.cpmOk ? "todos calculados e atuais" : "calcule/recalcule antes de congelar"}</small></div>
        <div><span>Baselines</span><strong>{baselines.length}</strong><small>registros desta obra</small></div>
        <div><span>Estado</span><strong>{baselines.some(item => item.status === "ativa") ? "Ativa" : "Sem baseline"}</strong><small>uma baseline ativa pode ser mantida como referência</small></div>
      </div>

      {!resumo.cpmOk && (
        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong>Gate de captura</strong>
              <span>A baseline só é aceita com o CPM consistente e atualizado.</span>
            </div>
          </div>
          <div className="pl-planejamento-cards">
            <div><span>Duração inválida</span><strong>{resumo.semDuracao}</strong><small>atividades sem duração positiva</small></div>
            <div><span>Sem CPM</span><strong>{resumo.semCpm}</strong><small>atividades ainda não calculadas</small></div>
            <div><span>CPM desatualizado</span><strong>{resumo.desatualizadas}</strong><small>foram alteradas depois do último cálculo</small></div>
            <div><span>Ação</span><strong>CPM</strong><small>volte à etapa CPM e recalcule</small></div>
          </div>
        </div>
      )}

      <div className="pl-planejamento-grid">
        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><Camera size={13} /> Capturar nova baseline</strong>
              <span>Use um nome que permita identificar a referência aprovada pelo planejamento.</span>
            </div>
          </div>
          <div className="pl-baseline-form">
            <input
              value={nome}
              onChange={event => setNome(event.target.value)}
              placeholder="Ex.: Planejamento aprovado v1"
              maxLength={160}
            />
            <button
              type="button"
              className="pl-planejamento-secondary"
              onClick={() => {
                const valor = nome.trim();
                if (!valor) return setMensagem("Informe um nome para a baseline.");
                capturar.mutate({ projectId: projetoId, name: valor });
              }}
              disabled={!podeCapturar}
              title={!podeCapturar ? "Calcule e mantenha o CPM atualizado antes de capturar a baseline." : undefined}
            >
              {capturar.isPending ? "Congelando…" : "Capturar baseline"}
            </button>
          </div>
          <p className="pl-planejamento-vazio">
            A captura grava início planejado, duração e posições CPM de cada atividade da versão atual.
          </p>
        </div>

        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><CheckCircle2 size={13} /> Baselines registradas</strong>
              <span>Histórico das referências congeladas para a obra.</span>
            </div>
          </div>
          {baselines.length === 0 ? (
            <p className="pl-planejamento-vazio">Nenhuma baseline registrada.</p>
          ) : (
            <div className="pl-baseline-lista">
              {baselines.map(baseline => (
                <div key={baseline.id} className="pl-baseline-item">
                  <div><strong>{baseline.name}</strong><small>{baseline.status}</small></div>
                  <span>{new Date(baseline.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pl-planejamento-box">
        <div className="pl-planejamento-box-head">
          <div>
            <strong>Regra de governança</strong>
            <span>A baseline é um marco de controle; editar atividades depois não reescreve o histórico capturado.</span>
          </div>
        </div>
        <div className="pl-planejamento-cards">
          <div><span>EAP</span><strong>Preservada</strong><small>a estrutura aprovada continua sendo a fonte do escopo</small></div>
          <div><span>CPM</span><strong>Exigido</strong><small>resultado persistido e atualizado antes do congelamento</small></div>
          <div><span>Snapshot</span><strong>Gravado</strong><small>cada atividade vira um item da baseline</small></div>
          <div><span>Próxima etapa</span><strong>Gantt</strong><small>use a baseline como referência para acompanhamento</small></div>
        </div>
      </div>
    </section>
  );
}
