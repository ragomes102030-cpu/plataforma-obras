import { GitBranch, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type Props = { projetoId: number };

const TIPOS = ["FS", "SS", "FF", "SF"] as const;

const EXPLICACAO: Record<(typeof TIPOS)[number], string> = {
  FS: "Fim → Início: a sucessora começa depois que a predecessora termina.",
  SS: "Início → Início: a sucessora pode iniciar a partir do início da predecessora.",
  FF: "Fim → Fim: o término da sucessora acompanha o término da predecessora.",
  SF: "Início → Fim: o término da sucessora depende do início da predecessora.",
};

function nomeAtividade(
  activities: Array<{ id: number; wbsCode: string; name: string }>,
  id: number
) {
  const activity = activities.find(item => item.id === id);
  return activity ? `${activity.wbsCode} — ${activity.name}` : `#${id}`;
}

export function AbaDependencias({ projetoId }: Props) {
  const utils = trpc.useUtils();
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const [pred, setPred] = useState("");
  const [succ, setSucc] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("FS");
  const [lag, setLag] = useState("0");
  const [mensagem, setMensagem] = useState<string | null>(null);

  const criar = trpc.planning.createDependency.useMutation({
    onSuccess: async () => {
      setMensagem("Dependência adicionada. A rede ainda precisa ser recalculada no CPM.");
      await utils.planning.list.invalidate({ projectId: projetoId });
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
    onError: error => setMensagem(error.message),
  });

  const activities = plano.data?.activities ?? [];
  const dependencies = plano.data?.dependencies ?? [];
  const atividadesSemDuracao = activities.filter(item => Number(item.durationDays) < 1);

  useEffect(() => {
    if (!pred && activities[0]) setPred(String(activities[0].id));
    if (!succ && activities[1]) setSucc(String(activities[1].id));
  }, [activities, pred, succ]);

  const enviar = () => {
    const predecessorId = Number(pred);
    const successorId = Number(succ);
    const lagDias = Number(lag);
    if (!predecessorId || !successorId) return setMensagem("Selecione a predecessora e a sucessora.");
    if (predecessorId === successorId) return setMensagem("Uma atividade não pode depender dela mesma.");
    if (!Number.isInteger(lagDias)) return setMensagem("O lag deve ser um número inteiro de dias.");
    setMensagem(null);
    criar.mutate({ projectId: projetoId, predecessorId, successorId, type: tipo, lag: lagDias });
  };

  if (plano.isPending) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-loading">
          <RefreshCw size={14} className="pl-spin" /> Carregando rede de dependências…
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
          <div className="pl-planejamento-kicker"><GitBranch size={13} /> REDE LÓGICA</div>
          <h2>Dependências entre atividades</h2>
          <p>
            A rede explica a lógica de execução. Datas digitadas não substituem
            predecessoras e sucessoras. O CPM só pode calcular depois que a rede for validada.
          </p>
        </div>
        <div className="pl-planejamento-cpm" aria-label="Resumo da rede">
          {activities.length} atividades · {dependencies.length} dependências
        </div>
      </header>

      {mensagem && <div className="pl-planejamento-alerta">{mensagem}</div>}

      {activities.length < 2 ? (
        <div className="pl-planejamento-box">
          <strong>Dependências ainda não podem ser criadas.</strong>
          <p className="pl-planejamento-vazio">
            Primeiro crie pelo menos duas atividades a partir da EAP aprovada.
          </p>
        </div>
      ) : atividadesSemDuracao.length > 0 ? (
        <div className="pl-planejamento-box">
          <strong>Planejamento de duração incompleto.</strong>
          <p className="pl-planejamento-vazio">
            {atividadesSemDuracao.length} atividade(s) ainda não possuem duração válida.
            Informe início e duração na aba ATIVIDADES antes de montar a rede lógica.
          </p>
        </div>
      ) : (
        <div className="pl-planejamento-grid">
          <div className="pl-planejamento-box">
            <div className="pl-planejamento-box-head">
              <div>
                <strong><GitBranch size={13} /> Adicionar vínculo</strong>
                <span>Comece pelo vínculo mais seguro: FS (Fim → Início).</span>
              </div>
            </div>

            <div className="pl-dependencia-form">
              <label>Predecessora
                <select value={pred} onChange={event => setPred(event.target.value)}>
                  {activities.map(activity => (
                    <option key={activity.id} value={activity.id}>
                      {activity.wbsCode} — {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>Tipo
                <select value={tipo} onChange={event => setTipo(event.target.value as (typeof TIPOS)[number])}>
                  {TIPOS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Sucessora
                <select value={succ} onChange={event => setSucc(event.target.value)}>
                  {activities.map(activity => (
                    <option key={activity.id} value={activity.id}>
                      {activity.wbsCode} — {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>Lag (dias)
                <input value={lag} onChange={event => setLag(event.target.value)} inputMode="numeric" />
              </label>
              <button
                type="button"
                className="pl-planejamento-secondary"
                onClick={enviar}
                disabled={criar.isPending}
              >
                {criar.isPending ? "Salvando…" : "Adicionar dependência"}
              </button>
            </div>

            <div className="pl-dependencia-nota">
              <strong>{tipo}</strong> — {EXPLICACAO[tipo]}
            </div>
          </div>

          <div className="pl-planejamento-box">
            <div className="pl-planejamento-box-head">
              <div>
                <strong>Rede atual</strong>
                <span>{dependencies.length ? "Vínculos registrados na versão de trabalho." : "Nenhum vínculo registrado."}</span>
              </div>
            </div>

            {dependencies.length === 0 ? (
              <p className="pl-planejamento-vazio">
                A rede ainda está vazia. Isso é esperado antes da definição das relações de precedência.
              </p>
            ) : (
              <div className="pl-dependencia-lista">
                {dependencies.map(dependency => (
                  <div key={dependency.id} className="pl-dependencia-item">
                    <span>{nomeAtividade(activities, dependency.predecessorId)}</span>
                    <strong>{dependency.type}{dependency.lag ? ` ${dependency.lag > 0 ? "+" : ""}${dependency.lag}d` : ""}</strong>
                    <span>{nomeAtividade(activities, dependency.successorId)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pl-planejamento-box">
        <div className="pl-planejamento-box-head">
          <div>
            <strong>Critérios de validação da rede</strong>
            <span>O sistema não deve aceitar rede inconsistente.</span>
          </div>
        </div>
        <div className="pl-planejamento-cards">
          <div><span>Auto dependência</span><strong>Bloqueada</strong><small>uma atividade não pode apontar para si mesma</small></div>
          <div><span>Projetos cruzados</span><strong>Bloqueados</strong><small>as duas atividades devem pertencer à obra</small></div>
          <div><span>Versão</span><strong>Controlada</strong><small>atividades da mesma versão de trabalho</small></div>
          <div><span>Ciclos</span><strong>Bloqueados</strong><small>rede cíclica não pode chegar ao CPM</small></div>
        </div>
      </div>
    </section>
  );
}
