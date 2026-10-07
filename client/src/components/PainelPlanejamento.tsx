import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, CheckCircle2, Filter, ListPlus, Plus, RefreshCw, Search, Layers3 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = { projetoId: number };

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

type Filtro = "todos" | "pendentes" | "criadas";

export function PainelPlanejamento({ projetoId }: Props) {
  const utils = trpc.useUtils();
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );

  const [proposta, setProposta] = useState<ProposalItem[]>([]);
  const [duracoes, setDuracoes] = useState<Record<number, string>>({});
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const propostaAutoDisparada = useRef(false);

  const gerarProposta = trpc.planning.generateFromEap.useMutation({
    onSuccess: result => {
      setProposta(result.proposal as ProposalItem[]);
      setDuracoes({});
      setMensagem(
        result.pending
          ? `${result.pending} pacote(s) da EAP aguardando revisão e duração.`
          : result.message
      );
    },
    onError: error => setMensagem(error.message),
  });

  const criarAtividade = trpc.planning.criarAtividadeDaFolha.useMutation({
    onSuccess: async result => {
      const nodeId = criarAtividade.variables?.wbsNodeId;
      if (nodeId) setProposta(atual => atual.filter(item => item.eapNodeId !== nodeId));
      setMensagem("Atividade adicionada ao cronograma. Revise a lógica na etapa Dependências.");
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
    onError: error => setMensagem(error.message),
  });

  const atualizarAtividade = trpc.planning.atualizarAtividade.useMutation({
    onSuccess: async result => {
      setMensagem(result.cpmInvalidated ? "Atividade atualizada. O CPM ficou desatualizado e precisa ser recalculado antes da baseline." : "Atividade atualizada.");
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
    onError: error => setMensagem(error.message),
  });

  const activities = plano.data?.activities ?? [];

  const valorEdicao = (activity: any, campo: "duracao" | "quantidade" | "produtividade" | "unidade") => {
    const key = activity.id + "|" + campo;
    if (key in edicoes) return edicoes[key];
    if (campo === "duracao") return String(activity.durationDays ?? "");
    if (campo === "quantidade") return activity.plannedQuantity == null ? "" : String(activity.plannedQuantity);
    if (campo === "produtividade") return activity.productivity == null ? "" : String(activity.productivity);
    return activity.unit ?? "";
  };

  const salvarEdicao = (activityId: number, campo: "duracao" | "quantidade" | "produtividade" | "unidade") => {
    const key = activityId + "|" + campo;
    if (!(key in edicoes)) return;
    atualizarAtividade.mutate({ projectId: projetoId, atividadeId: activityId, campo, valor: edicoes[key] });
  };

  useEffect(() => {
    if (
      plano.isPending ||
      plano.isError ||
      propostaAutoDisparada.current ||
      proposta.length > 0 ||
      gerarProposta.isPending
    ) return;

    propostaAutoDisparada.current = true;
    gerarProposta.mutate({ projectId: projetoId });
  }, [
    activities.length,
    gerarProposta.isPending,
    gerarProposta.mutate,
    plano.isError,
    plano.isPending,
    proposta.length,
    projetoId,
  ]);

  const resumo = useMemo(() => {
    const total = activities.length + proposta.length;
    const prontas = activities.length;
    const pendentes = proposta.length;
    const decomposicoes = proposta.filter(item => item.requiresDecompositionReview).length;
    return { total, prontas, pendentes, decomposicoes };
  }, [activities.length, proposta]);

  const propostaFiltrada = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return proposta.filter(item => {
      const texto = `${item.wbsCode} ${item.name} ${item.phase}`.toLocaleLowerCase("pt-BR");
      return !termo || texto.includes(termo);
    });
  }, [busca, proposta]);

  const atividadesFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return activities.filter(activity => {
      const texto = `${activity.wbsCode} ${activity.name}`.toLocaleLowerCase("pt-BR");
      return !termo || texto.includes(termo);
    });
  }, [activities, busca]);

  const adicionarAtividade = (item: ProposalItem) => {
    const raw = duracoes[item.eapNodeId]?.trim() ?? "";
    const durationDays = raw ? Number(raw) : undefined;
    if (!durationDays || !Number.isInteger(durationDays) || durationDays < 1) {
      setMensagem(`Informe a duração em dias para ${item.wbsCode}.`);
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
      <section className="pl-atividades-page">
        <div className="pl-atividades-loading"><RefreshCw size={15} className="pl-spin" /> Carregando atividades…</div>
      </section>
    );
  }

  if (plano.isError) {
    return (
      <section className="pl-atividades-page">
        <div className="pl-atividades-alerta erro">{plano.error.message}</div>
      </section>
    );
  }

  const mostrarPropostas = filtro !== "criadas";
  const mostrarCriadas = filtro !== "pendentes";
  const temLinhasVisiveis =
    (mostrarPropostas && propostaFiltrada.length > 0) ||
    (mostrarCriadas && atividadesFiltradas.length > 0);

  return (
    <section className="pl-atividades-page">
      <header className="pl-atividades-header">
        <div className="pl-atividades-title">
          <div className="pl-atividades-kicker"><Activity size={13} /> CRONOGRAMA · ATIVIDADES</div>
          <h1>Atividades</h1>
          <p>Transforme os pacotes da EAP aprovada em unidades executáveis do cronograma.</p>
        </div>
        <div className="pl-atividades-header-actions">
          <button
            type="button"
            className="pl-atividades-btn secondary"
            onClick={() => {
              setMensagem(null);
              gerarProposta.mutate({ projectId: projetoId });
            }}
            disabled={gerarProposta.isPending}
          >
            <RefreshCw size={14} className={gerarProposta.isPending ? "pl-spin" : ""} />
            {gerarProposta.isPending ? "Lendo EAP…" : "Atualizar proposta"}
          </button>
        </div>
      </header>

      <div className="pl-atividades-flow">
        <span className="done"><CheckCircle2 size={13} /> EAP aprovada</span>
        <span>→</span>
        <strong>Atividades</strong>
        <span>→</span>
        <span>Dependências</span>
        <span>→</span>
        <span>CPM</span>
        <span>→</span>
        <span>Baseline</span>
      </div>

      <div className="pl-atividades-metrics">
        <div><span>Atividades criadas</span><strong>{resumo.prontas}</strong><small>unidades executáveis</small></div>
        <div className={resumo.pendentes ? "attention" : ""}><span>Aguardando revisão</span><strong>{resumo.pendentes}</strong><small>folhas elegíveis da EAP</small></div>
        <div><span>Decomposição</span><strong>{resumo.decomposicoes}</strong><small>pacotes que pedem análise</small></div>
        <div><span>Próxima etapa</span><strong>Dependências</strong><small>após definir a rede lógica</small></div>
      </div>

      <div className="pl-atividades-toolbar">
        <label className="pl-atividades-search">
          <Search size={15} />
          <input
            value={busca}
            onChange={event => setBusca(event.target.value)}
            placeholder="Pesquisar código, EAP ou atividade…"
            aria-label="Pesquisar atividades"
          />
        </label>
        <div className="pl-atividades-filtros">
          <Filter size={14} />
          {([
            ["todos", `Todos · ${resumo.total}`],
            ["pendentes", `Revisar · ${resumo.pendentes}`],
            ["criadas", `Criadas · ${resumo.prontas}`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filtro === id ? "ativo" : ""}
              onClick={() => setFiltro(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mensagem && <div className="pl-atividades-alerta">{mensagem}</div>}

      <div className="pl-atividades-table-wrap">
        <table className="pl-atividades-table">
          <thead>
            <tr>
              <th className="check-col"> </th>
              <th className="id-col">ID</th>
              <th className="wbs-col">EAP / WBS</th>
              <th className="name-col">Atividade</th>
              <th className="type-col">Tipo</th>
              <th className="dur-col">Duração</th>
              <th className="unit-col">Unidade</th>
              <th className="status-col">Estado</th>
              <th className="action-col">Qtd. / estado</th>
            </tr>
          </thead>
          <tbody>
            {mostrarCriadas && atividadesFiltradas.map((activity, index) => (
              <tr key={`activity-${activity.id}`} className={Number(activity.critical) === 1 ? "critical-row" : ""}>
                <td className="check-col"><input type="checkbox" aria-label={`Selecionar ${activity.name}`} /></td>
                <td className="id-col mono">{activity.id}</td>
                <td className="wbs-col mono">{activity.wbsCode}</td>
                <td className="name-col"><strong>{activity.name}</strong></td>
                <td className="type-col"><span className="pl-atividade-tag">Task</span></td>
                <td className="dur-col">
                  <input
                    className="pl-duracao-input"
                    type="number"
                    min={1}
                    step={1}
                    value={valorEdicao(activity, "duracao")}
                    onChange={event => setEdicoes(atual => ({ ...atual, [activity.id + "|duracao"]: event.target.value }))}
                    onBlur={() => salvarEdicao(activity.id, "duracao")}
                    aria-label={"Duração de " + activity.name}
                  />
                </td>
                <td className="unit-col">
                  <input
                    className="pl-duracao-input"
                    type="text"
                    value={valorEdicao(activity, "unidade")}
                    onChange={event => setEdicoes(atual => ({ ...atual, [activity.id + "|unidade"]: event.target.value }))}
                    onBlur={() => salvarEdicao(activity.id, "unidade")}
                    aria-label={"Unidade de " + activity.name}
                  />
                </td>
                <td className="status-col"><span className="pl-status-badge criada">Criada</span></td>
                <td className="action-col">
                  <input
                    className="pl-duracao-input"
                    type="number"
                    min={0}
                    step="0.001"
                    value={valorEdicao(activity, "produtividade")}
                    onChange={event => setEdicoes(atual => ({ ...atual, [activity.id + "|produtividade"]: event.target.value }))}
                    onBlur={() => salvarEdicao(activity.id, "produtividade")}
                    aria-label={"Produtividade de " + activity.name}
                    placeholder="prod./dia"
                  />
                  <input
                    className="pl-duracao-input"
                    type="number"
                    min={0}
                    step="0.001"
                    value={valorEdicao(activity, "quantidade")}
                    onChange={event => setEdicoes(atual => ({ ...atual, [activity.id + "|quantidade"]: event.target.value }))}
                    onBlur={() => salvarEdicao(activity.id, "quantidade")}
                    aria-label={"Quantidade de " + activity.name}
                  />
                  <span className="pl-row-note">{Number(activity.critical) === 1 ? "Crítica" : "Cronograma"}</span>
                </td>
              </tr>
            ))}

            {mostrarPropostas && propostaFiltrada.map(item => (
              <tr key={`proposal-${item.eapNodeId}`} className="proposal-row">
                <td className="check-col"><input type="checkbox" aria-label={`Selecionar ${item.name}`} disabled /></td>
                <td className="id-col mono">novo</td>
                <td className="wbs-col mono">{item.wbsCode}</td>
                <td className="name-col">
                  <div className="pl-proposta-nome"><strong>{item.name}</strong><small>{item.phase}</small></div>
                  {item.requiresDecompositionReview && (
                    <span className="pl-decompor-flag"><Layers3 size={11} /> revisar decomposição</span>
                  )}
                </td>
                <td className="type-col"><span className="pl-atividade-tag proposta">Proposta</span></td>
                <td className="dur-col">
                  <input
                    className="pl-duracao-input"
                    type="number"
                    min={1}
                    step={1}
                    value={duracoes[item.eapNodeId] ?? ""}
                    onChange={event => setDuracoes(atual => ({ ...atual, [item.eapNodeId]: event.target.value }))}
                    placeholder="dias"
                    aria-label={`Duração de ${item.name}`}
                  />
                </td>
                <td className="unit-col">{item.unit ?? "—"}</td>
                <td className="status-col"><span className="pl-status-badge revisar">Revisar</span></td>
                <td className="action-col">
                  <button
                    type="button"
                    className="pl-row-action"
                    onClick={() => adicionarAtividade(item)}
                    disabled={criarAtividade.isPending}
                    title="Criar atividade com a duração informada"
                  >
                    <Plus size={13} /> Adicionar
                  </button>
                </td>
              </tr>
            ))}

            {!temLinhasVisiveis && (
              <tr>
                <td colSpan={9} className="pl-atividades-empty">
                  <strong>{busca ? "Nenhum resultado encontrado." : filtro === "pendentes" ? "Nenhuma atividade aguardando revisão." : "Nenhuma atividade criada ainda."}</strong>
                  <span>{busca ? "Ajuste a pesquisa para localizar outro item." : "As atividades aparecem aqui quando forem adicionadas a partir da EAP aprovada."}</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="pl-atividades-footer">
        <span><ListPlus size={13} /> A EAP é a fonte do escopo. A atividade é a unidade que entra no cronograma.</span>
        <span>{activities.length} criadas · {proposta.length} pendentes</span>
      </footer>
    </section>
  );
}
