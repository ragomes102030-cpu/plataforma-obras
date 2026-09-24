import { trpc } from "@/lib/trpc";
import { AlertTriangle, Calculator, FilePlus2, Plus, RefreshCw, Scale, WalletCards } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { NAV_PATHS } from "@/nav-paths";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function BudgetView({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const budgetQuery = trpc.budgets.list.useQuery({ projectId });
  const wbsQuery = trpc.projects.wbs.useQuery({ projectId });
  const catalogQuery = trpc.catalog.list.useQuery({});
  const createVersionMutation = trpc.budgets.createVersion.useMutation({
    onSuccess: async () => {
      setVersionName("");
      await utils.budgets.list.invalidate({ projectId });
    },
  });
  const ensureVersionMutation = trpc.budgets.ensureVersion.useMutation({
    onSuccess: async () => {
      await utils.budgets.list.invalidate({ projectId });
    },
  });
  const createItemMutation = trpc.budgets.createItem.useMutation({
    onSuccess: async () => {
      setCode("");
      setDescription("");
      setUnit("");
      setQuantity("");
      setUnitPrice("");
      setCompositionId("");
      setProductivity("");
      setPlannedDuration("");
      setSource("");
      setReferencePeriod("");
      await utils.budgets.list.invalidate({ projectId });
    },
  });
  const [versionName, setVersionName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [compositionId, setCompositionId] = useState("");
  const [productivity, setProductivity] = useState("");
  const [plannedDuration, setPlannedDuration] = useState("");
  const [source, setSource] = useState("");
  const [referencePeriod, setReferencePeriod] = useState("");
  const [bdiPct, setBdiPct] = useState("");
  const [wbsNodeId, setWbsNodeId] = useState("");
  const [decisions, setDecisions] = useState<Record<number, "apply_match" | "keep_manual">>({});
  const [appliedSummary, setAppliedSummary] = useState<{ applied: number; kept: number; exceptions: number; total: number } | null>(null);
  const selectedComposition = catalogQuery.data?.compositions.find(
    item => item.id === Number(compositionId)
  );
  const activeVersion = budgetQuery.data?.versions.find(
    item => item.id === budgetQuery.data.activeVersionId
  );
  const reconcileQuery = trpc.budgets.reconcilePreview.useQuery(
    { projectId },
    { enabled: Boolean(activeVersion), staleTime: 30_000 }
  );
  const applyReconciliation = trpc.budgets.applyReconciliation.useMutation({
    onSuccess: async result => {
      setAppliedSummary(result);
      setDecisions({});
      await utils.budgets.list.invalidate({ projectId });
      await reconcileQuery.refetch();
    },
  });
  const canCreateItem = Boolean(
    activeVersion && code && description && unit && Number(quantity) > 0 &&
    (compositionId ? true : Number(unitPrice) >= 0)
  );
  const unavailable = budgetQuery.data?.unavailable === true;
  const items = budgetQuery.data?.items ?? [];
  const total = budgetQuery.data?.total ?? 0;
  const bdi = Number(bdiPct) || 0;
  const totalComBdi = total * (1 + bdi / 100);
  const encargos = totalComBdi - total;
  const allPricesZero = items.length > 0 && items.every(item => Number(item.unitPrice) === 0);
  const heroStatus = unavailable
    ? "Sem banco"
    : budgetQuery.isPending
      ? "Carregando"
      : !activeVersion
        ? "Sem versão"
        : allPricesZero || total === 0
          ? "Sem preços"
          : "Com preços";
  const analysis = useMemo(() => {
    if (!items.length || total <= 0) return null;
    const priced = items
      .map(item => ({
        id: item.id,
        code: item.code,
        description: item.description,
        wbsNodeId: item.wbsNodeId ?? null,
        lineTotal: Number(item.quantity) * Number(item.unitPrice),
      }))
      .filter(item => item.lineTotal > 0);
    if (!priced.length) return null;
    const top = [...priced]
      .sort((a, b) => b.lineTotal - a.lineTotal)
      .slice(0, 10);
    const maxTop = top[0]?.lineTotal || 1;
    const wbsById = new Map((wbsQuery.data ?? []).map(node => [node.id, node]));
    const byBranch = new Map<string, number>();
    for (const item of priced) {
      const node = item.wbsNodeId != null ? wbsById.get(item.wbsNodeId) : undefined;
      const branchCode = (node?.code ?? item.code).split(".").slice(0, 2).join(".");
      const branchName = node?.name
        ? `${branchCode} · ${node.name}`
        : branchCode || "Sem ramo";
      byBranch.set(branchName, (byBranch.get(branchName) ?? 0) + item.lineTotal);
    }
    const branches = [...byBranch.entries()]
      .map(([name, branchTotal]) => ({
        name,
        branchTotal,
        pct: (branchTotal / total) * 100,
      }))
      .sort((a, b) => b.branchTotal - a.branchTotal)
      .slice(0, 8);
    return { top, maxTop, branches };
  }, [items, total, wbsQuery.data]);

  const branchGroups = useMemo(() => {
    if (!items.length) return [];
    const wbsById = new Map((wbsQuery.data ?? []).map(node => [node.id, node]));
    const groups = new Map<string, { key: string; label: string; items: typeof items; subtotal: number }>();
    for (const item of items) {
      const node = item.wbsNodeId != null ? wbsById.get(item.wbsNodeId) : undefined;
      const key = (node?.code ?? item.code ?? "").split(".").slice(0, 2).join(".");
      const branchNode = (wbsQuery.data ?? []).find(n => n.code === key);
      const label = key ? (branchNode?.name ? `${key} · ${branchNode.name}` : key) : "Sem ramo";
      const group = groups.get(key) ?? { key, label, items: [], subtotal: 0 };
      group.items.push(item);
      group.subtotal += Number(item.quantity) * Number(item.unitPrice);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [items, wbsQuery.data]);

  const submitVersion = (event: React.FormEvent) => {
    event.preventDefault();
    if (!versionName.trim()) return;
    createVersionMutation.mutate({ projectId, name: versionName.trim() });
  };
  const submitItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeVersion || !canCreateItem) return;
    createItemMutation.mutate({
      projectId,
      budgetVersionId: activeVersion.id,
      code: code.trim(),
      description: description.trim(),
      unit: unit.trim(),
      quantity: Number(quantity),
      unitPrice: Number(unitPrice || 0),
      compositionId: compositionId ? Number(compositionId) : undefined,
      productivity: productivity ? Number(productivity) : undefined,
      plannedDurationDays: plannedDuration ? Number(plannedDuration) : undefined,
      source: source.trim() || undefined,
      referencePeriod: referencePeriod.trim() || undefined,
      wbsNodeId: wbsNodeId ? Number(wbsNodeId) : undefined,
    });
  };

  return (
    <div className="module-page budget-page">
      <div className="module-hero">
        <div className="module-icon"><WalletCards size={22} /></div>
        <div>
          <p className="eyebrow accent">CUSTOS E SERVIÇOS</p>
          <h2>Orçamento da obra</h2>
          <p>{projectName} · cadastre serviços, quantitativos e preços com rastreabilidade.</p>
        </div>
        <span className="module-hero-status"><span /> {heroStatus}</span>
        <div className="module-hero-actions">
          <button type="button" className="outline-button" onClick={() => navigate(NAV_PATHS["Cronogramas"])}>Cronograma</button>
          <button type="button" className="outline-button" onClick={() => navigate(NAV_PATHS["Linha de Balanço"])}>LOB</button>
        </div>
      </div>

      <div className="budget-summary-grid">
        <div className="module-card budget-summary-card">
          <span className="eyebrow">VERSÃO ATIVA</span>
          <strong>
            {unavailable
              ? "Indisponível"
              : activeVersion?.name || "Nenhuma versão criada"}
          </strong>
          <p>
            {unavailable
              ? "Banco de dados não configurado no servidor."
              : activeVersion
                ? `V${activeVersion.versionNumber} · ${activeVersion.status.replace("_", " ")}`
                : "Crie uma versão para iniciar o orçamento."}
          </p>
        </div>
        <div className="module-card budget-summary-card">
          <span className="eyebrow">ITENS DE SERVIÇO</span>
          <strong>{budgetQuery.data?.items.length ?? 0}</strong>
          <p>Itens cadastrados na versão ativa.</p>
        </div>
        <div className="module-card budget-summary-card budget-total-card">
          <span className="eyebrow">TOTAL DIRETO</span>
          <strong>{unavailable ? "—" : money(total)}</strong>
          <p>
            {unavailable
              ? "Configure DATABASE_URL para ver o orçamento."
              : items.length && total === 0
                ? "Itens iniciais sem preços: preencha ou vincule uma composição."
                : "Somente custos diretos. Informe o BDI ao lado para o total final."}
          </p>
        </div>
        <div className="module-card budget-summary-card budget-bdi-card">
          <span className="eyebrow">TOTAL COM BDI</span>
          <strong>{unavailable ? "—" : money(totalComBdi)}</strong>
          <p>
            {unavailable ? "Configure DATABASE_URL para ver o orçamento." : "BDI:"}
            {!unavailable && (
              <input
                type="number"
                min="0"
                step="0.5"
                value={bdiPct}
                onChange={event => setBdiPct(event.target.value)}
                placeholder="0,0"
                className="budget-bdi-input"
              />
            )}
            {!unavailable && bdi > 0 && <span>encargos {money(encargos)}</span>}
          </p>
        </div>
      </div>

      {unavailable ? (
        <section className="module-card budget-empty-state">
          <div className="budget-empty-icon"><FilePlus2 size={22} /></div>
          <div>
            <h3>Banco de dados não configurado</h3>
            <p>
              O orçamento fica indisponível sem <code>DATABASE_URL</code> no
              servidor. Configure o banco e recarregue a página para cadastrar
              versões, serviços e preços.
            </p>
          </div>
        </section>
      ) : !activeVersion ? (
        <section className="module-card budget-empty-state">
          <div className="budget-empty-icon"><FilePlus2 size={22} /></div>
          <div>
            <h3>Comece pela primeira versão do orçamento</h3>
            <p>
              Uma versão preserva o histórico e evita alterar silenciosamente
              um orçamento aprovado. Gere a estrutura inicial a partir da EAP
              ou crie uma versão em branco.
            </p>
            <form className="budget-version-form" onSubmit={submitVersion}>
              <input value={versionName} onChange={event => setVersionName(event.target.value)} placeholder="Ex.: Orçamento preliminar" required />
              <button className="primary-button" disabled={createVersionMutation.isPending}><Plus size={14} /> Criar versão</button>
              <button
                type="button"
                className="outline-button"
                disabled={ensureVersionMutation.isPending}
                onClick={() => ensureVersionMutation.mutate({ projectId })}
              >
                {ensureVersionMutation.isPending
                  ? "Gerando..."
                  : "Gerar versão inicial da obra"}
              </button>
            </form>
            {createVersionMutation.error && <p className="form-error">{createVersionMutation.error.message}</p>}
            {ensureVersionMutation.error && <p className="form-error">{ensureVersionMutation.error.message}</p>}
          </div>
        </section>
      ) : (
        <>
          {allPricesZero && (
            <section className="module-card budget-empty-state">
              <div className="budget-empty-icon"><AlertTriangle size={22} /></div>
              <div>
                <h3>Itens sem preços</h3>
                <p>
                  O total está em R$ 0 porque os serviços ainda não têm preço
                  unitário. Vincule composições no Catálogo ou digite o preço de
                  cada item no formulário abaixo.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navigate(NAV_PATHS["Catálogo"])}
                >
                  Abrir Catálogo de composições
                </button>
              </div>
            </section>
          )}
          {analysis && (
            <section className="module-card budget-analysis-card">
              <div className="panel-heading">
                <div>
                  <h3>Análise do orçamento</h3>
                  <p>Concentração dos maiores serviços e composição por ramo da EAP.</p>
                </div>
                <WalletCards size={18} className="sparkle" />
              </div>
              <div className="budget-analysis-grid">
                <div>
                  <span className="eyebrow">TOP SERVIÇOS POR VALOR</span>
                  <div className="budget-analysis-bars">
                    {analysis.top.map(item => (
                      <div className="budget-analysis-row" key={`top-${item.id}`}>
                        <span className="budget-analysis-label" title={`${item.code} · ${item.description}`}>
                          {item.code} · {item.description}
                        </span>
                        <div className="budget-analysis-track">
                          <div
                            style={{
                              width: `${Math.max(4, (item.lineTotal / analysis.maxTop) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong>{money(item.lineTotal)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="eyebrow">% POR RAMO DA EAP</span>
                  <div className="budget-analysis-branches">
                    {analysis.branches.map(branch => (
                      <div className="budget-analysis-branch" key={`branch-${branch.name}`}>
                        <div>
                          <span>{branch.name}</span>
                          <strong>{branch.pct.toFixed(1)}%</strong>
                        </div>
                        <div className="budget-analysis-track">
                          <div style={{ width: `${Math.max(2, branch.pct)}%` }} />
                        </div>
                        <small>{money(branch.branchTotal)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
          <section className="module-card budget-item-card">
            <div className="panel-heading">
              <div><h3>Novo serviço</h3><p>Cadastre o item com quantidade, unidade e preço de referência.</p></div>
              <Calculator size={18} className="sparkle" />
            </div>
            <form className="budget-form-grid" onSubmit={submitItem}>
              <label>Código<input value={code} onChange={event => setCode(event.target.value)} placeholder="01.001" required /></label>
              <label className="budget-field-wide">Descrição<input value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Concreto estrutural" required /></label>
              <label>Unidade<input value={unit} onChange={event => setUnit(event.target.value)} placeholder="m³" required /></label>
              <label>Quantidade<input type="number" min="0.001" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="0,000" required /></label>
              <label>Preço unitário<input type="number" min="0" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} placeholder={compositionId ? "Calculado pela composição" : "0,00"} required={!compositionId} /></label>
              <label className="budget-field-wide">Aplicar composição<select value={compositionId} onChange={event => setCompositionId(event.target.value)}><option value="">Preço digitado manualmente</option>{(catalogQuery.data?.compositions ?? []).map(item => <option key={item.id} value={item.id}>{item.code} · {item.description}</option>)}</select></label>
              <label>Produtividade<input type="number" min="0.001" step="0.001" value={productivity} onChange={event => setProductivity(event.target.value)} placeholder="Qtd/dia" /></label>
              <label>Duração planejada<input type="number" min="1" step="1" value={plannedDuration} onChange={event => setPlannedDuration(event.target.value)} placeholder={productivity ? "Calculada" : "Dias"} /></label>
              <label>Vínculo EAP<select value={wbsNodeId} onChange={event => setWbsNodeId(event.target.value)}><option value="">Sem vínculo por enquanto</option>{(wbsQuery.data ?? []).map(node => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}</select></label>
              <label>Fonte<input value={source} onChange={event => setSource(event.target.value)} placeholder="Própria, SINAPI..." /></label>
              <label>Referência<input value={referencePeriod} onChange={event => setReferencePeriod(event.target.value)} placeholder="09/2026" /></label>
              <div className="budget-form-footer"><span>{selectedComposition ? `Composição selecionada: ${selectedComposition.code}. O custo será calculado pela memória de componentes.` : "O total será calculado e persistido a partir do item."}</span><button className="primary-button" disabled={!canCreateItem || createItemMutation.isPending}><Plus size={14} /> {createItemMutation.isPending ? "Salvando..." : "Adicionar serviço"}</button></div>
            </form>
            {createItemMutation.error && <p className="form-error">{createItemMutation.error.message}</p>}
          </section>

          <section className="module-card budget-table-card">
            <div className="panel-heading"><div><h3>Reconciliação com base de referência</h3><p>{reconcileQuery.data ? `Catálogo ${reconcileQuery.data.catalog?.name ?? "SEINFRA"} · tolerância ${reconcileQuery.data.thresholdPct}%` : "Compare preços manuais com a base SEINFRA-CE. Nada é aplicado sem sua confirmação por item."}</p></div><Scale size={18} className="sparkle" /></div>
            {reconcileQuery.isPending ? <div className="module-empty">Carregando prévia de reconciliação...</div> : !reconcileQuery.data || reconcileQuery.data.items.length === 0 ? <div className="module-empty"><Scale size={20} /><span>Nenhum item para reconciliar. Importe uma base SEINFRA-CE no catálogo e cadastre itens no orçamento.</span></div> : (
              <>
                <div className="budget-table-wrap"><table className="budget-table"><thead><tr><th>Serviço</th><th>Preço manual</th><th>Match SEINFRA</th><th>Score</th><th>Variação</th><th>Decisão</th></tr></thead><tbody>
                  {reconcileQuery.data.items.map(item => {
                    const current = decisions[item.budgetItemId] ?? "keep_manual";
                    return (
                      <tr key={item.budgetItemId}>
                        <td><strong>{item.description}</strong><small>{item.code} · {item.quantity.toLocaleString("pt-BR")} {item.unit}</small>{item.isPriceException && <small><AlertTriangle size={11} /> fora da base padrão</small>}</td>
                        <td>{money(item.manualPrice)}</td>
                        <td>{item.match ? <span><strong>{item.match.code}</strong> · {item.match.description}<small>{item.match.unit} · {money(item.match.unitPrice)}</small></span> : <span>Sem match</span>}</td>
                        <td>{item.match ? `${(item.match.score * 100).toFixed(0)}%` : "—"}</td>
                        <td>{item.match && item.variation !== null ? <span>{(item.variation * 100).toFixed(1)}%{item.alert && <small><AlertTriangle size={11} /> acima do limite</small>}</span> : "—"}</td>
                        <td><select value={current} onChange={event => setDecisions(prev => ({ ...prev, [item.budgetItemId]: event.target.value as "apply_match" | "keep_manual" }))} disabled={!item.match}><option value="keep_manual">Manter manual</option><option value="apply_match" disabled={!item.match}>Aplicar match</option></select></td>
                      </tr>
                    );
                  })}
                </tbody></table></div>
                <div className="budget-form-footer"><span>Antes: {money(reconcileQuery.data.totalBefore)} · Depois: {money(reconcileQuery.data.totalAfter)} · Delta: {money(reconcileQuery.data.totalAfter - reconcileQuery.data.totalBefore)} · {reconcileQuery.data.items.filter(i => i.alert).length} alerta(s) de variação</span><button className="primary-button" disabled={applyReconciliation.isPending || Object.keys(decisions).length === 0} onClick={() => applyReconciliation.mutate({ projectId, decisions: Object.entries(decisions).map(([id, action]) => ({ budgetItemId: Number(id), action, matchKind: reconcileQuery.data?.items.find(i => i.budgetItemId === Number(id))?.match?.kind, matchId: reconcileQuery.data?.items.find(i => i.budgetItemId === Number(id))?.match?.id, score: reconcileQuery.data?.items.find(i => i.budgetItemId === Number(id))?.match?.score })) })}><RefreshCw size={14} /> {applyReconciliation.isPending ? "Aplicando..." : "Aplicar decisões confirmadas"}</button></div>
                {applyReconciliation.error && <p className="form-error">{applyReconciliation.error.message}</p>}
                {appliedSummary && <div className="catalog-list-row"><div><strong>Reconciliação aplicada</strong><span>{appliedSummary.applied} aplicado(s) · {appliedSummary.kept} mantido(s) · {appliedSummary.exceptions} exceção(ões) · total {money(appliedSummary.total)}</span></div></div>}
              </>
            )}
          </section>

          <section className="module-card budget-table-card">
            <div className="panel-heading"><div><h3>Composição do orçamento</h3><p>Versão {activeVersion.versionNumber} · {activeVersion.name}</p></div><button className="outline-button" onClick={() => void budgetQuery.refetch()}><RefreshCw size={13} /> Atualizar</button></div>
            {budgetQuery.isPending ? <div className="module-empty">Carregando orçamento...</div> : budgetQuery.data?.items.length ? <div className="budget-table-wrap"><table className="budget-table"><thead><tr><th>Código</th><th>Serviço</th><th>Un.</th><th>Quantidade</th><th>Preço unit.</th><th>Total</th><th>Planejamento</th><th>Fonte</th></tr></thead><tbody>{branchGroups.map(group => <Fragment key={group.key}><tr className="budget-branch-row"><td colSpan={8}><strong>{group.label}</strong><small>{group.items.length} item(ns) · subtotal {money(group.subtotal)}</small></td></tr>{group.items.map(item => <tr key={item.id}><td>{item.code}</td><td><strong>{item.description}</strong>{item.isPriceException && <small><AlertTriangle size={11} /> fora da base padrão</small>}{item.compositionNote && <small>Composição: {item.compositionNote}</small>}{item.referencePeriod && <small>Referência {item.referencePeriod}</small>}</td><td>{item.unit}</td><td>{Number(item.quantity).toLocaleString("pt-BR", { minimumFractionDigits: 3 })}</td><td>{money(Number(item.unitPrice))}</td><td><strong>{money(Number(item.quantity) * Number(item.unitPrice))}</strong></td><td>{item.plannedDurationDays ? `${item.plannedDurationDays} dias` : "—"}</td><td>{item.source || (item.compositionId ? "Composição" : "Própria")}</td></tr>)}</Fragment>)}</tbody><tfoot><tr className="budget-total-row"><td colSpan={5}>TOTAL DIRETO</td><td colSpan={3}><strong>{money(total)}</strong></td></tr><tr className="budget-total-row budget-total-bdi"><td colSpan={5}>TOTAL COM BDI{bdi > 0 ? ` (${bdi.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : ""}</td><td colSpan={3}><strong>{money(totalComBdi)}</strong></td></tr></tfoot></table></div> : <div className="module-empty"><Calculator size={20} /><span>Nenhum serviço cadastrado. Use o formulário acima para iniciar o orçamento.</span></div>}
          </section>
        </>
      )}
    </div>
  );
}
