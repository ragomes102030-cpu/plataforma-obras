import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Bot, Check, CheckCircle2, ClipboardCheck, DollarSign, FileCheck2, FileText, Info, Layers3, LockKeyhole, Maximize2, Minimize2, PackageCheck, Pencil, Plus, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * A aba EAP: a estrutura analítica da obra.
 *
 * POR QUE COMEÇA PELA EAP E NÃO PELO CRONOGRAMA
 *
 * Porque a EAP organiza o escopo da obra antes de prazo e orçamento. O catálogo
 * pode auxiliar com códigos, unidades e preços, mas não define sozinho o que
 * pertence ao escopo contratado. O cronograma depende de duração, e duração é
 * informada por quem planeja.
 *
 * POR QUE A ÁRVORE VEM DO BANCO E NÃO É MONTADA AQUI
 *
 * Os nós já estão em `wbs_nodes`, com pai, nível, código oficial e unidade. A
 * tela monta a hierarquia a partir de `parentId` e não cria, não renomeia e
 * não reordena nada: se a tela calculasse o nível a partir do código, existiria
 * uma segunda definição de hierarquia, e elas iam divergir no primeiro serviço
 * com três níveis de prefixo.
 */

type No = {
  id: number;
  code: string;
  name: string;
  level: number;
  nodeType: string | null;
  parentId: number | null;
  externalId: string | null;
  unit: string | null;
  plannedQuantity: string | null;
  description: string | null;
  inclusions: string | null;
  exclusions: string | null;
  location: string | null;
  responsible: string | null;
  acceptanceCriteria: string | null;
  decompositionBasis: string | null;
  scopeStatus: string;
  sortOrder: number;
};

export function AbaEap({ projetoId }: { projetoId: number }) {
  const wbs = trpc.projects.wbs.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  // Os grupos de primeiro nivel começam abertos: uma EAP com tudo fechado
  // exige um clique por grupo antes de se ver qualquer serviço.
  const [aberto, setAberto] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [editor, setEditor] = useState<EditorEap | null>(null);
  const [controleAberto, setControleAberto] = useState(true);
  const [densidade, setDensidade] = useState<"compacta" | "normal" | "confortavel">("compacta");
  const [validacaoAberta, setValidacaoAberta] = useState(false);
  const [modoRevisao, setModoRevisao] = useState(false);
  const [filtroEap, setFiltroEap] = useState<"todos" | "grupos" | "folhas" | "pendencias">("todos");

  const utils = trpc.useUtils();
  const dicionarioPadrao = trpc.eap.eapDictionaryStandard.useQuery({ projectId: projetoId }, { enabled: projetoId > 0 });
  const decidirDicionario = trpc.eap.decideEapDictionaryStandard.useMutation({
    onSuccess: async () => {
      await dicionarioPadrao.refetch();
      await utils.eap.validateWbsStructure.invalidate({ projectId: projetoId });
      await revisaoArquimedes.refetch();
    },
  });
  const revisaoArquimedes = trpc.eap.eapArquimedesReview.useQuery({ projectId: projetoId }, { enabled: projetoId > 0 });
  const recarregar = () => utils.projects.wbs.invalidate({ projectId: projetoId });

  const criarNo = trpc.projects.createWbsNode.useMutation({
    onSuccess: async () => { setEditor(null); await recarregar(); await utils.eap.validateWbsStructure.invalidate({ projectId: projetoId }); },
  });

  const editarNo = trpc.projects.updateWbsNode.useMutation({
    onSuccess: async () => { setEditor(null); await recarregar(); await utils.eap.validateWbsStructure.invalidate({ projectId: projetoId }); },
  });

  /**
   * Traz uma folha da EAP para o cronograma.
   *
   * A folha é o lugar natural de puxar a linha: é ela que tem o código oficial
   * e a unidade, e é pelo código que o orçamento casa o preço. A atividade
   * nasce com duração ZERO — prazo é informado por quem planeja, e a grade
   * mostra "Não iniciado" até isso acontecer.
   */
  const trazer = trpc.planning.criarAtividadeDaFolha.useMutation({
    onSuccess: async () => {
      await recarregar();
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
  });

  // Quais folhas já viraram atividade. Vem do cronograma, e sem isso o botão
  // ficaria ativo em linha que já está lá e o erro seria "já está no
  // cronograma" — uma viagem de ida e volta para aprender o que a tela podia
  // ter dito.
  const grade = trpc.planning.grade.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const coordenador = trpc.agent.snapshot.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const versoes = trpc.agent.agentPlanVersions.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const aprovarEap = trpc.agent.recordDecision.useMutation({
    onSuccess: async () => {
      await coordenador.refetch();
      await versoes.refetch();
      await utils.eap.validateWbsStructure.invalidate({ projectId: projetoId });
    },
  });
  const enviarEapParaRevisao = trpc.eap.enviarEapParaRevisao.useMutation({
    onSuccess: async () => {
      await coordenador.refetch();
      await versoes.refetch();
      await utils.eap.validateWbsStructure.invalidate({ projectId: projetoId });
    },
  });
  const validacao = trpc.eap.validateWbsStructure.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const codigosNoCronograma = new Set(
    (grade.data?.linhas ?? []).map((l: { codigo: string }) => l.codigo)
  );
  const jaNoCronograma = (codigo: string) => codigosNoCronograma.has(codigo);
  const nos = (wbs.data ?? []) as No[];

  const idsComFilhos = new Set(nos.filter(n => n.parentId !== null).map(n => n.parentId as number));
  const folhasEap = nos.filter(n => !idsComFilhos.has(n.id));
  const pacotesTrabalho = nos.filter(n => n.nodeType === "pacote" && !idsComFilhos.has(n.id));
  const requiredDictionaryFields = (dicionarioPadrao.data?.status === "approved" ? dicionarioPadrao.data.requiredFields : []) as string[];
  const dictionaryValue = (node: No, field: string) => {
    const value = node[field as keyof No];
    return value !== null && value !== undefined && String(value).trim() !== "";
  };
  const folhasSemDicionario = requiredDictionaryFields.length
    ? folhasEap.filter(n => requiredDictionaryFields.some(field => !dictionaryValue(n, field)))
    : [];
  const dicionarioPendenteDecisao = dicionarioPadrao.data?.status !== "approved";
  const folhasSemQuantidade = dicionarioPendenteDecisao ? [] : folhasEap.filter(n => !n.unit || n.plannedQuantity == null);
  // Quantitativos não bloqueiam a baseline da EAP. Eles pertencem à etapa
  // seguinte: levantamento quantitativo. A EAP só precisa ter estrutura e
  // dicionário de escopo suficientemente definidos para aprovação.
  const eapProntaParaAprovacao = Boolean(validacao.data?.valid) &&
    !dicionarioPendenteDecisao &&
    folhasSemDicionario.length === 0 &&
    (coordenador.data?.blockerCount ?? 0) === 0;
  const podeAprovarEap = coordenador.data?.stage === "EAP_REVISAO" && eapProntaParaAprovacao && !aprovarEap.isPending;

  /**
   * Refazer a EAP do zero.
   *
   * Existe por causa de um estado sem saída que o botão "Gerar" produzia antes
   * da transação: se uma gravação falhasse no meio, os nós ficavam gravados, a
   * guarda de idempotência respondia "a obra já tem estrutura" para sempre, e
   * o único botão que geraria a EAP era justamente o que recusava. Não havia
   * rota, botão nem script que tirasse a obra de lá.
   *
   * Isto apaga o que a geração anterior gravou e refaz, na mesma transação.
   * Apaga a árvore, as atividades e a versão de orçamento que o seeder criou —
   * e nada mais: uma versão de orçamento criada à mão não é tocada.
   */
  const refazer = trpc.eap.generateEapFromCatalog.useMutation({
    onSuccess: async () => {
      await recarregar();
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
  });

  // Erro visível das duas ações. Sem isto: clique, nada acontece, silêncio.
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (trazer.isError) setErro(trazer.error.message);
  }, [trazer.isError, trazer.error]);
  useEffect(() => {
    if (refazer.isError) setErro(refazer.error.message);
  }, [refazer.isError, refazer.error]);
  useEffect(() => {
    if (trazer.isSuccess || refazer.isSuccess) setErro(null);
  }, [trazer.isSuccess, refazer.isSuccess]);

  // Os níveis estruturais começam abertos para que a raiz e os sistemas da obra
  // fiquem visíveis sem esconder a árvore atrás de vários cliques.
  const jaViu = useRef<No[] | null>(null);
  useEffect(() => {
    if (jaViu.current === nos) return;
    jaViu.current = nos;
    if (nos.length === 0) return;
    setAberto(antigo => {
      if (antigo.size > 0) return antigo;
      const primeiroNivel = nos.filter(n => n.parentId === null).map(n => n.id);
      return primeiroNivel.length ? new Set(primeiroNivel) : antigo;
    });
  }, [nos]);

  const arvore = useMemo(() => montarArvore(nos), [nos]);
  const filtrada = useMemo(
    () => (busca.trim() ? filtrarArvore(arvore, busca.trim().toLowerCase()) : arvore),
    [arvore, busca]
  );
  const filtradaPorTipo = useMemo(() => {
    if (filtroEap === "todos") return filtrada;
    const match = (ramo: Ramo): Ramo | null => {
      const filhos = ramo.filhos.map(match).filter((item): item is Ramo => Boolean(item));
      const eGrupo = ramo.no.nodeType === "grupo";
      const eFolha = !ramo.filhos.length || ramo.no.nodeType === "entrega" || ramo.no.nodeType === "pacote";
      const pendente = requiredDictionaryFields.length > 0 && requiredDictionaryFields.some(field => !dictionaryValue(ramo.no, field));
      const bate = filtroEap === "grupos" ? eGrupo : filtroEap === "folhas" ? eFolha : pendente;
      if (bate || filhos.length) return { no: ramo.no, filhos };
      return null;
    };
    return filtrada.map(match).filter((item): item is Ramo => Boolean(item));
  }, [filtrada, filtroEap, requiredDictionaryFields.length]);


  const expandirTudo = () => setAberto(new Set(nos.filter(n => n.nodeType !== "entrega").map(n => n.id)));
  const recolherTudo = () => setAberto(new Set());
  const propostaArquimedes = revisaoArquimedes.data?.proposal;
  const ultimaRevisaoArquimedes = revisaoArquimedes.data?.createdAt ?? null;
  const modoUltimaRevisaoArquimedes = revisaoArquimedes.data?.mode ?? "analisar";
  const resumoCorrecao = propostaArquimedes?.resolutionSummary ?? [];
  const evidenciasPesquisa = propostaArquimedes?.researchEvidence ?? [];
  const planoResolucao = propostaArquimedes?.resolutionPlan ?? [];
  const cicloRevisao = revisaoArquimedes.data?.resolutionCycle as {
    before?: { summary?: { errors?: number; warnings?: number }; issues?: Array<{ code: string; message: string; entityRef?: string }> };
    after?: { summary?: { errors?: number; warnings?: number }; issues?: Array<{ code: string; message: string; entityRef?: string }> };
    resolved?: Array<{ code: string; message: string; entityRef?: string }>;
    remaining?: Array<{ code: string; message: string; entityRef?: string }>;
    newlyDetected?: Array<{ code: string; message: string; entityRef?: string }>;
    counts?: {
      beforeErrors?: number;
      afterErrors?: number;
      resolved?: number;
      remaining?: number;
      newlyDetected?: number;
    };
    appliedAt?: string;
  } | null;
  const cicloRevisaoAplicado = Boolean(cicloRevisao?.appliedAt);
  const bloqueiosAposCorrecao = cicloRevisao?.counts?.afterErrors ?? cicloRevisao?.after?.summary?.errors ?? validacao.data?.summary.errors ?? 0;

  const issuesUnicos = useMemo(() => {
    const issues = validacao.data?.issues ?? [];
    return Array.from(new Map(issues.map(issue => [issue.code + "|" + (issue.entityRef ?? "") + "|" + issue.message.trim(), issue])).values());
  }, [validacao.data?.issues]);

  const resumoApontamentos = useMemo(() => {
    const issues = issuesUnicos;
    const grupos = [
      {
        label: "Estrutura",
        codes: new Set([
          "eap_root_count_invalid",
          "eap_level_code_mismatch",
          "eap_child_of_delivery",
          "eap_delivery_has_children",
          "eap_work_package_has_children",
          "duplicate_eap_id",
          "duplicate_eap_code",
          "empty_eap_name",
          "orphan_eap_node",
          "eap_parent_code_mismatch",
          "eap_cycle",
        ]),
      },
      {
        label: "Dicionário",
        codes: new Set(["eap_leaf_not_ready"]),
      },
      {
        label: "Decomposição",
        codes: new Set([
          "eap_decomposition_basis_missing",
          "eap_group_without_decomposition",
          "eap_mixed_decomposition_basis",
        ]),
      },
      {
        label: "Escopo",
        codes: new Set([
          "possible_scope_overlap",
          "eap_scope_overlap_evidence",
          "eap_child_outside_parent_scope",
          "eap_scope_coverage_not_evidenced",
          "eap_child_scope_not_evidenced",
        ]),
      },
      {
        label: "Quantitativos",
        codes: new Set([
          "negative_eap_quantity",
          "eap_quantity_rollup_mismatch",
        ]),
      },
      {
        label: "Orçamento",
        codes: new Set([
          "wbs_leaf_without_cost",
          "wbs_double_counted_cost",
          "wbs_group_without_any_cost",
        ]),
      },
    ] as Array<{ label: string; codes: Set<string> }>;

    const conhecidos = new Set(grupos.flatMap(grupo => Array.from(grupo.codes)));
    const resultado = grupos
      .map(grupo => ({
        label: grupo.label,
        count: issues.filter(issue => grupo.codes.has(issue.code)).length,
      }))
      .filter(grupo => grupo.count > 0);

    const outros = issues.filter(issue => !conhecidos.has(issue.code)).length;
    if (outros > 0) resultado.push({ label: "Outros", count: outros });
    return resultado;
  }, [issuesUnicos]);

  const totalApontamentos = issuesUnicos.filter(issue => issue.severity === "warning").length;
  const pendenciasOrcamento = issuesUnicos.filter(issue => issue.code === "wbs_leaf_without_cost" || issue.code === "wbs_double_counted_cost" || issue.code === "wbs_group_without_any_cost").length;
  const alertasEap = issuesUnicos.filter(issue => issue.severity === "warning" && !issue.code.startsWith("wbs_")).length;


  const aplicarPropostaEap = trpc.eap.aplicarPropostaEap.useMutation({
    onSuccess: async () => {
      await recarregar();
      await utils.eap.validateWbsStructure.invalidate({ projectId: projetoId });
      await coordenador.refetch();
      await versoes.refetch();
      await revisaoArquimedes.refetch();
    },
  });



  if (wbs.isPending) {
    return <div className="xl-vazia-folha"><h3>Carregando a estrutura…</h3></div>;
  }

  if (nos.length === 0) {
    return <EapVazia projetoId={projetoId} />;
  }

  const total = nos.length;
  const grupos = nos.filter(n => n.nodeType === "grupo").length;
  const folhas = folhasEap.length;

  return (
    <div className={`eap eap-densidade-${densidade}`}>
      <header className="eap-workspace-header">
        <div className="eap-workspace-title">
          <div className="eap-workspace-kicker"><Layers3 size={13} /> PLANEJAMENTO · EAP</div>
          <h1>Estrutura Analítica da Obra</h1>
          <p>Defina e revise o escopo antes de transformar pacotes de trabalho em atividades do cronograma.</p>
        </div>
        <div className="eap-workspace-actions">
          <button type="button" className="eap-workspace-btn secondary" onClick={() => setModoRevisao(v => !v)}><Pencil size={13} /> {modoRevisao ? "Encerrar revisão" : "Editar EAP"}</button>
          <button type="button" className="eap-workspace-btn secondary" onClick={expandirTudo}><Maximize2 size={13} /> Expandir</button>
          <button type="button" className="eap-workspace-btn secondary" onClick={recolherTudo}><Minimize2 size={13} /> Recolher</button>
        </div>
      </header>
      <div className="eap-workspace-flow"><span className="done"><CheckCircle2 size={13} /> Escopo</span><span>→</span><strong>EAP</strong><span>→</span><span>Quantitativos</span><span>→</span><span>Orçamento</span><span>→</span><span>Atividades</span></div>
      <div className="eap-workspace-metrics">
        <div><span>Nós da EAP</span><strong>{total}</strong><small>estrutura completa</small></div>
        <div><span>Pacotes de trabalho</span><strong>{pacotesTrabalho.length}</strong><small>folhas controláveis</small></div>
        <div className={folhasSemDicionario.length ? "attention" : ""}><span>Dicionário</span><strong>{dicionarioPendenteDecisao ? "—" : `${folhasEap.length - folhasSemDicionario.length}/${folhasEap.length}`}</strong><small>{dicionarioPendenteDecisao ? "padrão aguardando decisão" : "folhas conformes"}</small></div>
        <div className={validacao.data?.valid ? "ok" : "attention"}><span>Validação</span><strong>{validacao.data?.summary.errors ?? "—"}</strong><small>{validacao.data?.valid ? "sem bloqueios estruturais" : "bloqueios estruturais"}</small></div>
      </div>
      <div className="eap-workspace-toolbar">
        <label className="eap-workspace-search"><Search size={15} /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar código, nome, escopo ou referência…" aria-label="Pesquisar na EAP" /></label>
        <div className="eap-workspace-filters"><span><Layers3 size={13} /> FILTRAR</span>{([["todos",`Todos · ${total}`],["grupos",`Grupos · ${grupos}`],["folhas",`Folhas · ${folhas}`],["pendencias",`Pendências · ${folhasSemDicionario.length}`]] as const).map(([id,label])=><button key={id} type="button" className={filtroEap===id?"ativo":""} onClick={()=>setFiltroEap(id)}>{label}</button>)}</div>
        <button type="button" className="eap-workspace-btn principal" onClick={()=>setEditor({mode:"create",parentId:null})}><Plus size={14}/> Adicionar</button>
      </div>
      {erro && <div className="eap-workspace-alert erro" role="alert">{erro}<button type="button" onClick={()=>setErro(null)}>fechar</button></div>}
      <div className={`eap-workspace-validation ${validacao.data?.valid ? "ok" : "attention"}`}>
        <div><strong>{validacao.data?.valid ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} Validação da EAP</strong><span>{validacao.isPending?"Analisando estrutura…":validacao.data?`${validacao.data.summary.nodes} nós · ${validacao.data.summary.leaves} folhas · ${validacao.data.summary.errors} bloqueios · ${alertasEap} apontamentos`:"Validação indisponível"}</span></div>
        <div className="eap-workspace-validation-actions">{!!validacao.data?.issues.length&&<button type="button" onClick={()=>setValidacaoAberta(v=>!v)}>{validacaoAberta?"Ocultar apontamentos":`Ver ${validacao.data.issues.length} apontamentos`}</button>}<span className="eap-workspace-agent"><Bot size={12}/> Arquimedes coordena a análise</span></div>
      </div>
      {validacaoAberta&&!!validacao.data?.issues.length&&<div className="eap-workspace-issues">{validacao.data.issues.slice(0,12).map((issue,index)=><div key={`${issue.code}-${issue.entityRef??"obra"}-${index}`}><span>{issue.severity==="error"?"BLOQUEIO":"ATENÇÃO"}</span><p>{issue.message}</p></div>)}{validacao.data.issues.length>12&&<small>+ {validacao.data.issues.length-12} apontamentos adicionais.</small>}</div>}
      {coordenador.data?.stage==="EAP_PROPOSTA"&&<div className="eap-workspace-stage"><div><strong>Proposta pronta para revisão</strong><span>A EAP foi estruturada. O próximo passo é a revisão técnica antes da aprovação.</span></div><button type="button" className="eap-workspace-btn principal" disabled={!coordenador.data?.canAdvance||enviarEapParaRevisao.isPending} onClick={()=>enviarEapParaRevisao.mutate({projectId:projetoId})}>{enviarEapParaRevisao.isPending?"Enviando…":"Enviar para revisão"}</button></div>}
      {coordenador.data?.stage==="EAP_REVISAO"&&<div className="eap-workspace-stage review"><div><strong>EAP em revisão técnica</strong><span>Edite a estrutura e use o Arquimedes pelo chat para solicitar análises especializadas. A aprovação só ocorre quando os gates forem atendidos.</span></div>{propostaArquimedes?<span className="eap-stage-status"><CheckCircle2 size={13}/> Análise registrada</span>:<span className="eap-stage-status"><Info size={13}/> Aguardando análise coordenada</span>}</div>}
      {propostaArquimedes&&<details className="eap-workspace-details"><summary><Bot size={14}/> Revisão técnica do Arquimedes <span>{propostaArquimedes.nodes.length} ações · {propostaArquimedes.missingInformation.length} pendências</span></summary><div className="eap-workspace-details-body"><div className="eap-workspace-review-kpis"><div><span>Ações propostas</span><strong>{propostaArquimedes.nodes.length}</strong></div><div><span>Decisões pendentes</span><strong>{propostaArquimedes.missingInformation.length}</strong></div><div><span>Bloqueios após correção</span><strong>{bloqueiosAposCorrecao}</strong></div></div>{!!resumoCorrecao.length&&<div className="eap-workspace-review-list">{resumoCorrecao.slice(0,8).map((item,index)=><div key={index}><span>{String(index+1).padStart(2,"0")}</span><p>{item}</p></div>)}</div>}{propostaArquimedes.missingInformation.length>0&&<div className="eap-workspace-pending"><strong>Decisões do engenheiro</strong><span>{propostaArquimedes.missingInformation.join(" · ")}</span></div>}{!cicloRevisaoAplicado&&propostaArquimedes.validation?.valid!==false&&propostaArquimedes.nodes.every(item=>item.operation==="create"||item.operation==="update")&&<button type="button" className="eap-workspace-btn principal" disabled={aplicarPropostaEap.isPending} onClick={()=>{if(!window.confirm("Aplicar a proposta do Arquimedes como rascunho?\n\nA EAP continuará editável e não será aprovada nem congelada."))return;aplicarPropostaEap.mutate({projectId:projetoId,confirm:true,proposal:propostaArquimedes});}}>{aplicarPropostaEap.isPending?"Aplicando rascunho…":"Aplicar proposta como rascunho"}</button>}</div></details>}
      <div className="eap-workspace-grid">
        <div className="eap-workspace-grid-head"><span className="rownum">#</span><span className="tree-col"></span><span>EAP</span><span>ESCOPO / ENTREGÁVEL</span><span>TIPO</span><span>RESPONSÁVEL</span><span>LOCAL</span><span>STATUS</span></div>
        <div className="eap-workspace-grid-body" role="tree" aria-label="Estrutura analítica da obra">
          {filtradaPorTipo.map(no=><NoDaArvore key={no.no.id} ramo={no} abertos={busca.trim()||filtroEap!=="todos"?new Set(nos.map(n=>n.id)):aberto} onAlternar={id=>setAberto(antigo=>{const novo=new Set(antigo);if(novo.has(id))novo.delete(id);else novo.add(id);return novo;})} aoTrazer={id=>trazer.mutate({projectId:projetoId,wbsNodeId:id})} aoAdicionar={id=>setEditor({mode:"create",parentId:id})} aoEditar={id=>setEditor({mode:"edit",nodeId:id})} modoRevisao={modoRevisao} jaNoCronograma={jaNoCronograma} profundidade={0}/>)}
          {filtradaPorTipo.length===0&&<div className="eap-workspace-empty"><strong>Nenhum item encontrado.</strong><span>Ajuste a pesquisa ou o filtro para localizar outra parte da EAP.</span></div>}
        </div>
      </div>
      {editor&&<EditorEapPanel key={editor.mode==="edit"?`edit-${editor.nodeId}`:`create-${editor.parentId??"root"}`} editor={editor} nos={nos} busy={criarNo.isPending||editarNo.isPending} error={criarNo.isError?criarNo.error.message:editarNo.isError?editarNo.error.message:null} onCancel={()=>setEditor(null)} onCreate={dados=>criarNo.mutate({projectId:projetoId,...dados})} onUpdate={dados=>{if(editor.mode!=="edit")return;const no=nos.find(n=>n.id===editor.nodeId);if(!no)return;editarNo.mutate({projectId:projetoId,nodeId:no.id,code:no.code,...dados});}}/>}
      <details className="eap-workspace-control"><summary><ClipboardCheck size={14}/> Governança da EAP <span>{dicionarioPendenteDecisao?"padrão aguardando decisão":folhasSemDicionario.length?`${folhasSemDicionario.length} folhas fora do padrão`:"dicionário conforme"}</span></summary><div className="eap-workspace-control-body"><div className="eap-workspace-control-grid"><div><span>Pacotes de trabalho</span><strong>{pacotesTrabalho.length}</strong><small>folhas terminais controláveis</small></div><div><span>Quantitativos</span><strong>{folhasSemQuantidade.length||"—"}</strong><small>{folhasSemQuantidade.length?"aguardando unidade/quantidade":"etapa própria"}</small></div><div><span>Critérios de parada</span><strong>{validacao.data?.valid?"OK":"REVISAR"}</strong><small>prontidão estrutural</small></div><div><span>Baseline</span><strong>{versoes.data?.[0]?.status==="approved"?"APROVADA":"EM REVISÃO"}</strong><small>{versoes.data?.[0]?`v${versoes.data[0].versionNumber}`:"ainda não criada"}</small></div></div>{dicionarioPadrao.data?.status!=="approved"&&<div className="eap-workspace-dictionary"><div><strong>Padrão de dicionário</strong><span>Defina quais campos serão obrigatórios nesta obra.</span></div><button type="button" className="eap-workspace-btn principal" disabled={decidirDicionario.isPending} onClick={()=>decidirDicionario.mutate({projectId:projetoId,decision:"approved",requiredFields:["description","inclusions","exclusions","acceptanceCriteria","responsible","scopeStatus","decompositionBasis"],conditionalFields:["location","unit","plannedQuantity"],summary:"Padrão proposto pelo Arquimedes aprovado pelo engenheiro para esta obra."})}>Aprovar padrão</button></div>}<div className="eap-workspace-baseline"><div><LockKeyhole size={14}/><div><strong>Baseline da EAP</strong><span>{versoes.data?.[0]?`v${versoes.data[0].versionNumber} · ${versoes.data[0].status}${versoes.data[0].approvedAt?` · ${new Date(versoes.data[0].approvedAt).toLocaleString("pt-BR")}`:""}`:"Ainda não existe versão do plano."}</span></div></div>{versoes.data?.[0]?.status==="approved"?<span className="eap-stage-status"><CheckCircle2 size={13}/> EAP aprovada · seguir para Atividades</span>:<button type="button" className="eap-workspace-btn principal" disabled={!podeAprovarEap} onClick={()=>{if(!podeAprovarEap)return;if(!window.confirm("Aprovar a EAP e criar a baseline?\n\nA versão atual será congelada para rastrear a estrutura aprovada."))return;aprovarEap.mutate({projectId:projetoId,stage:"EAP_REVISAO",decision:"approved",nextStage:"ATIVIDADES_PROPOSTA",scope:{kind:"eap",nodeCount:nos.length,leafCount:folhasEap.length,workPackageCount:pacotesTrabalho.length},summary:`EAP aprovada: ${nos.length} nós, ${folhasEap.length} folhas e ${pacotesTrabalho.length} pacotes de trabalho.`});}}>{aprovarEap.isPending?"Concluindo…":"Aprovar EAP / criar baseline"}</button>}</div></div></details>
      <div className="eap-workspace-footer"><span><Layers3 size={13}/> EAP = fonte oficial do escopo · atividade = unidade executável do cronograma</span><span>{total} nós · {folhas} folhas · profundidade {Math.max(...nos.map(n=>n.level),1)}</span></div>
    </div>
  );


type Ramo = { no: No; filhos: Ramo[] };
type EditorEap =
  | { mode: "create"; parentId: number | null }
  | { mode: "edit"; nodeId: number };

type EapBasis =
  | "project"
  | "deliverable"
  | "system"
  | "discipline"
  | "location"
  | "phase"
  | "component"
  | "other";

type DadosEditorEap = {
  name: string;
  nodeType: "grupo" | "pacote" | "entrega";
  decompositionBasis?: EapBasis;
  unit?: string;
  plannedQuantity?: number;
  description?: string;
  inclusions?: string;
  exclusions?: string;
  location?: string;
  responsible?: string;
  acceptanceCriteria?: string;
};

/** Monta a hierarquia a partir de `parentId`. Sem recursão sobre o código. */
function montarArvore(nos: No[]): Ramo[] {
  const porId = new Map<number, No>();
  for (const n of nos) porId.set(n.id, n);

  const filhosDe = new Map<number | null, No[]>();
  for (const n of nos) {
    const chave = n.parentId;
    const lista = filhosDe.get(chave) ?? [];
    lista.push(n);
    filhosDe.set(chave, lista);
  }
  for (const lista of filhosDe.values()) {
    lista.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "pt-BR"));
  }

  const paraRamo = (no: No): Ramo => ({
    no,
    filhos: (filhosDe.get(no.id) ?? []).map(paraRamo),
  });

  return (filhosDe.get(null) ?? []).map(paraRamo);
}

/**
 * Filtro que mantém o ancestral de qualquer nó que casou.
 *
 * Filtrar a lista plana esconderia o grupo de uma folha que o usuário procurou:
 * ele acharia "Concreto armado" e não veria a qual capítulo ele pertence. Aqui
 * o caminho inteiro vem junto.
 */
function filtrarArvore(ramos: Ramo[], termo: string): Ramo[] {
  const out: Ramo[] = [];
  for (const ramo of ramos) {
    const filhos = filtrarArvore(ramo.filhos, termo);
    const proprio = ramo.no.name.toLowerCase().includes(termo) ||
      ramo.no.code.toLowerCase().includes(termo) ||
      (ramo.no.externalId ?? "").toLowerCase().includes(termo);
    if (proprio || filhos.length) out.push({ no: ramo.no, filhos });
  }
  return out;
}

/**
 * Um nó e seus filhos.
 *
 * O grupo começa aberto: a EAP é gerada em duas camadas (grupo → folha) e
 * fechar tudo por padrão esconde a obra inteira atrás de um clique. O estado de
 * aberto é do pai (Home), não deste componente, para que a busca possa abrir o
 * caminho inteiro de uma vez.
 */
function NoDaArvore({
  ramo,
  abertos,
  onAlternar,
  aoTrazer,
  aoAdicionar,
  aoEditar,
  modoRevisao,
  jaNoCronograma,
  profundidade,
}: {
  ramo: Ramo;
  abertos: Set<number>;
  onAlternar: (id: number) => void;
  aoTrazer: (id: number) => void;
  aoAdicionar: (id: number) => void;
  aoEditar: (id: number) => void;
  modoRevisao: boolean;
  jaNoCronograma: (codigo: string) => boolean;
  profundidade: number;
}) {
  const { no, filhos } = ramo;
  const temFilhos = filhos.length > 0;
  const aberto = abertos.has(no.id);

  return (
    <div role="treeitem" aria-expanded={temFilhos ? aberto : undefined}>
      <div
        className={`eap-linha eap-nivel-${no.level}${no.nodeType === "entrega" ? " eap-folha" : " eap-grupo"}`}
        title="Duplo clique para abrir a ficha do escopo"
        onDoubleClick={() => aoEditar(no.id)}
      >
        <span className="eap-rownum" aria-hidden="true">{no.code}</span>
        <span className="eap-indent" style={{ paddingLeft: profundidade * 18 }}>
          {temFilhos ? (
            <button
              type="button"
              className={`eap-seta${aberto ? " aberta" : ""}`}
              onClick={() => onAlternar(no.id)}
              aria-label={aberto ? `Fechar ${no.name}` : `Abrir ${no.name}`}
            />
          ) : (
            <span className="eap-seta eap-seta-vazia" aria-hidden="true" />
          )}
        </span>
        <span className="eap-codigo">{no.code}</span>
        <span
          className="eap-nome"
          title={`${no.name} · Duplo clique para abrir a ficha do escopo`}
        >
          {no.name}
        </span>
        <span className="eap-tipo">{no.nodeType === "grupo" ? "FASE / GRUPO" : no.nodeType === "pacote" ? "PACOTE DE TRABALHO" : "ENTREGA"}</span>
        <span className="eap-responsavel">{no.responsible || "—"}</span>
        <span className="eap-local">{no.location || "—"}</span>
        <span className="eap-status-cell">
          {no.nodeType === "entrega" ? (
            jaNoCronograma(no.code) ? (
              <span className="eap-no-crono">No cronograma</span>
            ) : (
              <button
                type="button"
                className="eap-trazer"
                onClick={() => aoTrazer(no.id)}
                title="Trazer esta folha para o cronograma, com duração a informar"
              >
                + Cronograma
              </button>
            )
          ) : (
            <span className="eap-grupo-label">{temFilhos ? `${filhos.length} itens` : "Grupo"}</span>
          )}
          {modoRevisao && (
            <span className="eap-acoes-linha eap-acoes-revisao">
              {no.nodeType !== "entrega" && (
                <button type="button" className="eap-acao-linha eap-acao-revisao" onClick={() => aoAdicionar(no.id)} title="Adicionar item filho">
                  <Plus size={12} /> <span>Adicionar</span>
                </button>
              )}
              <button type="button" className="eap-acao-linha eap-acao-revisao" onClick={() => aoEditar(no.id)} title="Editar item">
                <Pencil size={12} /> <span>Editar</span>
              </button>
            </span>
          )}
        </span>
      </div>

      {temFilhos && aberto && (
        <div role="group">
          {filhos.map(f => (
            <NoDaArvore
              key={f.no.id}
              ramo={f}
              abertos={abertos}
              onAlternar={onAlternar}
              aoTrazer={aoTrazer}
              aoAdicionar={aoAdicionar}
              aoEditar={aoEditar}
              modoRevisao={modoRevisao}
              jaNoCronograma={jaNoCronograma}
              profundidade={profundidade + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditorEapPanel({
  editor,
  nos,
  busy,
  error,
  onCancel,
  onCreate,
  onUpdate,
}: {
  editor: EditorEap;
  nos: No[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (dados: DadosEditorEap) => void;
  onUpdate: (dados: DadosEditorEap) => void;
}) {
  const atual = editor.mode === "edit" ? nos.find(n => n.id === editor.nodeId) : undefined;
  const pai = editor.mode === "create" ? nos.find(n => n.id === editor.parentId) : undefined;
  const [name, setName] = useState(atual?.name ?? "");
  const [nodeType, setNodeType] = useState<"grupo" | "pacote" | "entrega">(
    atual?.nodeType === "entrega" ? "entrega" : atual?.nodeType === "grupo" ? "grupo" : "pacote"
  );
  const [decompositionBasis, setDecompositionBasis] = useState<EapBasis>(
    (atual?.decompositionBasis as EapBasis | null) ??
      (editor.mode === "create" && editor.parentId === null ? "project" : "deliverable")
  );
  const unit = atual?.unit ?? "";
  const quantity = atual?.plannedQuantity == null ? "" : String(atual.plannedQuantity);
  const [description, setDescription] = useState(atual?.description ?? "");
  const [inclusions, setInclusions] = useState(atual?.inclusions ?? "");
  const [exclusions, setExclusions] = useState(atual?.exclusions ?? "");
  const [location, setLocation] = useState(atual?.location ?? "");
  const [responsible, setResponsible] = useState(atual?.responsible ?? "");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(atual?.acceptanceCriteria ?? "");

  const salvar = () => {
    const nome = name.trim();
    if (!nome) return;
    const dados: DadosEditorEap = {
      name: nome,
      nodeType,
      decompositionBasis,
      unit: unit.trim() || undefined,
      plannedQuantity: quantity.trim() ? Number(quantity) : undefined,
      description: description.trim() || undefined,
      inclusions: inclusions.trim() || undefined,
      exclusions: exclusions.trim() || undefined,
      location: location.trim() || undefined,
      responsible: responsible.trim() || undefined,
      acceptanceCriteria: acceptanceCriteria.trim() || undefined,
    };
    if (editor.mode === "create") onCreate(dados);
    else onUpdate(dados);
  };

  return (
    <div className="eap-editor" role="region" aria-label={editor.mode === "create" ? "Novo item da EAP" : "Editar item da EAP"}>
      <div className="eap-editor-titulo">
        <div>
          <strong>{editor.mode === "create" ? "Adicionar item à EAP" : "Editar item da EAP"}</strong>
          <span>{editor.mode === "create"
            ? pai ? `Pai: ${pai.code} · ${pai.name}` : "Novo item no nível raiz"
            : atual ? `${atual.code} · código preservado para manter os vínculos` : "Item não encontrado"}</span>
        </div>
        <button type="button" className="eap-editor-fechar" onClick={onCancel} aria-label="Cancelar"><X size={15} /></button>
      </div>
      <div className="eap-editor-contexto">
        <span>{editor.mode === "edit" ? "FICHA DO ESCOPO" : "NOVO ITEM"}</span>
        <small>{atual?.nodeType === "entrega" ? "Pacote terminal / entrega controlável" : atual ? "Elemento estrutural da EAP" : "Defina primeiro a posição e o papel do novo item."}</small>
      </div>
      <div className="eap-editor-campos">
        <div className="eap-editor-secao"><strong>Identidade do escopo</strong><span>Campos que definem a estrutura e o significado do item.</span></div>
        <label>
          <span>Nome do elemento</span>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={220} />
        </label>
        <label>
          <span>Tipo</span>
          <select value={nodeType} onChange={e => setNodeType(e.target.value as typeof nodeType)}>
            <option value="grupo">Grupo</option>
            <option value="pacote">Pacote de trabalho</option>
            <option value="entrega">Entrega / serviço</option>
          </select>
        </label>
        <label>
          <span>Base de decomposição</span>
          <select value={decompositionBasis} onChange={e => setDecompositionBasis(e.target.value as EapBasis)}>
            <option value="project">Projeto / escopo total</option>
            <option value="deliverable">Entrega</option>
            <option value="system">Sistema</option>
            <option value="discipline">Disciplina</option>
            <option value="location">Localização</option>
            <option value="phase">Fase</option>
            <option value="component">Componente</option>
            <option value="other">Outro critério explícito</option>
          </select>
        </label>
        <div className="eap-editor-secao"><strong>Informações de controle</strong><span>Responsabilidade e localização ajudam a tornar o pacote controlável; quantitativos ficam na etapa própria.</span></div>
        <label><span>Localização</span><input value={location} onChange={e => setLocation(e.target.value)} maxLength={180} placeholder="ex.: Torre A · pavimento 04" /></label>
        <label><span>Responsável</span><input value={responsible} onChange={e => setResponsible(e.target.value)} maxLength={180} placeholder="Responsável pelo pacote" /></label>
        <div className="eap-editor-secao"><strong>Dicionário do escopo</strong><span>O que está dentro, fora e como a entrega será aceita.</span></div>
        <label><span>Descrição / escopo</span><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} rows={3} /></label>
        <label><span>Inclusões</span><textarea value={inclusions} onChange={e => setInclusions(e.target.value)} maxLength={5000} rows={2} /></label>
        <label><span>Exclusões</span><textarea value={exclusions} onChange={e => setExclusions(e.target.value)} maxLength={5000} rows={2} /></label>
        <label><span>Critério de aceitação</span><textarea value={acceptanceCriteria} onChange={e => setAcceptanceCriteria(e.target.value)} maxLength={5000} rows={2} /></label>
        <div className="eap-editor-secao"><strong>Integrações posteriores</strong><span>Unidade e quantidade pertencem aos quantitativos; custo ao orçamento; duração e datas ao cronograma.</span></div>
        <div className="eap-editor-integracoes">
          <span>Quantitativos <b>{unit || "unidade não definida"}{quantity ? ` · ${quantity}` : ""}</b></span>
          <span>Orçamento <b>etapa própria</b></span>
          <span>Atividades <b>etapa própria</b></span>
        </div>
        <div className="eap-editor-acoes">
          <button type="button" className="eap-btn-secundario" onClick={onCancel} disabled={busy}><X size={13} /> Cancelar</button>
          <button type="button" className="eap-btn" onClick={salvar} disabled={busy || !name.trim()}><Check size={13} /> {busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
      {error && <div className="eap-editor-erro">{error}</div>}
    </div>
  );
}

/** Estado vazio: o escopo vem primeiro; o catálogo pode apenas sugerir uma semente. */
function EapVazia({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();
  const revisaoArquimedes = trpc.eap.eapArquimedesReview.useQuery({ projectId: projetoId }, { enabled: projetoId > 0 });
  const analisar = trpc.eap.analisarEapComArquimedes.useMutation({
    onSuccess: async () => {
      await revisaoArquimedes.refetch();
    },
  });
  const aplicarProposta = trpc.eap.aplicarPropostaEap.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const criarRaiz = trpc.projects.createWbsNode.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const gerar = trpc.eap.generateEapFromCatalog.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const [tipo, setTipo] = useState<"edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos">("edificio");
  const [pendenciasAbertas, setPendenciasAbertas] = useState(true);

  const proposal = analisar.data?.proposal ?? revisaoArquimedes.data?.proposal;
  const proposalStats = useMemo(() => {
    if (!proposal) {
      return { creates: 0, updates: 0, moves: 0, removes: 0, roots: 0 };
    }
    const nodes = proposal.nodes;
    return {
      creates: nodes.filter(node => node.operation === "create").length,
      updates: nodes.filter(node => node.operation === "update").length,
      moves: nodes.filter(node => node.operation === "move").length,
      removes: nodes.filter(node => node.operation === "remove").length,
      roots: nodes.filter(node => !node.parentCode).length,
    };
  }, [proposal]);

  const proposalNodes = proposal?.nodes ?? [];

  return (
    <div className="eap-inicial">
      <div className="eap-inicial-hero">
        <div className="eap-inicial-identity">
          <div className="eap-inicial-mark"><Layers3 size={18} /></div>
          <div>
            <span className="eap-section-kicker">PLANEJAMENTO · EAP</span>
            <h2>Proposta inicial da estrutura analítica</h2>
            <p>Pré-planejamento gerado pelo Arquimedes a partir do escopo informado. A estrutura permanece em revisão até decisão do engenheiro.</p>
          </div>
        </div>
        <div className="eap-inicial-actions">
          <button
            type="button"
            className="eap-btn eap-tool-agent"
            disabled={analisar.isPending}
            onClick={() => analisar.mutate({ projectId: projetoId })}
          >
            <Bot size={14} />
            {analisar.isPending ? "Analisando escopo…" : "Gerar proposta com Arquimedes"}
          </button>
          <button
            type="button"
            className="eap-btn-secundario"
            disabled={criarRaiz.isPending}
            onClick={() =>
              criarRaiz.mutate({
                projectId: projetoId,
                name: "Escopo da obra",
                nodeType: "grupo",
                decompositionBasis: "project",
                description: "Escopo consolidado da obra. Preencher a descrição, inclusões, exclusões e critérios de aceitação antes da aprovação.",
                inclusions: "Todo o trabalho necessário para entregar a obra conforme o escopo contratado.",
                exclusions: "Trabalhos explicitamente fora do escopo contratado.",
              })
            }
          >
            {criarRaiz.isPending ? "Criando…" : "Montar manualmente"}
          </button>
        </div>
      </div>

      <div className="eap-inicial-note">
        <Info size={14} />
        <div>
          <strong>Fluxo de aprovação</strong>
          <span>Gerar → revisar estrutura → ajustar na EAP → pedir nova análise → aprovar e criar baseline.</span>
        </div>
      </div>

      {!proposal && !analisar.isPending && (
        <div className="eap-inicial-empty">
          <div className="eap-inicial-empty-icon"><FileCheck2 size={22} /></div>
          <div>
            <strong>Ainda não existe uma proposta para esta obra.</strong>
            <p>O Arquimedes usa o escopo informado e o conhecimento profissional de EAP para propor uma estrutura inicial. Nenhum nó será criado até sua decisão.</p>
          </div>
        </div>
      )}

      {analisar.isPending && (
        <div className="eap-inicial-loading">
          <div className="eap-inicial-loading-mark"><Bot size={18} /></div>
          <div>
            <strong>Arquimedes analisando o escopo</strong>
            <span>Definindo macroestrutura, níveis de decomposição, pacotes de trabalho e informações ainda não confirmadas.</span>
          </div>
        </div>
      )}

      {analisar.error && (
        <div className="eap-inicial-error" role="alert">
          <AlertTriangle size={15} />
          <div><strong>Não foi possível gerar a proposta.</strong><span>{analisar.error.message}</span></div>
        </div>
      )}
      {criarRaiz.isError && <div className="eap-inicial-error" role="alert"><AlertTriangle size={15} /><div><strong>Falha ao criar a raiz.</strong><span>{criarRaiz.error.message}</span></div></div>}
      {gerar.isError && <div className="eap-inicial-error" role="alert"><AlertTriangle size={15} /><div><strong>Falha ao montar a estrutura-base.</strong><span>{gerar.error.message}</span></div></div>}

      {proposal && (
        <div className="eap-proposta">
          <header className="eap-proposta-head">
            <div>
              <span className="eap-section-kicker">REVISÃO TÉCNICA · ARQUIMEDES</span>
              <h3>Estrutura analítica proposta</h3>
              <p>Leitura de engenharia da estrutura sugerida antes de qualquer gravação na EAP da obra.</p>
            </div>
            <span className="eap-proposta-status"><span /> RASCUNHO · NÃO APLICADA</span>
          </header>

          <div className="eap-proposta-kpis">
            <div><span>NÓS PROPOSTOS</span><strong>{proposal.nodes.length}</strong><small>estrutura inicial</small></div>
            <div><span>RAÍZES</span><strong>{proposalStats.roots}</strong><small>blocos principais</small></div>
            <div><span>CRIAÇÕES</span><strong>{proposalStats.creates}</strong><small>novos nós</small></div>
            <div className={proposal.validation?.valid === false ? "attention" : "ok"}><span>ESTRUTURA</span><strong>{proposal.validation?.valid === false ? "BLOQUEADA" : "OK"}</strong><small>{proposal.validation?.valid === false ? (proposal.validation.issues.filter(item => item.severity === "error").length + " erro(s) estrutural(is)") : "Proposta validada pelo sistema"}</small></div>
          </div>

          <div className="eap-proposta-grid">
            <section className="eap-proposta-card eap-proposta-estrutura">
              <div className="eap-proposta-card-head">
                <div><Layers3 size={15} /><div><strong>Estrutura proposta</strong><span>Visão resumida da árvore gerada pelo Arquimedes</span></div></div>
                <span>{proposal.nodes.length} nós</span>
              </div>

              <div className="eap-proposta-tree-head">
                <span>CÓDIGO</span><span>ESCOPO / ENTREGÁVEL</span><span>TIPO</span><span>JUSTIFICATIVA</span>
              </div>
              <div className="eap-proposta-tree">
                {proposalNodes.map((item, index) => {
                  const depth = Math.max((item.code ?? "").split(".").length - 1, 0);
                  const type = item.nodeType === "grupo" ? "GRUPO" : item.nodeType === "pacote" ? "PACOTE" : "ENTREGA";
                  return (
                    <div className={`eap-proposta-tree-row depth-${Math.min(depth, 4)}`} key={item.code ?? index}>
                      <span className="eap-proposta-code">{item.code ?? "—"}</span>
                      <span className="eap-proposta-name">{item.name}</span>
                      <span className="eap-proposta-type">{type}</span>
                      <span className="eap-proposta-rationale">{item.rationale}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="eap-proposta-side">
              <section className="eap-proposta-card">
                <div className="eap-proposta-card-head">
                  <div><ClipboardCheck size={15} /><div><strong>Fundamentação</strong><span>Base usada para construir a proposta</span></div></div>
                </div>
                <div className="eap-proposta-copy">
                  {proposal.basis.length ? proposal.basis.map((item, i) => <p key={i}>{item}</p>) : <p className="muted">Nenhuma fundamentação adicional registrada.</p>}
                </div>
              </section>

              <section className="eap-proposta-card">
                <div className="eap-proposta-card-head">
                  <div><Info size={15} /><div><strong>Premissas</strong><span>Condições consideradas sem confirmação formal</span></div></div>
                </div>
                <div className="eap-proposta-copy">
                  {proposal.assumptions.length ? proposal.assumptions.map((item, i) => <p key={i}>{item}</p>) : <p className="muted">Nenhuma premissa registrada.</p>}
                </div>
              </section>

              <section className="eap-proposta-card eap-proposta-pendencias">
                <button type="button" className="eap-proposta-collapse" onClick={() => setPendenciasAbertas(value => !value)}>
                  <div><AlertTriangle size={15} /><div><strong>Informações pendentes</strong><span>Dados que o engenheiro ainda precisa confirmar</span></div></div>
                  <span className="eap-proposta-count">{proposal.missingInformation.length}</span>
                </button>
                {pendenciasAbertas && (
                  <div className="eap-proposta-pendencias-lista">
                    {proposal.missingInformation.length ? proposal.missingInformation.map((item, i) => <div key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{item}</p></div>) : <p className="muted">Não há pendências registradas.</p>}
              {proposal.validation && !proposal.validation.valid && (
                <div className="eap-inicial-error">
                  <AlertTriangle size={15} />
                  <div>
                    <strong>Erro estrutural da proposta</strong>
                    {proposal.validation.issues.filter(item => item.severity === "error").slice(0, 6).map((item, i) => (
                      <span key={i}>{item.message}</span>
                    ))}
                  </div>
                </div>
              )}
                  </div>
                )}
              </section>
            </aside>
          </div>

          <footer className="eap-proposta-footer">
            <div className="eap-proposta-footer-copy">
              <FileCheck2 size={16} />
              <div>
                <strong>A proposta é somente uma recomendação técnica.</strong>
                <span>O engenheiro deve revisar a estrutura, ajustar o necessário e pedir nova análise antes da aprovação. Aplicar como rascunho não cria baseline.</span>
              </div>
            </div>
            <div className="eap-proposta-footer-actions">
              <button
                type="button"
                className="eap-btn-secundario"
                disabled={analisar.isPending}
                onClick={() => analisar.mutate({ projectId: projetoId, mode: "analisar" })}
              >
                <Bot size={13} /> Nova análise
              </button>
              {proposal.validation?.valid !== false && proposal.nodes.every(item => item.operation === "create" || item.operation === "update") && (
                <button
                  type="button"
                  className="eap-btn"
                  disabled={aplicarProposta.isPending}
                  onClick={() => {
                    if (!window.confirm("Aplicar a proposta do Arquimedes como rascunho?\n\nA EAP continuará editável e não será aprovada nem congelada.")) return;
                    aplicarProposta.mutate({
                      projectId: projetoId,
                      confirm: true,
                      proposal,
                    });
                  }}
                >
                  {aplicarProposta.isPending ? "Aplicando rascunho…" : "Aplicar como rascunho"}
                </button>
              )}
            </div>
          </footer>

          {aplicarProposta.error && (
            <div className="eap-inicial-error"><AlertTriangle size={15} /><div><strong>Aplicação não concluída.</strong><span>{aplicarProposta.error.message}</span></div></div>
          )}
        </div>
      )}

      {gerar.isSuccess && (
        <div className="eap-inicial-success">
          <CheckCircle2 size={15} />
          <span>{gerar.data.semeadura.nosCriados} nós criados a partir do template de escopo.</span>
        </div>
      )}

      <div className="eap-inicial-secondary">
        <div>
          <span className="eap-section-kicker">ALTERNATIVA</span>
          <strong>Estrutura-base genérica</strong>
          <p>Disponível somente como fallback. Quando houver escopo detalhado, a proposta do Arquimedes é a fonte preferencial.</p>
        </div>
        <div className="eap-acoes">
          <select className="eap-select" value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)} aria-label="Tipo de estrutura-base">
            <option value="edificio">Edifício / construção nova</option>
            <option value="reforma">Reforma</option>
            <option value="pavimentacao">Pavimentação</option>
            <option value="saneamento">Saneamento</option>
            <option value="todos">Todos os grupos</option>
          </select>
          <button
            type="button"
            className="eap-btn-secundario"
            disabled={gerar.isPending}
            onClick={() => gerar.mutate({ projectId: projetoId, tipoDeObra: tipo })}
            title="Usar somente como estrutura-base genérica. O Arquimedes deve ser preferido quando houver descrição da obra."
          >
            {gerar.isPending ? "Montando estrutura…" : "Usar estrutura-base"}
          </button>
        </div>
      </div>
    </div>
  );
}


