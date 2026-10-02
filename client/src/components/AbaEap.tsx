import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Bot, Check, CheckCircle2, ClipboardCheck, FileCheck2, FileText, Info, Layers3, LockKeyhole, Maximize2, Minimize2, PackageCheck, Pencil, Plus, Search, X } from "lucide-react";
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

  const utils = trpc.useUtils();
  const recarregar = () => utils.projects.wbs.invalidate({ projectId: projetoId });

  const criarNo = trpc.projects.createWbsNode.useMutation({
    onSuccess: async () => { setEditor(null); await recarregar(); await utils.projects.validateWbsStructure.invalidate({ projectId: projetoId }); },
  });

  const editarNo = trpc.projects.updateWbsNode.useMutation({
    onSuccess: async () => { setEditor(null); await recarregar(); await utils.projects.validateWbsStructure.invalidate({ projectId: projetoId }); },
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
      await utils.projects.validateWbsStructure.invalidate({ projectId: projetoId });
    },
  });
  const enviarEapParaRevisao = trpc.projects.enviarEapParaRevisao.useMutation({
    onSuccess: async () => {
      await coordenador.refetch();
      await versoes.refetch();
      await utils.projects.validateWbsStructure.invalidate({ projectId: projetoId });
    },
  });
  const validacao = trpc.projects.validateWbsStructure.useQuery(
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
  const folhasSemDicionario = folhasEap.filter(n =>
    !n.description?.trim() || !n.inclusions?.trim() || !n.exclusions?.trim() ||
    !n.location?.trim() || !n.responsible?.trim() || !n.acceptanceCriteria?.trim()
  );
  const folhasSemQuantidade = folhasEap.filter(n => !n.unit || n.plannedQuantity == null);
  // Quantitativos não bloqueiam a baseline da EAP. Eles pertencem à etapa
  // seguinte: levantamento quantitativo. A EAP só precisa ter estrutura e
  // dicionário de escopo suficientemente definidos para aprovação.
  const eapProntaParaAprovacao = Boolean(validacao.data?.valid) &&
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
  const refazer = trpc.projects.generateEapFromCatalog.useMutation({
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
      const grupos = nos.filter(n => n.nodeType !== "entrega").map(n => n.id);
      return grupos.length ? new Set(grupos) : antigo;
    });
  }, [nos]);

  const arvore = useMemo(() => montarArvore(nos), [nos]);
  const filtrada = useMemo(
    () => (busca.trim() ? filtrarArvore(arvore, busca.trim().toLowerCase()) : arvore),
    [arvore, busca]
  );

  const expandirTudo = () => setAberto(new Set(nos.filter(n => n.nodeType !== "entrega").map(n => n.id)));
  const recolherTudo = () => setAberto(new Set());
  const revisaoArquimedes = trpc.projects.eapArquimedesReview.useQuery({ projectId: projetoId }, { enabled: projetoId > 0 });
  const analisarComArquimedes = trpc.projects.analisarEapComArquimedes.useMutation({
    onSuccess: async () => {
      await revisaoArquimedes.refetch();
      await validacao.refetch();
    },
  });
  const propostaArquimedes = analisarComArquimedes.data?.proposal ?? revisaoArquimedes.data?.proposal;
  const ultimaRevisaoArquimedes = revisaoArquimedes.data?.createdAt ?? null;
  const modoUltimaRevisaoArquimedes =
    analisarComArquimedes.data?.mode ??
    revisaoArquimedes.data?.mode ??
    "analisar";
  const agenteRevisao =
    analisarComArquimedes.data?.agentId ??
    revisaoArquimedes.data?.agentId ??
    "euclides";
  const resumoCorrecao = propostaArquimedes?.resolutionSummary ?? [];
  const aplicarPropostaEap = trpc.projects.aplicarPropostaEap.useMutation({
    onSuccess: async () => {
      await recarregar();
      await utils.projects.validateWbsStructure.invalidate({ projectId: projetoId });
      await coordenador.refetch();
      await versoes.refetch();
      await revisaoArquimedes.refetch();
      analisarComArquimedes.reset();
    },
  });
  const abrirAgente = () => window.dispatchEvent(new CustomEvent("abrir-agente-eap"));


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
      <div className="eap-toolbar">
        <div className="eap-toolbar-identidade">
          <div className="eap-toolbar-icon"><FileText size={16} /></div>
          <div>
            <div className="eap-toolbar-titulo">EAP da obra</div>
            <div className="eap-toolbar-subtitulo">Estrutura analítica · formato de planilha para conferência</div>
          </div>
        </div>
        <div className="eap-toolbar-acoes">
          <div className="eap-densidade" role="group" aria-label="Densidade da planilha EAP">
            <span>Zoom</span>
            <button type="button" className={densidade === "compacta" ? "ativo" : ""} onClick={() => setDensidade("compacta")}>80%</button>
            <button type="button" className={densidade === "normal" ? "ativo" : ""} onClick={() => setDensidade("normal")}>100%</button>
            <button type="button" className={densidade === "confortavel" ? "ativo" : ""} onClick={() => setDensidade("confortavel")}>115%</button>
          </div>
          <button type="button" className="eap-tool-btn" onClick={recolherTudo}><Minimize2 size={14} /> Recolher</button>
          <button type="button" className="eap-tool-btn" onClick={expandirTudo}><Maximize2 size={14} /> Expandir</button>
          <button type="button" className="eap-tool-btn" onClick={() => setEditor({ mode: "create", parentId: null })}><Plus size={14} /> Novo nível</button>
          <button
            type="button"
            className="eap-tool-btn eap-tool-agent"
            disabled={analisarComArquimedes.isPending}
            onClick={() => analisarComArquimedes.mutate({ projectId: projetoId, mode: "analisar" })}
          >
            <Bot size={14} /> {analisarComArquimedes.isPending
              ? "Arquimedes revisando…"
              : coordenador.data?.stage === "EAP_REVISAO"
                ? "Revisar com Euclides"
                : "Analisar com Euclides"}
          </button>
        </div>
      </div>
      {erro && (
        <div className="xl-aviso-erro" role="alert">
          {erro}
          <button type="button" onClick={() => setErro(null)}>
            fechar
          </button>
        </div>
      )}

      {propostaArquimedes && (
        <div className="eap-validacao" role="status" aria-live="polite">
          <div className="eap-validacao-cabecalho">
            <div>
              <strong>Euclides · Revisor de EAP</strong>
              <span>
                Sob coordenação do Arquimedes · {modoUltimaRevisaoArquimedes === "resolver_bloqueios" ? "resolução de bloqueios" : "revisão técnica"}
                {" · "}{propostaArquimedes.nodes.length} proposta(s) · {propostaArquimedes.missingInformation.length} pendência(s) de escopo
              </span>
            </div>
            {propostaArquimedes.validation?.valid === false ? (
              <span className="eap-validacao-erro"><AlertTriangle size={14} /> Proposta bloqueada por estrutura</span>
            ) : (
              <span className="eap-validacao-ok"><Bot size={14} /> Proposta não aplicada</span>
            )}
          </div>
          {propostaArquimedes.basis.length > 0 && (
            <div className="eap-validacao-lista">
              <div className="eap-validacao-item eap-validacao-warning"><span>FUNDAMENTAÇÃO</span><p>{propostaArquimedes.basis.join(" · ")}</p></div>
            </div>
          )}
          {propostaArquimedes.nodes.slice(0, 8).map((item, index) => (
            <div key={index} className="eap-validacao-item eap-validacao-warning">
              <span>{item.operation.toUpperCase()}</span>
              <p><strong>{item.parentCode ? item.parentCode + " · " : ""}{item.name}</strong> — {item.rationale}</p>
            </div>
          ))}
          {modoUltimaRevisaoArquimedes === "resolver_bloqueios" && (
            <div className="eap-proposta-correcao">
              <div className="eap-proposta-correcao-head">
                <Bot size={15} />
                <div>
                  <strong>Relatório da correção proposta por Euclides</strong>
                  <span>Euclides recebeu os bloqueios atuais e montou uma proposta para tratá-los. A EAP vermelha abaixo continua sendo a estrutura atual porque nada foi aplicado automaticamente.</span>
                </div>
              </div>

              <div className="eap-proposta-correcao-grid">
                <div>
                  <span>AÇÕES PROPOSTAS</span>
                  <strong>{propostaArquimedes.nodes.length}</strong>
                  <small>alterações para o engenheiro revisar</small>
                </div>
                <div>
                  <span>BLOQUEIOS RECEBIDOS</span>
                  <strong>{propostaArquimedes.validation?.issues.filter(item => item.severity === "error").length ?? 0}</strong>
                  <small>erros estruturais após a proposta</small>
                </div>
              </div>

              {!!resumoCorrecao.length && (
                <div className="eap-proposta-correcao-resumo">
                  <strong>O que Euclides propôs fazer</strong>
                  {resumoCorrecao.slice(0, 12).map((item, index) => (
                    <div key={index}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              )}

              {!resumoCorrecao.length && propostaArquimedes.nodes.length > 0 && (
                <div className="eap-proposta-correcao-resumo">
                  <strong>Ações detalhadas propostas</strong>
                  {propostaArquimedes.nodes.slice(0, 12).map((item, index) => (
                    <div key={index}>
                      <span>{item.operation.toUpperCase()}</span>
                      <p><b>{item.code ?? item.nodeId ?? "novo"}</b> · {item.name} — {item.rationale}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {propostaArquimedes.validation && !propostaArquimedes.validation.valid && (
            <div className="eap-proposta-erros">
              <div className="eap-proposta-erros-head">
                <AlertTriangle size={15} />
                <div>
                  <strong>Erros encontrados pelo validador</strong>
                  <span>Corrija estes pontos antes de aplicar a proposta ou aprovar a EAP.</span>
                </div>
                <strong>{propostaArquimedes.validation.issues.filter(item => item.severity === "error").length}</strong>
              </div>
              <div className="eap-proposta-erros-lista">
                {propostaArquimedes.validation.issues.filter(item => item.severity === "error").slice(0, 10).map((item, index) => (
                  <div key={index}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>
              <div className="eap-proposta-erros-acoes">
                <button
                  type="button"
                  className="eap-btn"
                  disabled={analisarComArquimedes.isPending}
                  onClick={() => analisarComArquimedes.mutate({ projectId: projetoId, mode: "resolver_bloqueios" })}
                >
                  <Bot size={13} /> {analisarComArquimedes.isPending ? "Euclides resolvendo…" : "Resolver bloqueios com Euclides"}
                </button>
                <small>Euclides propõe a correção; Arquimedes coordena; nada é aplicado automaticamente.</small>
              </div>
            </div>
          )}
          {propostaArquimedes.missingInformation.length > 0 ? (
            <div className="eap-proposta-pendencias-inline">
              <strong>Informações que dependem do engenheiro</strong>
              <span>{propostaArquimedes.missingInformation.join(" · ")}</span>
            </div>
          ) : (
            <div className="eap-proposta-pendencias-inline ok">
              <strong>Escopo informado suficiente para esta rodada.</strong>
            </div>
          )}
          {propostaArquimedes.validation?.valid !== false && propostaArquimedes.nodes.every(item => item.operation === "create" || item.operation === "update") && (
            <button
              type="button"
              className="eap-btn"
              disabled={aplicarPropostaEap.isPending}
              onClick={() => {
                if (!window.confirm("Aplicar a proposta do Arquimedes como rascunho?\n\nA EAP continuará editável e não será aprovada nem congelada.")) return;
                aplicarPropostaEap.mutate({
                  projectId: projetoId,
                  confirm: true,
                  proposal: propostaArquimedes,
                });
              }}
            >
              {aplicarPropostaEap.isPending ? "Aplicando rascunho…" : "Aplicar proposta como rascunho"}
            </button>
          )}
          {aplicarPropostaEap.error && (
            <small className="eap-erro">Aplicação da proposta: {aplicarPropostaEap.error.message}</small>
          )}
        </div>
      )}
      {analisarComArquimedes.error && (
        <div className="xl-aviso-erro" role="alert">Arquimedes: {analisarComArquimedes.error.message}</div>
      )}
      {revisaoArquimedes.isError && (
        <div className="xl-aviso-erro" role="alert">Revisão da EAP: {revisaoArquimedes.error.message}</div>
      )}

      <div className="eap-controle">
        <div className="eap-controle-cabecalho">
          <div>
            <strong><BookOpen size={15} /> Dicionário e controle da EAP</strong>
            <span>{coordenador.data?.stage ? `Etapa atual: ${coordenador.data.stage}` : "Conferência da estrutura, prontidão e baseline"}</span>
          </div>
          <button type="button" className="eap-tool-btn" onClick={() => setControleAberto(value => !value)}>
            {controleAberto ? "Ocultar controle" : "Mostrar controle"}
          </button>
        </div>
        {controleAberto && <>
          <div className="eap-controle-grid">
            <div className={`eap-controle-card ${folhasSemDicionario.length ? "atencao" : "ok"}`}><span>Dicionário</span><strong>{folhasEap.length - folhasSemDicionario.length}/{folhasEap.length}</strong><small>{folhasSemDicionario.length ? `${folhasSemDicionario.length} folha(s) incompleta(s)` : "Todas as folhas documentadas"}</small></div>
            <div className={`eap-controle-card ${folhasSemQuantidade.length ? "atencao" : "ok"}`}><span>Quantitativos</span><strong>{folhasSemQuantidade.length ? "PENDENTE" : "PRONTO"}</strong><small>{folhasSemQuantidade.length ? `${folhasSemQuantidade.length} pacote(s) aguardando unidade/quantidade` : "Levantamento quantitativo preenchido"}</small></div>
            <div className={`eap-controle-card ${pacotesTrabalho.length ? "ok" : "atencao"}`}><span>Pacotes de trabalho</span><strong>{pacotesTrabalho.length}</strong><small>Folhas terminais controláveis</small></div>
            <div className={`eap-controle-card ${validacao.data?.valid ? "ok" : "atencao"}`}><span>Critérios de parada</span><strong>{validacao.data?.valid ? "OK" : "REVISAR"}</strong><small>Sem bloqueios estruturais</small></div>
          </div>
          <div className="eap-parada">
            <div><strong>Quando parar a decomposição</strong><span>Parar quando o escopo estiver claro, a unidade de controle definida, a responsabilidade e a medição atribuíveis e o pacote puder virar atividade sem alterar o escopo.</span></div>
            <div><strong>Quando continuar</strong><span>Continuar quando houver mistura de localização, entregáveis, responsáveis, métodos, quantidades ou trabalhos que precisem ser controlados separadamente.</span></div>
          </div>
          <div className="eap-baseline">
            <div className="eap-baseline-info"><LockKeyhole size={16} /><div><strong>Baseline da EAP</strong><span>{versoes.data?.[0] ? `Versão v${versoes.data[0].versionNumber} · ${versoes.data[0].status}${versoes.data[0].approvedAt ? ` · aprovada em ${new Date(versoes.data[0].approvedAt).toLocaleString("pt-BR")}` : ""}` : "Ainda não existe versão do plano."}</span></div>{!podeAprovarEap && <span className="eap-baseline-bloqueada">{coordenador.data?.stage !== "EAP_REVISAO" ? "Aguardando etapa de revisão" : validacao.data?.valid ? (folhasSemDicionario.length ? `${folhasSemDicionario.length} folha(s) sem dicionário de escopo` : "Aguardando validação") : `${validacao.data?.issues.length ?? 0} apontamento(s) precisam ser revisados`}</span>}</div>
            <button type="button" className="eap-btn" disabled={!podeAprovarEap} title={coordenador.data?.stage !== "EAP_REVISAO" ? "A aprovação da EAP ocorre na etapa EAP_REVISAO." : eapProntaParaAprovacao ? "Aprova a EAP e congela a versão do plano como baseline." : "A EAP ainda possui apontamentos ou campos obrigatórios pendentes."} onClick={() => {
              if (!podeAprovarEap) return;
              if (!window.confirm("Aprovar a EAP e criar a baseline?\\n\\nA versão atual será congelada para rastrear a estrutura aprovada. Alterações posteriores deverão ocorrer em uma nova versão.")) return;
              aprovarEap.mutate({ projectId: projetoId, stage: "EAP_REVISAO", decision: "approved", nextStage: "ATIVIDADES_PROPOSTA", scope: { kind: "eap", nodeCount: nos.length, leafCount: folhasEap.length, workPackageCount: pacotesTrabalho.length }, summary: `EAP aprovada: ${nos.length} nós, ${folhasEap.length} folhas e ${pacotesTrabalho.length} pacotes de trabalho.` });
            }}><PackageCheck size={14} />{aprovarEap.isPending ? "Aprovando…" : "Aprovar EAP / Baseline"}</button>
          </div>
          {aprovarEap.error && <div className="xl-aviso-erro" role="alert">Aprovação da EAP: {aprovarEap.error.message}</div>}
        </>}
      </div>

      <div className="eap-topo">
        <div className="eap-resumo">
          <div>
            <h2>ESTRUTURA ANALÍTICA DA OBRA</h2>
            <p>{total} nós · {grupos} grupos · {folhas} folhas · profundidade máxima {Math.max(...nos.map(n => n.level), 1)}</p>
          </div>
          <span className="eap-status-chip"><span className="eap-status-dot" /> Estrutura carregada</span>
        </div>
        <div className="eap-topo-acoes">
          <button
            type="button"
            className="eap-btn-secundario"
            disabled={refazer.isPending}
            title="Reconstrói a EAP pela estrutura-base da obra. Catálogos entram depois, no orçamento."
            onClick={() => {
              const ok = window.confirm(
                "Refazer a EAP?\n\n" +
                  "A estrutura da EAP da versão de trabalho será reconstruída pelo template da obra. " +
                  "O catálogo não será usado para criar nós, materiais ou serviços na EAP. " +
                  "Quantitativos, orçamento e cronograma serão tratados nas etapas próprias."
              );
              if (!ok) return;
              refazer.mutate({ projectId: projetoId, tipoDeObra: "edificio", refazer: true });
            }}
          >
            {refazer.isPending ? "Refazendo…" : "Refazer"}
          </button>
        </div>
        <label className="eap-busca-wrap">
          <Search size={14} />
          <input
            className="eap-busca"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar por nome ou código…"
            aria-label="Filtrar a estrutura"
          />
        </label>
      </div>

      <div className="eap-validacao eap-validacao-compacta" role="status" aria-live="polite">
        <div className="eap-validacao-cabecalho">
          <div className="eap-validacao-titulo">
            <strong><CheckCircle2 size={14} /> Validação da EAP</strong>
            <span>{validacao.isPending ? "Analisando estrutura…" : validacao.data ? `${validacao.data.summary.nodes} nós · ${validacao.data.summary.leaves} folhas · ${validacao.data.summary.errors} bloqueios · ${validacao.data.summary.warnings} alertas` : "Validação indisponível"}</span>
          </div>
          <div className="eap-validacao-acoes">
            {validacao.data?.valid ? <span className="eap-validacao-ok"><CheckCircle2 size={13} /> Sem bloqueios</span> : validacao.data ? <span className="eap-validacao-erro"><AlertTriangle size={13} /> Revisão necessária</span> : null}
            <button
              type="button"
              className={`eap-revisao-btn ${modoRevisao ? "ativo" : ""}`}
              disabled={analisarComArquimedes.isPending}
              onClick={() => {
                if (modoRevisao) {
                  setModoRevisao(false);
                  return;
                }
                setModoRevisao(true);
                setValidacaoAberta(true);
                expandirTudo();

                const temBloqueios = (validacao.data?.issues ?? [])
                  .some(issue => issue.severity === "error");
                analisarComArquimedes.mutate({
                  projectId: projetoId,
                  mode: temBloqueios ? "resolver_bloqueios" : "analisar",
                });
              }}
              aria-pressed={modoRevisao}
              title={
                modoRevisao
                  ? "Encerrar o modo de edição da EAP."
                  : "Abrir a revisão e pedir ao Arquimedes para analisar ou corrigir os bloqueios encontrados."
              }
            >
              <Pencil size={13} />
              {analisarComArquimedes.isPending
                ? "Arquimedes revisando…"
                : modoRevisao
                  ? "Concluir revisão"
                  : (validacao.data?.summary.errors ?? 0) > 0
                    ? "Corrigir com Arquimedes"
                    : "Revisar com Arquimedes"}
            </button>
            {!!validacao.data?.issues.length && <button type="button" className="eap-validacao-detalhes" onClick={() => setValidacaoAberta(v => !v)}>{validacaoAberta ? "Ocultar detalhes" : `Ver ${validacao.data.issues.length} apontamentos`}</button>}
          </div>
        </div>
        {validacao.data && !validacao.data.valid && (
          <div className="eap-validacao-bloqueios">
            <div className="eap-validacao-bloqueios-head">
              <AlertTriangle size={15} />
              <div>
                <strong>Bloqueios atuais da EAP</strong>
                <span>{validacao.data.summary.errors} erro(s) estrutural(is) impedem a aprovação.</span>
              </div>
            </div>
            <div className="eap-validacao-bloqueios-lista">
              {validacao.data.issues.filter(issue => issue.severity === "error").slice(0, 8).map((issue, index) => (
                <div key={`${issue.code}-${issue.entityRef ?? "obra"}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{issue.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {validacaoAberta && !!validacao.data?.issues.length && (
          <div className="eap-validacao-lista">
            {validacao.data.issues.slice(0, 12).map((issue, index) => (
              <div key={`${issue.code}-${issue.entityRef ?? "obra"}-${index}`} className={`eap-validacao-item eap-validacao-${issue.severity}`}>
                <span>{issue.severity === "error" ? "BLOQUEIO" : "ATENÇÃO"}</span><p>{issue.message}</p>
              </div>
            ))}
            {validacao.data.issues.length > 12 && <small>+ {validacao.data.issues.length - 12} apontamentos adicionais.</small>}
          </div>
        )}
        {modoRevisao && (
          <div className="eap-revisao-modo" role="status">
            <Pencil size={14} />
            <div>
              <strong>Modo revisão ativo</strong>
              <span>A árvore foi expandida. Use <b>Editar</b> e <b>Adicionar</b> nas linhas para corrigir a EAP.</span>
            </div>
            <button type="button" className="eap-btn-secundario" onClick={expandirTudo}>
              Expandir árvore
            </button>
          </div>
        )}
      </div>

      {coordenador.data?.stage === "EAP_PROPOSTA" && (
        <div className="eap-inicial-note">
          <Info size={14} />
          <div>
            <strong>Próxima etapa: revisão técnica</strong>
            <span>
              A EAP será enviada para revisão do engenheiro sem criar baseline.
              Depois da revisão, o Arquimedes pode ser executado novamente antes da aprovação final.
            </span>
            {!coordenador.data?.canAdvance && coordenador.data?.gateMessage && (
              <small className="eap-gate-motivo">{coordenador.data.gateMessage}</small>
            )}
          </div>
          <button
            type="button"
            className="eap-btn"
            disabled={
              !coordenador.data?.canAdvance ||
              enviarEapParaRevisao.isPending
            }
            onClick={() => {
              if (!coordenador.data?.canAdvance) return;
              enviarEapParaRevisao.mutate({ projectId: projetoId });
            }}
            title={
              coordenador.data?.canAdvance
                ? "Enviar a EAP atual para revisão técnica."
                : coordenador.data?.gateMessage || "A EAP ainda não atende ao gate da revisão."
            }
          >
            {enviarEapParaRevisao.isPending ? "Enviando…" : "Enviar para revisão"}
          </button>
        </div>
      )}
      {coordenador.data?.stage === "EAP_REVISAO" && (
        <>
          <div className="eap-revisao-etapa">
            <CheckCircle2 size={15} />
            <div>
              <strong>EAP em revisão técnica</strong>
              <span>Primeiro o engenheiro revisa e edita. Depois o Arquimedes faz uma revisão técnica da EAP atual.</span>
            </div>
            <button type="button" className="eap-btn-secundario" onClick={() => {
              setModoRevisao(true);
              setValidacaoAberta(true);
              expandirTudo();
            }}>
              <Pencil size={13} /> Abrir revisão
            </button>
          </div>

          <div className="eap-arquimedes-revisao">
            <div className="eap-arquimedes-revisao-topo">
              <div className="eap-arquimedes-revisao-identidade">
                <div className="eap-arquimedes-revisao-icone"><Bot size={16} /></div>
                <div>
                  <strong>Euclides · Eng. Revisor de EAP</strong>
                  <span>Especialista do Arquimedes para EAP. Analisa a estrutura atual, aponta problemas e propõe correções; nada é aplicado automaticamente.</span>
                </div>
              </div>
              <button
                type="button"
                className="eap-btn eap-arquimedes-revisao-btn"
                disabled={analisarComArquimedes.isPending}
                onClick={() => analisarComArquimedes.mutate({ projectId: projetoId, mode: "analisar" })}
              >
                <Bot size={13} />
                {analisarComArquimedes.isPending ? "Euclides revisando…" : propostaArquimedes ? "Revisar novamente com Euclides" : "Pedir revisão ao Euclides"}
              </button>
            </div>
            <div className="eap-arquimedes-revisao-status">
              <span className="eap-arquimedes-revisao-agente">Agente: {agenteRevisao === "euclides" ? "Euclides · Eng. Revisor de EAP" : agenteRevisao}</span>
              {propostaArquimedes ? (
                <>
                  <CheckCircle2 size={13} />
                  <span>
                    Última revisão: {ultimaRevisaoArquimedes ? new Date(ultimaRevisaoArquimedes).toLocaleString("pt-BR") : "agora"} ·
                    {propostaArquimedes.validation?.valid === false
                      ? " há bloqueios estruturais para tratar."
                      : modoUltimaRevisaoArquimedes === "resolver_bloqueios"
                        ? " proposta de correção gerada."
                        : " análise concluída; proposta aguardando sua decisão."}
                  </span>
                </>
              ) : (
                <>
                  <Info size={13} />
                  <span>Ainda não há uma revisão do Euclides nesta etapa. Faça a revisão técnica depois de editar a EAP.</span>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {enviarEapParaRevisao.error && (
        <div className="xl-aviso-erro" role="alert">
          Envio para revisão: {enviarEapParaRevisao.error.message}
        </div>
      )}

      {editor && (
        <EditorEapPanel
          key={editor.mode === "edit" ? `edit-${editor.nodeId}` : `create-${editor.parentId ?? "root"}`}
          editor={editor}
          nos={nos}
          busy={criarNo.isPending || editarNo.isPending}
          error={criarNo.isError ? criarNo.error.message : editarNo.isError ? editarNo.error.message : null}
          onCancel={() => setEditor(null)}
          onCreate={dados => criarNo.mutate({ projectId: projetoId, ...dados })}
          onUpdate={dados => {
            if (editor.mode !== "edit") return;
            const no = nos.find(n => n.id === editor.nodeId);
            if (!no) return;
            editarNo.mutate({ projectId: projetoId, nodeId: no.id, code: no.code, ...dados });
          }}
        />
      )}

      <div className="eap-arvore" role="tree" aria-label="Estrutura da obra">
        <div className="eap-grid-head" aria-hidden="true">
          <span className="eap-grid-canto" />
          <span className="eap-grid-col" />
          <span className="eap-grid-col">EAP</span>
          <span className="eap-grid-col">ESCOPO / ENTREGÁVEL</span>
          <span className="eap-grid-col">TIPO</span>
          <span className="eap-grid-col">BASE</span>
          <span className="eap-grid-col">REFERÊNCIA</span>
          <span className="eap-grid-col">UN.</span>
          <span className="eap-grid-col">STATUS</span>
        </div>
        {filtrada.map(no => (
          <NoDaArvore
            key={no.no.id}
            ramo={no}
            abertos={busca.trim() ? new Set(nos.map(n => n.id)) : aberto}
            onAlternar={id =>
              setAberto(antigo => {
                const novo = new Set(antigo);
                if (novo.has(id)) novo.delete(id);
                else novo.add(id);
                return novo;
              })
            }
            aoTrazer={id => trazer.mutate({ projectId: projetoId, wbsNodeId: id })}
            aoAdicionar={id => setEditor({ mode: "create", parentId: id })}
            aoEditar={id => setEditor({ mode: "edit", nodeId: id })}
            modoRevisao={modoRevisao}
            jaNoCronograma={jaNoCronograma}
            profundidade={0}
          />
        ))}
        {filtrada.length === 0 && (
          <p className="eap-nada">Nenhum nó corresponde a "{busca}".</p>
        )}
      </div>
    </div>
  );
}

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
          title={`${no.name} · Base de decomposição: ${no.decompositionBasis || "não informada"}`}
        >
          {no.name}
        </span>
        <span className="eap-tipo">{no.nodeType === "grupo" ? "FASE / GRUPO" : no.nodeType === "pacote" ? "SISTEMA / PACOTE" : "ENTREGA"}</span>
        <span className="eap-base">{no.decompositionBasis || "—"}</span>
        <span className="eap-oficial" title={no.externalId ? "Referência externa vinculada posteriormente" : "Sem vínculo com catálogo nesta etapa"}>
          {no.externalId || "—"}
        </span>
        <span className="eap-unidade">{no.unit || "—"}</span>
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
  const [unit, setUnit] = useState(atual?.unit ?? "");
  const [quantity, setQuantity] = useState(atual?.plannedQuantity == null ? "" : String(atual.plannedQuantity));
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
      <div className="eap-editor-campos">
        <label>
          <span>Nome / descrição</span>
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
        <label>
          <span>Unidade</span>
          <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={32} placeholder="ex.: m², m³, un" />
        </label>
        <label>
          <span>Quantidade planejada</span>
          <input type="number" min="0" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Opcional" />
        </label>
        <label><span>Localização</span><input value={location} onChange={e => setLocation(e.target.value)} maxLength={180} placeholder="ex.: Torre A · pavimento 04" /></label>
        <label><span>Responsável</span><input value={responsible} onChange={e => setResponsible(e.target.value)} maxLength={180} placeholder="Responsável pelo pacote" /></label>
        <label><span>Descrição / escopo</span><textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} rows={3} /></label>
        <label><span>Inclusões</span><textarea value={inclusions} onChange={e => setInclusions(e.target.value)} maxLength={5000} rows={2} /></label>
        <label><span>Exclusões</span><textarea value={exclusions} onChange={e => setExclusions(e.target.value)} maxLength={5000} rows={2} /></label>
        <label><span>Critério de aceitação</span><textarea value={acceptanceCriteria} onChange={e => setAcceptanceCriteria(e.target.value)} maxLength={5000} rows={2} /></label>
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
  const revisaoArquimedes = trpc.projects.eapArquimedesReview.useQuery({ projectId: projetoId }, { enabled: projetoId > 0 });
  const analisar = trpc.projects.analisarEapComArquimedes.useMutation({
    onSuccess: async () => {
      await revisaoArquimedes.refetch();
    },
  });
  const aplicarProposta = trpc.projects.aplicarPropostaEap.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const criarRaiz = trpc.projects.createWbsNode.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const gerar = trpc.projects.generateEapFromCatalog.useMutation({
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


