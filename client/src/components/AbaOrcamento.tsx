import { Fragment, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { unitsCompatible } from "@shared/price-sources/reconciliation";
import { PainelCoerenciaEngenharia } from "./PainelCoerenciaEngenharia";
import { PainelConciliacao } from "./PainelConciliacao";
import { PainelValorGanho } from "./PainelValorGanho";
import { PainelMedicao } from "./PainelMedicao";
import { ReadinessGate } from "./ReadinessGate";
import { summarizeBudgetQuantities, summarizeQuantityEvidence } from "./budget-quantity-readiness";

type Props = {
  projetoId: number;
};

type LinhaImportacaoDetalhada = {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  compositionCode?: string;
  officialPriceCode?: string;
  officialCatalogName: string;
  quantityEvidence: string;
  quantityEvidenceStatus: "pendente" | "cenario" | "validada";
};

type ServicoOficialSelecionado = {
  id: number;
  code: string;
  description: string;
  unit: string;
  unitPrice: number | string;
  sourceType: string;
  catalogId: number;
  catalogName: string;
  referencePeriod?: string | null;
  coefficient: string;
};

function moeda(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AbaOrcamento({ projetoId }: Props) {
  const [filtro, setFiltro] = useState<string>("todos");
  const [arquivoDetalhamento, setArquivoDetalhamento] = useState<{ name: string; replacements: Array<{ placeholderCode: string; preservePlaceholder?: boolean; items: LinhaImportacaoDetalhada[] }> } | null>(null);
  const [erroImportacao, setErroImportacao] = useState<string | null>(null);
  const [textoDetalhamento, setTextoDetalhamento] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState({ code: "", description: "", unit: "", quantity: "", unitPrice: "", source: "", quantityEvidence: "", quantityEvidenceStatus: "pendente" as "pendente" | "cenario" | "validada", wbsNodeId: "", compositionId: "", officialPriceItemId: "" });
  const [buscaComposicao, setBuscaComposicao] = useState("");
  const [buscaComposicaoDebounced, setBuscaComposicaoDebounced] = useState("");
  const [buscaServico, setBuscaServico] = useState("");
  const [servicoParaAdicionar, setServicoParaAdicionar] = useState("");
  const [parcela, setParcela] = useState({ servico: "", quantidade: "", evidencia: "" });
  const [componentesServico, setComponentesServico] = useState<ServicoOficialSelecionado[]>([]);
  const utils = trpc.useUtils();

  function prepararDetalhamento(texto: string, nome: string) {
    setArquivoDetalhamento(null);
    setErroImportacao(null);
    try {
      const parsed = JSON.parse(texto) as { partialDetails?: unknown; replacements?: unknown };
      const parcial = Array.isArray(parsed.partialDetails);
      if (parcial && parsed.replacements !== undefined) throw new Error("Escolha um único modo de importação por arquivo.");
      const groups = parcial ? parsed.partialDetails : parsed.replacements;
      if (!Array.isArray(groups) || !groups.length) throw new Error("Informe os pacotes e suas parcelas em partialDetails ou replacements.");
      setArquivoDetalhamento({ name: nome, replacements: (groups as Array<{ placeholderCode: string; preservePlaceholder?: boolean; items: LinhaImportacaoDetalhada[] }>).map(group => ({ ...group, preservePlaceholder: parcial })) });
    } catch (error) {
      setErroImportacao(error instanceof Error ? error.message : "Não foi possível ler o arquivo JSON.");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setBuscaComposicaoDebounced(buscaComposicao.trim()), 300);
    return () => clearTimeout(timer);
  }, [buscaComposicao]);

  const budget = trpc.budgets.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );
  const coerencia = trpc.planning.validateEngineeringCoherence.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0, retry: false, staleTime: 5 * 60_000 }
  );
  const catalogoComposicoes = trpc.catalog.list.useQuery(
    { qCompositions: buscaComposicaoDebounced || undefined, limitCompositions: 50 },
    { enabled: editandoId !== null && buscaComposicaoDebounced.length >= 2, staleTime: 60_000 }
  );
  const catalogoServicos = trpc.catalog.searchOfficialServices.useQuery(
    { q: buscaServico.trim() },
    { enabled: editandoId !== null && buscaServico.trim().length >= 2, staleTime: 60_000 }
  );
  const servicoParcela = catalogoServicos.data?.items.find(service => String(service.id) === parcela.servico);
  const incluirParcela = trpc.budgets.replacePlaceholderItems.useMutation({
    onSuccess: async () => {
      await utils.budgets.list.invalidate({ projectId: Number(projetoId) });
      setParcela({ servico: "", quantidade: "", evidencia: "" });
    },
  });
  const atualizarItem = trpc.budgets.updateItem.useMutation({
    onSuccess: async () => {
      await utils.budgets.list.invalidate({ projectId: Number(projetoId) });
      setEditandoId(null);
    },
  });
  const atualizarStatus = trpc.budgets.updateVersionStatus.useMutation({
    onSuccess: async () => { await utils.budgets.list.invalidate({ projectId: Number(projetoId) }); },
  });
  const criarRevisao = trpc.budgets.createReviewVersion.useMutation({
    onSuccess: async () => { await utils.budgets.list.invalidate({ projectId: Number(projetoId) }); },
  });
  const importarDetalhamento = trpc.budgets.replacePlaceholderItems.useMutation({
    onSuccess: async () => {
      await utils.budgets.list.invalidate({ projectId: Number(projetoId) });
      setArquivoDetalhamento(null);
      setErroImportacao(null);
    },
  });
  const vincularComposicaoMultiservico = trpc.budgets.linkOfficialServiceComposition.useMutation({
    onSuccess: async () => {
      await utils.budgets.list.invalidate({ projectId: Number(projetoId) });
      setEditandoId(null);
      setComponentesServico([]);
    },
  });

  const items = budget.data?.items ?? [];
  const total = budget.data?.total ?? 0;
  const itensComValor = items.filter((i) => Number(i.unitPrice) > 0).length;
  const itensSemValor = items.length - itensComValor;
  const prontidaoQuantitativos = summarizeBudgetQuantities(items.length, itensSemValor);
  const prontidaoEvidencias = summarizeQuantityEvidence(items.map(item => item.quantityEvidenceStatus));
  const itensComFonte = items.filter((i) => Boolean(i.source && !/didatic|rateio uniforme/i.test(String(i.source)))).length;
  const itensComComposicao = items.filter((i) => i.compositionId != null || i.officialPriceItemId != null).length;
  const cobertura = items.length ? Math.round((itensComFonte / items.length) * 100) : 0;
  const statusOrcamento = cobertura === 100 && itensComValor === items.length && itensComComposicao > 0 ? "pronto" : itensComFonte > 0 ? "em_revisao" : "pendente";
  const versaoAtiva = budget.data?.versions?.find((v) => v.id === budget.data?.activeVersionId);
  const statusExibicaoOrcamento = versaoAtiva?.status === "aprovado" ? "aprovado" : statusOrcamento;
  const errosDeEngenharia = (coerencia.data?.issues ?? []).filter((issue) => issue.severity === "error");
  const carregando = budget.isPending;
  const erro = budget.isError;

  const itensFiltrados =
    filtro === "todos"
      ? items
      : items.filter((i) => {
          if (filtro === "com_valor") return Number(i.unitPrice) > 0;
          if (filtro === "sem_valor") return Number(i.unitPrice) === 0;
          return true;
        });

  function iniciarEdicao(item: (typeof items)[number]) {
    atualizarItem.reset();
    const eapNodes = budget.data?.eapNodes ?? [];
    const nodeAtual = item.wbsNodeId != null && eapNodes.some(node => node.id === item.wbsNodeId)
      ? String(item.wbsNodeId)
      : "";
    setEditandoId(item.id);
    setComponentesServico([]);
    setServicoParaAdicionar("");
    setRascunho({
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      source: item.source ?? "",
      quantityEvidence: item.quantityEvidence ?? "",
      quantityEvidenceStatus: (item.quantityEvidenceStatus ?? "pendente") as typeof rascunho.quantityEvidenceStatus,
      wbsNodeId: nodeAtual,
      compositionId: item.compositionId == null ? "" : String(item.compositionId),
      officialPriceItemId: item.officialPriceItemId == null ? "" : String(item.officialPriceItemId),
    });
    setBuscaComposicao(item.compositionNote ?? "");
    setParcela({ servico: "", quantidade: "", evidencia: "" });
    setBuscaServico(item.officialPriceItemId == null ? "" : item.code);
  }

  function adicionarServicoOficial() {
    const selected = catalogoServicos.data?.items.find(service => String(service.id) === servicoParaAdicionar);
    if (!selected || componentesServico.some(component => component.id === selected.id)) return;
    setComponentesServico(current => [...current, {
      id: selected.id,
      code: selected.code,
      description: selected.description,
      unit: selected.unit,
      unitPrice: selected.unitPrice,
      sourceType: selected.sourceType,
      catalogId: selected.catalogId,
      catalogName: selected.catalogName,
      referencePeriod: selected.referencePeriod,
      coefficient: "1",
    }]);
    setServicoParaAdicionar("");
  }

  function salvarComposicaoMultiservico() {
    if (editandoId == null || !componentesServico.length || rascunho.quantityEvidenceStatus === "pendente" || !rascunho.quantityEvidence.trim()) return;
    vincularComposicaoMultiservico.mutate({
      projectId: Number(projetoId),
      budgetItemId: editandoId,
      unit: rascunho.unit,
      quantity: Number(rascunho.quantity),
      quantityEvidence: rascunho.quantityEvidence,
      quantityEvidenceStatus: rascunho.quantityEvidenceStatus,
      components: componentesServico.map(component => ({ officialPriceItemId: component.id, coefficient: Number(component.coefficient) })),
    });
  }

  const precoUnitarioComposto = componentesServico.reduce((sum, component) => sum + Number(component.coefficient || 0) * Number(component.unitPrice), 0);

  function salvarEdicao() {
    if (editandoId == null) return;
    atualizarItem.mutate({
      projectId: Number(projetoId),
      budgetItemId: editandoId,
      code: rascunho.code,
      description: rascunho.description,
      unit: rascunho.unit,
      quantity: Number(rascunho.quantity),
      unitPrice: Number(rascunho.unitPrice),
      source: rascunho.source || null,
      quantityEvidence: rascunho.quantityEvidence || null,
      quantityEvidenceStatus: rascunho.quantityEvidenceStatus,
      ...(rascunho.wbsNodeId ? { wbsNodeId: Number(rascunho.wbsNodeId) } : {}),
      compositionId: rascunho.compositionId ? Number(rascunho.compositionId) : null,
      officialPriceItemId: rascunho.officialPriceItemId ? Number(rascunho.officialPriceItemId) : null,
    });
  }

  const composicoesCandidatas = (catalogoComposicoes.data?.compositions ?? []).filter(
    composition => composition.status === "validada" && composition.sourceCatalogId != null &&
      unitsCompatible(composition.unit, rascunho.unit) &&
      catalogoComposicoes.data?.catalogs.some(row => row.id === composition.sourceCatalogId && row.status === "ativo" && ["SINAPI", "SEINFRA", "SICRO"].includes(row.sourceType))
  );

  return (
    <div className="xl-painel">
      {typeof window !== "undefined" && <ReadinessGate projetoId={projetoId} abrirAba={aba => window.dispatchEvent(new CustomEvent("abrir-aba", { detail: { aba } }))} />}
      <div className="orcamento-hero">
        <div className="orcamento-hero-copy">
          <span className="xl-painel-kicker">CENTRAL DE CUSTOS · ETAPA DE VALIDAÇÃO</span>
          <h1>Orçamento que explica a obra.</h1>
          <p>Vincule cada serviço da EAP a uma composição analítica ou a um serviço oficial de tabela, valide o quantitativo e só então libere o custo para EV, Curva S e controle.</p>
          <div className={`orcamento-status-pill ${statusExibicaoOrcamento}`}><span />{statusExibicaoOrcamento === "aprovado" ? "Orçamento aprovado · quantitativos em cenário" : statusExibicaoOrcamento === "pronto" ? "Preços prontos · quantitativos pendentes de validação" : statusExibicaoOrcamento === "em_revisao" ? "Em revisão técnica" : "Aguardando fonte oficial"}</div>
        </div>
        <div className="orcamento-hero-route"><span>01</span><b>Fonte</b><small>SEINFRA / SINAPI / SICRO</small><i>→</i><span>02</span><b>Composição</b><small>Coeficientes e unidade</small><i>→</i><span>03</span><b>Validação</b><small>Quantidade e BDI</small></div>
      </div>
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">ORÇAMENTO E CUSTOS</span>
          <h2>
            {carregando ? "Lendo orçamento…" : erro ? "Orçamento indisponível" : moeda(total)}
          </h2>
          <p>
            {carregando
              ? "Buscando itens e valores da versão ativa…"
              : erro
                ? "Não foi possível ler o orçamento. Tente novamente."
                : `${items.length} itens — ${itensComValor} com valor, ${itensSemValor} sem valor`}
          </p>
          {!carregando && !erro && versaoAtiva && (
            <p className="xl-painel-versao">
              Versão ativa: v{versaoAtiva.versionNumber} · {versaoAtiva.name}
              {versaoAtiva.status ? ` · ${versaoAtiva.status}` : ""}
            </p>
          )}
          {!carregando && !erro && versaoAtiva?.status === "aprovado" && errosDeEngenharia.length > 0 && (
            <div className="xl-aviso" role="status">
              <strong>Revisão técnica necessária antes de usar este orçamento como controle.</strong>
              <p>{errosDeEngenharia.length} incompatibilidade(s) de engenharia foram identificadas. A aprovação existente foi preservada; corrija em uma nova versão antes de substituir a referência atual.</p>
            </div>
          )}
          {!carregando && !erro && versaoAtiva?.status === "aprovado" && (
            <div className="xl-acoes-versao">
              <button
                type="button"
                className="xl-btn xl-btn-primary"
                disabled={criarRevisao.isPending}
                onClick={() => {
                  if (window.confirm(`Criar uma revisão v${versaoAtiva.versionNumber + 1} copiando os ${items.length} itens atuais? A versão aprovada será preservada e não será alterada.`)) {
                    criarRevisao.mutate({ projectId: Number(projetoId) });
                  }
                }}
              >
                {criarRevisao.isPending ? "Abrindo revisão…" : "Criar revisão para continuar os vínculos"}
              </button>
              {criarRevisao.isError && <p className="xl-aviso xl-aviso-erro" role="alert">{criarRevisao.error.message}</p>}
            </div>
          )}
          {!carregando && !erro && versaoAtiva && versaoAtiva.status !== "aprovado" && versaoAtiva.status !== "arquivado" && (
            <div className="xl-acoes-versao">
              <button type="button" className="xl-btn" disabled={atualizarStatus.isPending} onClick={() => atualizarStatus.mutate({ projectId: Number(projetoId), budgetVersionId: versaoAtiva.id, status: "em_revisao" })}>Enviar para revisão</button>
              <button type="button" className="xl-btn xl-btn-primary" disabled={atualizarStatus.isPending} onClick={() => { if (window.confirm("Aprovar somente se todos os preços e fontes estiverem validados pelo engenheiro.")) atualizarStatus.mutate({ projectId: Number(projetoId), budgetVersionId: versaoAtiva.id, status: "aprovado" }); }}>Aprovar orçamento</button>
            </div>
          )}
          {atualizarStatus.isError && <p className="xl-aviso xl-aviso-erro" role="alert">{atualizarStatus.error.message}</p>}
        </div>
        <div className="xl-filtros">
          <button
            type="button"
            className={`xl-btn ${filtro === "todos" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("todos")}
            disabled={carregando}
          >
            Todos
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "com_valor" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("com_valor")}
            disabled={carregando}
          >
            Com valor
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "sem_valor" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("sem_valor")}
            disabled={carregando}
          >
            Sem valor
          </button>
        </div>
      </div>

      {!carregando && !erro && <section className="orcamento-kpis" aria-label="Prontidão do orçamento">
        <div className="orcamento-kpi"><span>COBERTURA DE FONTE</span><strong>{cobertura}%</strong><small>{itensComFonte} de {items.length} itens sem fonte didática</small><div><i style={{width:`${cobertura}%`}} /></div></div>
        <div className="orcamento-kpi"><span>VÍNCULOS OFICIAIS</span><strong>{itensComComposicao}</strong><small>{items.length - itensComComposicao} itens ainda sem composição ou serviço oficial</small></div>
        <div className="orcamento-kpi"><span>PREÇOS UNITÁRIOS</span><strong>{prontidaoQuantitativos.status}</strong><small>{prontidaoQuantitativos.description}</small></div>
        <div className="orcamento-kpi"><span>EVIDÊNCIA DOS QUANTITATIVOS</span><strong>{prontidaoEvidencias.status}</strong><small>{prontidaoEvidencias.description}</small></div>
      </section>}

      {!carregando && !erro && statusOrcamento !== "pronto" && <section className="orcamento-next-step">
        <div><span className="orcamento-next-icon">!</span><div><b>Próximo passo recomendado</b><strong>{itensComFonte === 0 ? "Importar uma base oficial no Catálogo de Insumos" : itensComComposicao < items.length ? "Completar vínculos oficiais do orçamento" : prontidaoEvidencias.status !== "Validado" ? "Fechar evidência dos quantitativos" : "Revisar itens sem vínculo oficial"}</strong><p>{itensComFonte === 0 ? "Use a tabela oficial compatível com a região da obra; confirme a referência de preço e preserve a versão da base." : itensComComposicao < items.length ? "Associe cada serviço a uma composição ou item oficial compatível por código, unidade e escopo." : prontidaoEvidencias.status !== "Validado" ? "Os preços podem estar aprovados para referência; quantitativos em cenário ou pendentes não são quantidade executiva, medição ou avanço." : "Não aprove por rateio. Cada item precisa de código, unidade e referência rastreáveis por composição ou serviço oficial."}</p></div></div>{itensComFonte === 0 || itensComComposicao < items.length ? <button type="button" className="xl-btn xl-btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("abrir-catalogo"))}>Abrir catálogo →</button> : null}
      </section>}

      {!carregando && !erro && versaoAtiva && versaoAtiva.status !== "aprovado" && versaoAtiva.status !== "arquivado" && <section className="xl-analise" aria-label="Importar detalhamento rastreável">
        <div className="xl-analises-topo">
          <h3>Detalhar itens simbólicos nesta versão</h3>
          <p>Use partialDetails para acrescentar parcelas e manter o pacote pendente, ou replacements para substituir o pacote completo. Cada linha precisa ter vínculo a composição validada ou serviço oficial ativo, unidade compatível e evidência do quantitativo.</p>
        </div>
        <label className="xl-btn" htmlFor="budget-detail-json">Selecionar arquivo JSON</label>
        <input id="budget-detail-json" type="file" accept="application/json,.json" style={{ display: "none" }} onChange={async event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          prepararDetalhamento(await file.text(), file.name);
        }} />
        <label htmlFor="budget-detail-text" className="xl-sr-only">Conteúdo JSON do detalhamento</label>
        <textarea id="budget-detail-text" value={textoDetalhamento} onChange={event => setTextoDetalhamento(event.target.value)} placeholder="Cole aqui o JSON se o seletor de arquivo não estiver disponível" rows={3} />
        <button type="button" className="xl-btn" data-testid="budget-detail-read-pasted" aria-label="Ler JSON colado" disabled={!textoDetalhamento.trim()} onClick={() => prepararDetalhamento(textoDetalhamento, "detalhamento-colado.json")}>Ler JSON colado</button>
        {arquivoDetalhamento && <div role="status" className="xl-aviso">
          <strong>{arquivoDetalhamento.name}: {arquivoDetalhamento.replacements.length} placeholder(s), {arquivoDetalhamento.replacements.reduce((sum, group) => sum + (Array.isArray(group.items) ? group.items.length : 0), 0)} linha(s) detalhada(s).</strong>
          <p>Versão alvo: v{versaoAtiva.versionNumber} · {versaoAtiva.name}. Confirme que códigos, unidades, quantidades e evidências correspondem ao escopo antes de importar.</p>
          <button type="button" className="xl-btn xl-btn-primary" data-testid="budget-detail-import" aria-label="Validar e importar detalhamento na versão atual" disabled={importarDetalhamento.isPending} onClick={() => {
            const parcial = arquivoDetalhamento.replacements.every(group => group.preservePlaceholder);
            const acao = parcial ? "Acrescentar as parcelas e manter os pacotes pendentes" : "Substituir os pacotes pelas linhas detalhadas";
            if (!window.confirm(`${acao} na v${versaoAtiva.versionNumber}?`)) return;
            setErroImportacao(null);
            importarDetalhamento.mutate({ projectId: Number(projetoId), budgetVersionId: versaoAtiva.id, replacements: arquivoDetalhamento.replacements.map(group => group.preservePlaceholder
              ? { partialPlaceholderCode: group.placeholderCode, items: group.items }
              : { placeholderCode: group.placeholderCode, items: group.items }) });
          }}>{importarDetalhamento.isPending ? "Importando…" : "Validar e importar na versão atual"}</button>
        </div>}
        {(erroImportacao || importarDetalhamento.isError) && <p className="xl-aviso xl-aviso-erro" role="alert">{erroImportacao ?? importarDetalhamento.error?.message ?? "Falha ao importar detalhamento."}</p>}
        {importarDetalhamento.isSuccess && <p className="xl-aviso" role="status">Importação concluída: {importarDetalhamento.data.removed} pacote(s) substituído(s), {importarDetalhamento.data.created} parcela(s) incluída(s). A lista será atualizada.</p>}
      </section>}

      {erro && (
        <div className="xl-aviso xl-aviso-erro">
          <strong>O orçamento não carregou.</strong>
          <p>O cronograma continua disponível; só esta leitura falhou.</p>
          <button type="button" className="xl-btn xl-btn-primary" onClick={() => void budget.refetch()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && !erro && items.length === 0 && (
        <div className="xl-aviso">
          <strong>Esta versão do orçamento está vazia.</strong>
          <p>
            Versão nova nasce sem itens: os itens continuam na versão anterior até serem importados
            ou copiados. Enquanto isso, o avanço por valor e a curva financeira ficam sem peso.
          </p>
        </div>
      )}

      <section className="xl-analises">
        <div className="xl-analises-topo">
          <h3>Análises do orçamento</h3>
          <p>
            Cada análise varre composições, vínculos e medições. Elas só rodam quando você abre —
            assim a lista de itens carrega primeiro.
          </p>
        </div>

        <details className="xl-analise">
          <summary>
            <span>Coerência de engenharia</span>
            <small>Quantidade, composição e sequência fora do lugar</small>
          </summary>
          <PainelCoerenciaEngenharia projetoId={projetoId} />
        </details>

        <details className="xl-analise">
          <summary>
            <span>Conciliação atividade ↔ item</span>
            <small>O que está sem vínculo e por que o EVM zera</small>
          </summary>
          <PainelConciliacao projetoId={projetoId} />
        </details>

        <details className="xl-analise">
          <summary>
            <span>Valor ganho (EVM)</span>
            <small>PV, EV, AC, SPI e CPI</small>
          </summary>
          <PainelValorGanho projetoId={projetoId} />
        </details>

        <details className="xl-analise">
          <summary>
            <span>Medição e desembolso</span>
            <small>Executado vira receita; custo vira curva de caixa</small>
          </summary>
          <PainelMedicao projetoId={projetoId} />
        </details>
      </section>

      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Unidade</th>
              <th>Qtd</th>
              <th>Preço unit.</th>
              <th>Total</th>
              <th>Validação</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={7} className="xl-tabela-vazia">
                  Carregando itens…
                </td>
              </tr>
            ) : itensFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="xl-tabela-vazia">
                  {items.length === 0
                    ? "Nenhum item nesta versão do orçamento."
                    : "Nenhum item neste filtro."}
                </td>
              </tr>
            ) : (
              itensFiltrados.map((item) => (<Fragment key={item.id}>
                {editandoId === item.id ? (
                  <tr key={item.id} className={"orcamento-row-active orcamento-edit-row"}>
                    <td colSpan={7}>
                      <div className="orcamento-edit-panel" aria-label={`Editar item ${item.code}`}>
                        <label>Código<input aria-label="Código do item" value={rascunho.code} onChange={e => setRascunho({ ...rascunho, code: e.target.value })} /></label>
                        <label className="orcamento-edit-wide">Descrição<input aria-label="Descrição do item" value={rascunho.description} onChange={e => setRascunho({ ...rascunho, description: e.target.value })} /></label>
                        <label>Unidade<input aria-label="Unidade do item" value={rascunho.unit} onChange={e => setRascunho({ ...rascunho, unit: e.target.value })} /></label>
                        <label>Quantidade<input aria-label="Quantidade do item" type="number" min="0.001" step="0.001" value={rascunho.quantity} onChange={e => setRascunho({ ...rascunho, quantity: e.target.value })} /></label>
                        <label>Preço unitário<input aria-label="Preço unitário do item" type="number" min="0" step="0.01" value={rascunho.unitPrice} onChange={e => setRascunho({ ...rascunho, unitPrice: e.target.value })} /></label>
                        <label className="orcamento-edit-wide">Fonte do preço<input aria-label="Fonte do item" value={rascunho.source} onChange={e => setRascunho({ ...rascunho, source: e.target.value })} /></label>
                        <label className="orcamento-edit-wide">Evidência do quantitativo<textarea aria-label="Evidência do quantitativo" value={rascunho.quantityEvidence} onChange={e => setRascunho({ ...rascunho, quantityEvidence: e.target.value })} placeholder="Prancha, revisão, pavimento, memória de cálculo ou referência rastreável" maxLength={2000} /></label>
                        <label>Situação do quantitativo<select aria-label="Situação do quantitativo" value={rascunho.quantityEvidenceStatus} onChange={e => setRascunho({ ...rascunho, quantityEvidenceStatus: e.target.value as typeof rascunho.quantityEvidenceStatus })}><option value="pendente">Pendente</option><option value="cenario">Cenário de planejamento</option><option value="validada">Validada</option></select></label>
                        <label className="orcamento-edit-wide" htmlFor={`item-eap-${item.id}`}>
                          Pacote EAP associado
                          <select id={`item-eap-${item.id}`} aria-label="Pacote EAP associado" value={rascunho.wbsNodeId} onChange={e => setRascunho({ ...rascunho, wbsNodeId: e.target.value })}>
                            <option value="">{item.wbsNodeId == null ? "Sem vínculo com a EAP atual" : `Vínculo antigo: ${item.wbsCode ?? `nó #${item.wbsNodeId}`} — selecione uma folha atual`}</option>
                            {(budget.data?.eapNodes ?? []).map(node => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}
                          </select>
                        </label>
                        {item.wbsNodeId != null && !budget.data?.eapNodes.some(node => node.id === item.wbsNodeId) && !rascunho.wbsNodeId && (
                          <p className="orcamento-edit-feedback orcamento-edit-wide" role="status">
                            Este item ainda aponta para {item.wbsCode ? `a folha ${item.wbsCode} da EAP anterior` : "uma versão anterior da EAP"}. Associe a folha vigente para habilitar a conciliação com o cronograma.
                          </p>
                        )}
                        <label className="orcamento-edit-search orcamento-edit-wide" htmlFor={`composicao-busca-${item.id}`}>
                          Buscar composição oficial por código ou descrição
                          <input id={`composicao-busca-${item.id}`} aria-label="Buscar composição oficial" value={buscaComposicao} onChange={e => setBuscaComposicao(e.target.value)} placeholder="Digite código ou serviço SINAPI/SEINFRA/SICRO (mínimo 2 caracteres)" />
                        </label>
                        <label className="orcamento-edit-wide" htmlFor={`composicao-selecao-${item.id}`}>
                          Composição analítica vinculada
                          <select id={`composicao-selecao-${item.id}`} aria-label="Composição analítica vinculada" value={rascunho.compositionId} onChange={e => setRascunho({ ...rascunho, compositionId: e.target.value, officialPriceItemId: "" })} disabled={catalogoComposicoes.isFetching}>
                            <option value="">Sem composição oficial</option>
                            {rascunho.compositionId && !composicoesCandidatas.some(composition => String(composition.id) === rascunho.compositionId) && <option value={rascunho.compositionId}>Composição atual #{rascunho.compositionId}</option>}
                            {composicoesCandidatas.map(composition => {
                              const catalog = catalogoComposicoes.data?.catalogs.find(row => row.id === composition.sourceCatalogId);
                              return <option key={composition.id} value={composition.id}>{composition.code} · {composition.description} ({composition.unit}) · {catalog?.sourceType ?? "base oficial"} · {composition.referencePeriod ?? catalog?.referencePeriod ?? "sem referência"}</option>;
                            })}
                          </select>
                        </label>
                        <div className="orcamento-edit-feedback" role="status" aria-live="polite">
                          {buscaComposicaoDebounced.length < 2 && <span>Digite pelo menos 2 caracteres para pesquisar no catálogo oficial.</span>}
                          {buscaComposicaoDebounced.length >= 2 && catalogoComposicoes.isFetching && <span>Buscando composições oficiais…</span>}
                          {buscaComposicaoDebounced.length >= 2 && catalogoComposicoes.isError && <span className="orcamento-edit-error">Não foi possível consultar o catálogo. Tente novamente.</span>}
                          {buscaComposicaoDebounced.length >= 2 && catalogoComposicoes.isSuccess && !catalogoComposicoes.isFetching && composicoesCandidatas.length === 0 && <span>Nenhuma composição oficial validada foi encontrada para esse termo e unidade.</span>}
                          {rascunho.compositionId && <span>Ao salvar, o preço unitário será calculado pelos coeficientes e preços rastreados da composição.</span>}
                        </div>
                        <label className="orcamento-edit-search orcamento-edit-wide" htmlFor={`servico-oficial-busca-${item.id}`}>
                          Vincular serviço oficial da tabela (preço unitário da própria SEINFRA/SINAPI/SICRO)
                          <input id={`servico-oficial-busca-${item.id}`} aria-label="Buscar serviço oficial de tabela" value={buscaServico} onChange={e => { setBuscaServico(e.target.value); setServicoParaAdicionar(""); }} placeholder="Busque por código ou descrição (mínimo 2 caracteres)" />
                        </label>
                        <label className="orcamento-edit-wide" htmlFor={`servico-oficial-selecao-${item.id}`}>
                          Serviço oficial vinculado
                          <select id={`servico-oficial-selecao-${item.id}`} aria-label="Serviço oficial vinculado" value={rascunho.officialPriceItemId} onChange={e => setRascunho({ ...rascunho, officialPriceItemId: e.target.value, compositionId: "" })} disabled={catalogoServicos.isFetching}>
                            <option value="">Sem serviço oficial direto</option>
                            {rascunho.officialPriceItemId && !catalogoServicos.data?.items.some(service => String(service.id) === rascunho.officialPriceItemId) && <option value={rascunho.officialPriceItemId}>Serviço oficial atual #{rascunho.officialPriceItemId}</option>}
                            {(catalogoServicos.data?.items ?? []).filter(service => unitsCompatible(service.unit, rascunho.unit)).map(service => (
                              <option key={service.id} value={service.id}>{service.code} · {service.description} ({service.unit}) · {service.sourceType} · {service.referencePeriod ?? "sem referência"} · R$ {Number(service.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>
                            ))}
                          </select>
                        </label>
                        <div className="orcamento-edit-feedback" role="status" aria-live="polite">
                          {buscaServico.trim().length >= 2 && catalogoServicos.isFetching && <span>Buscando serviços oficiais…</span>}
                          {buscaServico.trim().length >= 2 && catalogoServicos.isError && <span className="orcamento-edit-error">Não foi possível consultar serviços oficiais. Tente novamente.</span>}
                          {buscaServico.trim().length >= 2 && catalogoServicos.isSuccess && !catalogoServicos.isFetching && (catalogoServicos.data?.items ?? []).filter(service => unitsCompatible(service.unit, rascunho.unit)).length === 0 && <span>Nenhum serviço oficial ativo encontrado para esse termo e unidade.</span>}
                          {rascunho.officialPriceItemId && <span>O preço e a referência vêm diretamente da linha oficial; composição analítica fica desvinculada.</span>}
                        </div>
                        {versaoAtiva && item.unit.trim().toLowerCase() === "vb" &&
                          Number(item.quantity) === 1 && Number(item.unitPrice) === 1 &&
                          !item.officialPriceItemId && !item.compositionId && /simb[oó]lic|placeholder/i.test(item.source ?? "") &&
                          <section className="orcamento-edit-wide" aria-label="Detalhar parcela do pacote">
                            <strong>Acrescentar uma parcela ao pacote</strong>
                            <p>Pesquise o serviço acima. A parcela usa a unidade e o preço da tabela e mantém o pacote aberto para o restante do escopo.</p>
                            <label>Serviço da parcela<select value={parcela.servico} onChange={e => setParcela({ ...parcela, servico: e.target.value })}>
                              <option value="">Selecione um serviço</option>
                              {catalogoServicos.data?.items.map(service => <option key={service.id} value={service.id}>{service.code} · {service.description} · {service.unit} · {service.catalogName} · R$ {service.unitPrice}</option>)}
                            </select></label>
                            <label>Quantidade da parcela {servicoParcela && `(${servicoParcela.unit})`}<input type="number" min="0.001" step="0.001" value={parcela.quantidade} onChange={e => setParcela({ ...parcela, quantidade: e.target.value })} /></label>
                            <label>Origem da quantidade<textarea maxLength={2000} value={parcela.evidencia} onChange={e => setParcela({ ...parcela, evidencia: e.target.value })} placeholder="Prancha, revisão e trecho medido" /></label>
                            <button type="button" className="xl-btn" disabled={!servicoParcela || Number(parcela.quantidade) < 0.001 || !parcela.evidencia.trim() || incluirParcela.isPending}
                              onClick={() => {
                                if (!servicoParcela) return;
                                incluirParcela.mutate({ projectId: Number(projetoId), budgetVersionId: versaoAtiva.id, replacements: [{
                                  partialPlaceholderCode: item.code, items: [{
                                    code: `${item.code}.PR.${servicoParcela.code}`, description: servicoParcela.description.slice(0, 240),
                                    officialPriceCode: servicoParcela.code, officialCatalogName: servicoParcela.catalogName,
                                    unit: servicoParcela.unit, quantity: Number(parcela.quantidade), quantityEvidence: parcela.evidencia.trim(), quantityEvidenceStatus: "cenario",
                                  }],
                                }] });
                              }}>Incluir parcela de cenário</button>
                            {incluirParcela.isError && <p role="alert">{incluirParcela.error.message}</p>}
                            {incluirParcela.isSuccess && <p role="status">Parcela incluída no orçamento.</p>}
                          </section>}
                        <section className="orcamento-multiservico orcamento-edit-wide" aria-label="Composição por múltiplos serviços oficiais">
                          <div className="orcamento-multiservico-heading">
                            <strong>Compor este pacote com vários serviços SEINFRA/SINAPI/SICRO</strong>
                            <span>Coeficiente de cada serviço por 1 {rascunho.unit || "unidade de saída"} do item. A soma forma o preço unitário.{componentesServico.length > 0 ? ` Base: ${componentesServico[0]!.catalogName} · ${componentesServico[0]!.referencePeriod ?? "sem período"}.` : ""}</span>
                          </div>
                          <div className="orcamento-multiservico-add">
                            <select aria-label="Serviço oficial para adicionar à composição" value={servicoParaAdicionar} onChange={event => setServicoParaAdicionar(event.target.value)} disabled={(catalogoServicos.data?.items.length ?? 0) === 0}>
                              <option value="">Busque acima para escolher um serviço</option>
                              {(catalogoServicos.data?.items ?? []).filter(service => service.itemType === "servico" && (!componentesServico.length || service.catalogId === componentesServico[0]!.catalogId) && !componentesServico.some(component => component.id === service.id)).map(service => (
                                <option key={service.id} value={service.id}>{service.code} · {service.description} ({service.unit}) · {service.sourceType} · R$ {Number(service.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>
                              ))}
                            </select>
                            <button type="button" className="xl-btn" onClick={adicionarServicoOficial} disabled={!servicoParaAdicionar}>Adicionar serviço</button>
                          </div>
                          {componentesServico.length > 0 && <div className="orcamento-multiservico-list">
                            {componentesServico.map(component => (
                              <div className="orcamento-multiservico-row" key={component.id}>
                                <div><strong>{component.code} · {component.description}</strong><span>{component.sourceType} · {component.unit} · {moeda(Number(component.unitPrice))} por {component.unit}</span></div>
                                <label>Coeficiente por {rascunho.unit || "un"}<input type="number" min="0.000001" step="0.000001" value={component.coefficient} onChange={event => setComponentesServico(current => current.map(row => row.id === component.id ? { ...row, coefficient: event.target.value } : row))} /></label>
                                <strong>{moeda(Number(component.coefficient) * Number(component.unitPrice))}</strong>
                                <button type="button" className="xl-btn" aria-label={`Remover ${component.code}`} onClick={() => setComponentesServico(current => current.filter(row => row.id !== component.id))}>Remover</button>
                              </div>
                            ))}
                            <div className="orcamento-multiservico-total"><span>Preço composto por {rascunho.unit || "un"}</span><strong>{moeda(precoUnitarioComposto)}</strong><span>Total do item: {moeda(precoUnitarioComposto * Number(rascunho.quantity || 0))}</span></div>
                          </div>}
                          {vincularComposicaoMultiservico.error && <p className="orcamento-edit-error" role="alert">{vincularComposicaoMultiservico.error.message}</p>}
                          <p className="orcamento-multiservico-note">O vínculo registra uma composição analítica QA com as linhas oficiais, coeficientes, preços de referência e evidência do quantitativo.</p>
                          <button type="button" className="xl-btn xl-btn-primary" onClick={salvarComposicaoMultiservico} disabled={!componentesServico.length || !rascunho.unit || !Number(rascunho.quantity) || !rascunho.quantityEvidence.trim() || rascunho.quantityEvidenceStatus === "pendente" || vincularComposicaoMultiservico.isPending}>
                            {vincularComposicaoMultiservico.isPending ? "Salvando composição…" : `Vincular composição de ${componentesServico.length} serviço(s)`}
                          </button>
                        </section>
                        <div className="orcamento-edit-actions">
                          <button type="button" className="xl-btn xl-btn-primary" onClick={salvarEdicao} disabled={atualizarItem.isPending}>{atualizarItem.isPending ? "Salvando…" : "Salvar"}</button>
                          <button type="button" className="xl-btn" onClick={() => setEditandoId(null)}>Cancelar</button>
                        </div>
                        {atualizarItem.isError && <p className="xl-aviso xl-aviso-erro" role="alert">{atualizarItem.error.message}</p>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id}>
                    <td>{item.code}</td>
                    <td>{item.description}</td>
                    <td>{item.unit}</td>
                    <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                    <td>{moeda(Number(item.unitPrice))}</td>
                    <td>{moeda(Number(item.quantity) * Number(item.unitPrice))}</td>
                    <td><span className={`orcamento-row-status ${(item.compositionId != null || item.officialPriceItemId != null) && !/didatic|rateio uniforme/i.test(String(item.source ?? "")) ? "ok" : "warn"}`}>{item.officialPriceItemId != null ? "Serviço oficial rastreado" : item.compositionId != null && /composição analítica QA/i.test(String(item.source ?? "")) ? "Composição QA rastreada" : item.compositionId != null && !/didatic|rateio uniforme/i.test(String(item.source ?? "")) ? "Composição validável" : /didatic|rateio uniforme/i.test(String(item.source ?? "")) ? "Fonte didática" : "Vínculo pendente"}</span><button type="button" className="xl-btn" onClick={() => setDetalheId(detalheId === item.id ? null : item.id)}>{detalheId === item.id ? "Fechar" : "Detalhes"}</button><button type="button" className="xl-btn" onClick={() => iniciarEdicao(item)}>Editar</button></td>
                  </tr>
                )}
                {detalheId === item.id && editandoId !== item.id && <tr key={`${item.id}-detail`} className="orcamento-detail-row"><td colSpan={7}><div><b>Diagnóstico do item</b><span>Fonte do preço: {item.source || "não informada"} · Referência: {item.referencePeriod || "não informada"} · Serviço oficial: {item.officialPriceItemId ? `#${item.officialPriceItemId}` : "não vinculado"} · Composição: {item.compositionId ? `#${item.compositionId}` : "não vinculada"}</span><span>Quantitativo: {item.quantityEvidenceStatus ?? "pendente"} · Evidência: {item.quantityEvidence || "não informada"}</span><small>{item.quantityEvidenceStatus === "cenario" ? "Cenário de planejamento; não representa medição ou execução." : item.quantityEvidenceStatus === "validada" ? "Evidência classificada como validada; confirme a documentação antes do uso executivo." : "Informe a referência e classifique o quantitativo antes de aprovar o orçamento."}</small></div></td></tr>}
              </Fragment>))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
