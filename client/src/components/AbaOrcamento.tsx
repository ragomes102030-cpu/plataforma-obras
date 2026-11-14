import { Fragment, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { unitsCompatible } from "@shared/price-sources/reconciliation";
import { PainelCoerenciaEngenharia } from "./PainelCoerenciaEngenharia";
import { PainelConciliacao } from "./PainelConciliacao";
import { PainelValorGanho } from "./PainelValorGanho";
import { PainelMedicao } from "./PainelMedicao";
import { ReadinessGate } from "./ReadinessGate";
import { summarizeBudgetQuantities } from "./budget-quantity-readiness";

type Props = {
  projetoId: number;
};

function moeda(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AbaOrcamento({ projetoId }: Props) {
  const [filtro, setFiltro] = useState<string>("todos");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState({ code: "", description: "", unit: "", quantity: "", unitPrice: "", source: "", quantityEvidence: "", quantityEvidenceStatus: "pendente" as "pendente" | "cenario" | "validada", compositionId: "" });
  const [buscaComposicao, setBuscaComposicao] = useState("");
  const [buscaComposicaoDebounced, setBuscaComposicaoDebounced] = useState("");
  const utils = trpc.useUtils();

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
  const atualizarItem = trpc.budgets.updateItem.useMutation({
    onSuccess: async () => {
      await utils.budgets.list.invalidate({ projectId: Number(projetoId) });
      setEditandoId(null);
    },
  });
  const atualizarStatus = trpc.budgets.updateVersionStatus.useMutation({
    onSuccess: async () => { await utils.budgets.list.invalidate({ projectId: Number(projetoId) }); },
  });

  const items = budget.data?.items ?? [];
  const total = budget.data?.total ?? 0;
  const itensComValor = items.filter((i) => Number(i.unitPrice) > 0).length;
  const itensSemValor = items.length - itensComValor;
  const prontidaoQuantitativos = summarizeBudgetQuantities(items.length, itensSemValor);
  const itensComFonte = items.filter((i) => Boolean(i.source && !/didatic|rateio uniforme/i.test(String(i.source)))).length;
  const itensComComposicao = items.filter((i) => i.compositionId != null).length;
  const cobertura = items.length ? Math.round((itensComFonte / items.length) * 100) : 0;
  const statusOrcamento = cobertura === 100 && itensComValor === items.length && itensComComposicao > 0 ? "pronto" : itensComFonte > 0 ? "em_revisao" : "pendente";

  const versaoAtiva = budget.data?.versions?.find((v) => v.id === budget.data?.activeVersionId);
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
    setEditandoId(item.id);
    setRascunho({
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      source: item.source ?? "",
      quantityEvidence: item.quantityEvidence ?? "",
      quantityEvidenceStatus: (item.quantityEvidenceStatus ?? "pendente") as typeof rascunho.quantityEvidenceStatus,
      compositionId: item.compositionId == null ? "" : String(item.compositionId),
    });
    setBuscaComposicao(item.compositionNote ?? "");
  }

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
      compositionId: rascunho.compositionId ? Number(rascunho.compositionId) : null,
    });
  }

  const composicoesCandidatas = (catalogoComposicoes.data?.compositions ?? []).filter(
    composition => composition.status === "validada" && composition.sourceCatalogId != null &&
      unitsCompatible(composition.unit, rascunho.unit) &&
      catalogoComposicoes.data?.catalogs.some(row => row.id === composition.sourceCatalogId && row.status === "ativo" && ["SINAPI", "SEINFRA"].includes(row.sourceType))
  );

  return (
    <div className="xl-painel">
      {typeof window !== "undefined" && <ReadinessGate projetoId={projetoId} abrirAba={aba => window.dispatchEvent(new CustomEvent("abrir-aba", { detail: { aba } }))} />}
      <div className="orcamento-hero">
        <div className="orcamento-hero-copy">
          <span className="xl-painel-kicker">CENTRAL DE CUSTOS · ETAPA DE VALIDAÇÃO</span>
          <h1>Orçamento que explica a obra.</h1>
          <p>Conecte cada serviço da EAP a uma composição oficial, valide o quantitativo e só então libere o custo para EV, Curva S e controle.</p>
          <div className={`orcamento-status-pill ${statusOrcamento}`}><span />{statusOrcamento === "pronto" ? "Pronto para aprovação" : statusOrcamento === "em_revisao" ? "Em revisão técnica" : "Aguardando fonte oficial"}</div>
        </div>
        <div className="orcamento-hero-route"><span>01</span><b>Fonte</b><small>SEINFRA / SINAPI</small><i>→</i><span>02</span><b>Composição</b><small>Coeficientes e unidade</small><i>→</i><span>03</span><b>Validação</b><small>Quantidade e BDI</small></div>
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
        <div className="orcamento-kpi"><span>COMPOSIÇÕES VINCULADAS</span><strong>{itensComComposicao}</strong><small>{items.length - itensComComposicao} itens ainda dependem de composição</small></div>
        <div className="orcamento-kpi"><span>PREÇOS UNITÁRIOS</span><strong>{prontidaoQuantitativos.status}</strong><small>{prontidaoQuantitativos.description}</small></div>
      </section>}

      {!carregando && !erro && statusOrcamento !== "pronto" && <section className="orcamento-next-step">
        <div><span className="orcamento-next-icon">!</span><div><b>Próximo passo recomendado</b><strong>{itensComFonte === 0 ? "Importar uma base oficial no Catálogo de Insumos" : "Revisar os itens sem composição oficial"}</strong><p>{itensComFonte === 0 ? "Use SEINFRA-CE para Fortaleza. O sistema valida o arquivo antes de gravar e preserva a versão da tabela." : "Não aprove por rateio. Cada item precisa de código, unidade, referência e composição compatíveis."}</p></div></div><button type="button" className="xl-btn xl-btn-primary" onClick={() => window.dispatchEvent(new CustomEvent("abrir-catalogo"))}>Abrir catálogo →</button>
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
                        <label className="orcamento-edit-search orcamento-edit-wide" htmlFor={`composicao-busca-${item.id}`}>
                          Buscar composição oficial por código ou descrição
                          <input id={`composicao-busca-${item.id}`} aria-label="Buscar composição oficial" value={buscaComposicao} onChange={e => setBuscaComposicao(e.target.value)} placeholder="Digite código ou serviço SINAPI/SEINFRA (mínimo 2 caracteres)" />
                        </label>
                        <label className="orcamento-edit-wide" htmlFor={`composicao-selecao-${item.id}`}>
                          Composição oficial vinculada
                          <select id={`composicao-selecao-${item.id}`} aria-label="Composição oficial vinculada" value={rascunho.compositionId} onChange={e => setRascunho({ ...rascunho, compositionId: e.target.value })} disabled={buscaComposicaoDebounced.length < 2 || catalogoComposicoes.isFetching}>
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
                        <div className="orcamento-edit-actions">
                          <button type="button" className="xl-btn xl-btn-primary" onClick={salvarEdicao} disabled={atualizarItem.isPending}>Salvar</button>
                          <button type="button" className="xl-btn" onClick={() => setEditandoId(null)}>Cancelar</button>
                        </div>
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
                    <td><span className={`orcamento-row-status ${item.compositionId != null && !/didatic|rateio uniforme/i.test(String(item.source ?? "")) ? "ok" : "warn"}`}>{item.compositionId != null && !/didatic|rateio uniforme/i.test(String(item.source ?? "")) ? "Composição validável" : /didatic|rateio uniforme/i.test(String(item.source ?? "")) ? "Fonte didática" : "Vínculo pendente"}</span><button type="button" className="xl-btn" onClick={() => setDetalheId(detalheId === item.id ? null : item.id)}>{detalheId === item.id ? "Fechar" : "Detalhes"}</button><button type="button" className="xl-btn" onClick={() => iniciarEdicao(item)}>Editar</button></td>
                  </tr>
                )}
                {detalheId === item.id && editandoId !== item.id && <tr key={`${item.id}-detail`} className="orcamento-detail-row"><td colSpan={7}><div><b>Diagnóstico do item</b><span>Fonte do preço: {item.source || "não informada"} · Referência: {item.referencePeriod || "não informada"} · Composição: {item.compositionId ? `#${item.compositionId}` : "não vinculada"}</span><span>Quantitativo: {item.quantityEvidenceStatus ?? "pendente"} · Evidência: {item.quantityEvidence || "não informada"}</span><small>{item.quantityEvidenceStatus === "cenario" ? "Cenário de planejamento; não representa medição ou execução." : item.quantityEvidenceStatus === "validada" ? "Evidência classificada como validada; confirme a documentação antes do uso executivo." : "Informe a referência e classifique o quantitativo antes de aprovar o orçamento."}</small></div></td></tr>}
              </Fragment>))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
