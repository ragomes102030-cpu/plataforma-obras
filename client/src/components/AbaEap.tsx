import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Bot, Check, CheckCircle2, FileText, LockKeyhole, Maximize2, Minimize2, PackageCheck, Pencil, Plus, Search, X } from "lucide-react";
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
  const [controleAberto, setControleAberto] = useState(true);\n  const [densidade, setDensidade] = useState<"compacta" | "normal" | "confortavel">("normal");

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
  const eapProntaParaAprovacao = Boolean(validacao.data?.valid) &&
    folhasSemDicionario.length === 0 && folhasSemQuantidade.length === 0 &&
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
  const analisarComArquimedes = trpc.projects.analisarEapComArquimedes.useMutation();
  const abrirAgente = () => window.dispatchEvent(new CustomEvent("abrir-agente-eap"));


  if (wbs.isPending) {
    return <div className="xl-vazia-folha"><h3>Carregando a estrutura…</h3></div>;
  }

  if (nos.length === 0) {
    return <EapVazia projetoId={projetoId} />;
  }

  const total = nos.length;
  const grupos = nos.filter(n => n.nodeType === "grupo").length;
  const folhas = nos.filter(n => n.nodeType === "entrega").length;

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
        <div className="eap-toolbar-acoes">\n          <div className="eap-zoom" role="group" aria-label="Densidade da EAP">\n            <span>Densidade</span>\n            <button type="button" className={densidade === "compacta" ? "ativo" : ""} onClick={() => setDensidade("compacta")} title="Mais linhas visíveis">80%</button>\n            <button type="button" className={densidade === "normal" ? "ativo" : ""} onClick={() => setDensidade("normal")} title="Densidade padrão">100%</button>\n            <button type="button" className={densidade === "confortavel" ? "ativo" : ""} onClick={() => setDensidade("confortavel")} title="Linhas mais espaçosas">115%</button>\n          </div>
          <button type="button" className="eap-tool-btn" onClick={recolherTudo}><Minimize2 size={14} /> Recolher</button>
          <button type="button" className="eap-tool-btn" onClick={expandirTudo}><Maximize2 size={14} /> Expandir</button>
          <button type="button" className="eap-tool-btn" onClick={() => setEditor({ mode: "create", parentId: null })}><Plus size={14} /> Novo nível</button>
          <button
            type="button"
            className="eap-tool-btn eap-tool-agent"
            disabled={analisarComArquimedes.isPending}
            onClick={() => analisarComArquimedes.mutate({ projectId: projetoId })}
          >
            <Bot size={14} /> {analisarComArquimedes.isPending ? "Arquimedes analisando…" : "Analisar com Arquimedes"}
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

      {analisarComArquimedes.data && (
        <div className="eap-validacao" role="status" aria-live="polite">
          <div className="eap-validacao-cabecalho">
            <div>
              <strong>Arquimedes · revisão da EAP</strong>
              <span>{analisarComArquimedes.data.proposal.nodes.length} proposta(s) · {analisarComArquimedes.data.proposal.missingInformation.length} informação(ões) pendente(s)</span>
            </div>
            <span className="eap-validacao-ok"><Bot size={14} /> Proposta não aplicada</span>
          </div>
          {analisarComArquimedes.data.proposal.basis.length > 0 && (
            <div className="eap-validacao-lista">
              <div className="eap-validacao-item eap-validacao-warning"><span>BASE</span><p>{analisarComArquimedes.data.proposal.basis.join(" · ")}</p></div>
            </div>
          )}
          {analisarComArquimedes.data.proposal.nodes.slice(0, 8).map((item, index) => (
            <div key={index} className="eap-validacao-item eap-validacao-warning">
              <span>{item.operation.toUpperCase()}</span>
              <p><strong>{item.parentCode ? item.parentCode + " · " : ""}{item.name}</strong> — {item.rationale}</p>
            </div>
          ))}
          {analisarComArquimedes.data.proposal.missingInformation.length > 0 && (
            <small>Faltam dados: {analisarComArquimedes.data.proposal.missingInformation.join(" · ")}</small>
          )}
        </div>
      )}
      {analisarComArquimedes.error && (
        <div className="xl-aviso-erro" role="alert">Arquimedes: {analisarComArquimedes.error.message}</div>
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
            <div className={`eap-controle-card ${folhasSemQuantidade.length ? "atencao" : "ok"}`}><span>Controle quantitativo</span><strong>{folhasEap.length - folhasSemQuantidade.length}/{folhasEap.length}</strong><small>{folhasSemQuantidade.length ? `${folhasSemQuantidade.length} sem unidade/quantidade` : "Unidade e quantidade informadas"}</small></div>
            <div className={`eap-controle-card ${pacotesTrabalho.length ? "ok" : "atencao"}`}><span>Pacotes de trabalho</span><strong>{pacotesTrabalho.length}</strong><small>Folhas terminais controláveis</small></div>
            <div className={`eap-controle-card ${validacao.data?.valid ? "ok" : "atencao"}`}><span>Critérios de parada</span><strong>{validacao.data?.valid ? "OK" : "REVISAR"}</strong><small>Sem bloqueios estruturais</small></div>
          </div>
          <div className="eap-parada">
            <div><strong>Quando parar a decomposição</strong><span>Parar quando o escopo estiver claro, a unidade de controle definida, a responsabilidade e a medição atribuíveis e o pacote puder virar atividade sem alterar o escopo.</span></div>
            <div><strong>Quando continuar</strong><span>Continuar quando houver mistura de localização, entregáveis, responsáveis, métodos, quantidades ou trabalhos que precisem ser controlados separadamente.</span></div>
          </div>
          <div className="eap-baseline">
            <div className="eap-baseline-info"><LockKeyhole size={16} /><div><strong>Baseline da EAP</strong><span>{versoes.data?.[0] ? `Versão v${versoes.data[0].versionNumber} · ${versoes.data[0].status}${versoes.data[0].approvedAt ? ` · aprovada em ${new Date(versoes.data[0].approvedAt).toLocaleString("pt-BR")}` : ""}` : "Ainda não existe versão do plano."}</span></div></div>
            <button type="button" className="eap-btn" disabled={!podeAprovarEap} title={coordenador.data?.stage !== "EAP_REVISAO" ? "A aprovação da EAP ocorre na etapa EAP_REVISAO." : "Aprova a EAP e congela a versão do plano como baseline."} onClick={() => {
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
            title="Apaga a estrutura gerada e refaz a partir do catálogo. Atividades e versão de orçamento criadas à mão são preservadas."
            onClick={() => {
              const ok = window.confirm(
                "Refazer a EAP?\n\n" +
                  "A estrutura gerada pelo catálogo é apagada e refeita. " +
                  "As atividades do cronograma e a versão de orçamento são apagadas junto, " +
                  "porque nasceram dela. Uma versão de orçamento criada à mão é preservada."
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

      <div className="eap-validacao" role="status" aria-live="polite">
        <div className="eap-validacao-cabecalho">
          <div>
            <strong>Validação da estrutura</strong>
            <span>
              {validacao.isPending
                ? "Analisando cobertura, exclusividade e prontidão…"
                : validacao.data
                  ? `${validacao.data.summary.nodes} nós · ${validacao.data.summary.leaves} folhas · ${validacao.data.summary.errors} bloqueios · ${validacao.data.summary.warnings} alertas`
                  : "Validação indisponível"}
            </span>
          </div>
          {validacao.data?.valid ? (
            <span className="eap-validacao-ok"><CheckCircle2 size={14} /> Estrutura sem bloqueios</span>
          ) : validacao.data ? (
            <span className="eap-validacao-erro"><AlertTriangle size={14} /> Revisão necessária</span>
          ) : null}
        </div>
        {!!validacao.data?.issues.length && (
          <div className="eap-validacao-lista">
            {validacao.data.issues.slice(0, 6).map((issue, index) => (
              <div key={`${issue.code}-${issue.entityRef ?? "obra"}-${index}`} className={`eap-validacao-item eap-validacao-${issue.severity}`}>
                <span>{issue.severity === "error" ? "BLOQUEIO" : "ATENÇÃO"}</span>
                <p>{issue.message}</p>
              </div>
            ))}
            {validacao.data.issues.length > 6 && (
              <small>+ {validacao.data.issues.length - 6} apontamentos. O Arquimedes poderá detalhar os nós afetados.</small>
            )}
          </div>
        )}
      </div>

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
          <span className="eap-grid-col">SERVIÇO / DESCRIÇÃO</span>
          <span className="eap-grid-col">TIPO</span>
          <span className="eap-grid-col">BASE</span>
          <span className="eap-grid-col">SEINFRA</span>
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
  jaNoCronograma,
  profundidade,
}: {
  ramo: Ramo;
  abertos: Set<number>;
  onAlternar: (id: number) => void;
  aoTrazer: (id: number) => void;
  aoAdicionar: (id: number) => void;
  aoEditar: (id: number) => void;
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
        <span className="eap-oficial" title={no.externalId ? "Código oficial do serviço na base de preços" : "Sem vínculo direto com código SEINFRA"}>
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
          <span className="eap-acoes-linha">
            {no.nodeType !== "entrega" && (
              <button type="button" className="eap-acao-linha" onClick={() => aoAdicionar(no.id)} title="Adicionar filho">
                <Plus size={12} />
              </button>
            )}
            <button type="button" className="eap-acao-linha" onClick={() => aoEditar(no.id)} title="Editar item">
              <Pencil size={12} />
            </button>
          </span>
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
  const criarRaiz = trpc.projects.createWbsNode.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const gerar = trpc.projects.generateEapFromCatalog.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const [tipo, setTipo] = useState<"edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos">("edificio");

  return (
    <div className="xl-vazia-folha">
      <h3>Esta obra ainda não tem EAP</h3>
      <p className="xl-vazia-falta">
        Comece pelo escopo. A EAP canônica nasce da entrega que a obra precisa
        produzir e é refinada em sistemas, componentes e pacotes de trabalho.
        O catálogo fica como apoio para códigos, unidades e preços.
      </p>
      <div className="eap-acoes">
        <button
          type="button"
          className="eap-btn"
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
          {criarRaiz.isPending ? "Criando raiz…" : "Começar pelo escopo"}
        </button>

        <select
          className="eap-select"
          value={tipo}
          onChange={e => setTipo(e.target.value as typeof tipo)}
        >
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
        >
          {gerar.isPending ? "Preparando sugestão…" : "Importar sugestão do catálogo"}
        </button>
      </div>
      {criarRaiz.isError && <p className="eap-erro">{criarRaiz.error.message}</p>}
      {gerar.isError && <p className="eap-erro">{gerar.error.message}</p>}
      {gerar.isSuccess && (
        <p className="eap-ok">
          {gerar.data.semeadura.nosCriados} nós criados como sugestão a partir de{" "}
          {gerar.data.semeadura.servicosUsados} serviços do catálogo.
        </p>
      )}
    </div>
  );
}
