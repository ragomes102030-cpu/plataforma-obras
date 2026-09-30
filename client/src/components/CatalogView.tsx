import { trpc } from "@/lib/trpc";
import { BookOpen, Calculator, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const typeLabels = {
  material: "Material",
  mao_de_obra: "Mão de obra",
  equipamento: "Equipamento",
  servico: "Serviço",
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function CatalogView() {
  const utils = trpc.useUtils();
  const [catalogId, setCatalogId] = useState<number | undefined>();
  const [compositionId, setCompositionId] = useState<number | undefined>();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [groupQuery, setGroupQuery] = useState("");
  const toggleGroup = (key: string) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const catalogQuery = trpc.catalog.list.useQuery({ catalogId, compositionId });

  const [catalogName, setCatalogName] = useState("");
  const [sourceType, setSourceType] = useState<"propria" | "SINAPI" | "SEINFRA" | "fornecedor">("propria");
  const [catalogState, setCatalogState] = useState("");
  const [catalogPeriod, setCatalogPeriod] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemUnit, setItemUnit] = useState("");
  const [itemType, setItemType] = useState<"material" | "mao_de_obra" | "equipamento" | "servico">("material");
  const [itemPrice, setItemPrice] = useState("");
  const [compositionCode, setCompositionCode] = useState("");
  const [compositionDescription, setCompositionDescription] = useState("");
  const [compositionUnit, setCompositionUnit] = useState("");
  const [priceItemId, setPriceItemId] = useState("");
  const [componentType, setComponentType] = useState<"material" | "mao_de_obra" | "equipamento">("material");
  const [coefficient, setCoefficient] = useState("");
  const [seinfraFile, setSeinfraFile] = useState<File | null>(null);
  const [seinfraPeriod, setSeinfraPeriod] = useState("");
  const [seinfraUf, setSeinfraUf] = useState("CE");
  const [seinfraName, setSeinfraName] = useState("");
  const [importResult, setImportResult] = useState<{ catalogId: number; referencePeriod: string; imported: number; skipped: number; referenceHint: string | null; aviso: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [acQuery, setAcQuery] = useState("");
  const [acOpen, setAcOpen] = useState(false);

  useEffect(() => {
    if (!acQuery.trim() || acQuery.trim().length < 2) { setAcOpen(false); return; }
    const t = setTimeout(() => setAcOpen(true), 300);
    return () => clearTimeout(t);
  }, [acQuery]);
  const acEnabled = acOpen && acQuery.trim().length >= 2;
  const acQueryResult = trpc.catalog.searchPrices.useQuery(
    { query: acQuery.trim(), sourceType: "SEINFRA", limit: 6 },
    { enabled: acEnabled }
  );

  const selectedCatalog = catalogQuery.data?.catalogs.find(item => item.id === catalogId) ?? catalogQuery.data?.catalogs[0];
  const selectedComposition = catalogQuery.data?.compositions.find(item => item.id === compositionId) ?? catalogQuery.data?.compositions[0];

  const createCatalog = trpc.catalog.createCatalog.useMutation({
    onSuccess: async () => {
      setCatalogName("");
      setCatalogPeriod("");
      await utils.catalog.list.invalidate();
    },
  });
  const createItem = trpc.catalog.createPriceItem.useMutation({
    onSuccess: async () => {
      setItemCode("");
      setItemDescription("");
      setItemUnit("");
      setItemPrice("");
      await utils.catalog.list.invalidate({ catalogId });
    },
  });
  const createComposition = trpc.catalog.createComposition.useMutation({
    onSuccess: async () => {
      setCompositionCode("");
      setCompositionDescription("");
      setCompositionUnit("");
      await utils.catalog.list.invalidate();
    },
  });
  const addComponent = trpc.catalog.addComponent.useMutation({
    onSuccess: async () => {
      setCoefficient("");
      await utils.catalog.list.invalidate({ catalogId, compositionId });
    },
  });
  const updateComponent = trpc.catalog.updateComponent.useMutation({
    onSuccess: async () => {
      await utils.catalog.list.invalidate({ catalogId, compositionId });
    },
  });
  const removeComponent = trpc.catalog.removeComponent.useMutation({
    onSuccess: async () => {
      await utils.catalog.list.invalidate({ catalogId, compositionId });
    },
  });
  const [componentCoefDrafts, setComponentCoefDrafts] = useState<Record<number, string>>({});
  const saveComponentCoef = (component: { id: number; coefficient: string }) => {
    const value = Number(componentCoefDrafts[component.id]);
    if (!Number.isFinite(value) || value <= 0) return;
    updateComponent.mutate({ componentId: component.id, coefficient: value });
  };
  const importOfficial0281 = trpc.catalog.importOfficial0281.useMutation({
    onSuccess: async result => {
      setImportResult({
        catalogId: result.catalogId,
        referencePeriod: result.referencePeriod,
        imported: result.imported,
        skipped: result.skipped,
        referenceHint: result.referenceHint,
        aviso: result.reused
          ? "A base oficial 028.1 já estava carregada; nenhum catálogo duplicado foi criado."
          : "Base oficial da SEINFRA carregada. Ela já pode gerar a EAP com os códigos C....",
      });
      await utils.catalog.list.invalidate();
      setCatalogId(result.catalogId);
    },
  });
  const importSheet = trpc.catalog.importPriceSheet.useMutation({
    onSuccess: async result => {
      setImportResult(result);
      setSeinfraFile(null);
      setSeinfraPeriod("");
      setSeinfraName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await utils.catalog.list.invalidate();
      setCatalogId(result.catalogId);
    },
  });
  const submitImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!seinfraFile || !seinfraPeriod.trim()) return;
    const buffer = await seinfraFile.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    importSheet.mutate({
      sourceType: "SEINFRA",
      fileName: seinfraFile.name,
      fileDataBase64: btoa(binary),
      referencePeriod: seinfraPeriod.trim(),
      state: seinfraUf.trim().toUpperCase() || undefined,
      name: seinfraName.trim() || undefined,
    });
  };
  const applyAutocomplete = (candidate: { code: string; description: string; unit: string; unitPrice: number }) => {
    setItemCode(candidate.code);
    setItemDescription(candidate.description);
    setItemUnit(candidate.unit);
    setItemPrice(String(candidate.unitPrice));
    setAcOpen(false);
  };

  return (
    <div className="module-page catalog-page">
      <div className="module-hero">
        <div className="module-icon"><BookOpen size={22} /></div>
        <div>
          <p className="eyebrow accent">REFERÊNCIAS DE CUSTO</p>
          <h2>Catálogo e composições</h2>
          <p>Cadastre fontes, insumos e composições sem alterar orçamentos aprovados.</p>
        </div>
        <span className="module-hero-status"><span /> Etapa 3 · catálogo versionado</span>
      </div>

      <div className="catalog-summary-grid">
        <div className="module-card budget-summary-card"><span className="eyebrow">CATÁLOGOS</span><strong>{catalogQuery.data?.catalogs.length ?? 0}</strong><p>SINAPI, SEINFRA, própria ou fornecedor.</p></div>
        <div className="module-card budget-summary-card"><span className="eyebrow">ITENS DE PREÇO</span><strong>{catalogQuery.data?.priceItems.length ?? 0}</strong><p>{selectedCatalog?.name ?? "Selecione um catálogo"}.</p></div>
        <div className="module-card budget-summary-card budget-total-card"><span className="eyebrow">CUSTO UNITÁRIO</span><strong>{money(catalogQuery.data?.total ?? 0)}</strong><p>Coeficiente × preço congelado na composição.</p></div>
      </div>

      {!(catalogQuery.data?.catalogs.length) && (
        <section className="module-card catalog-onboarding-card">
          <div className="panel-heading"><div><h3>Como começar o catálogo</h3><p>Importe a base oficial abaixo. Ela é a fonte da estrutura (EAP) das novas obras — sem ela, a obra é criada sem EAP.</p></div><BookOpen size={18} className="sparkle" /></div>
          <div className="focus-list"><div className="focus-item"><div className="focus-icon blue"><span>1</span></div><div><strong>Baixe a planilha da SEINFRA no site oficial</strong><span>Tabela de Insumos (I...) ou Planos de Serviços (C...), em .xls ou .xlsx. O download é manual, de propósito: mantém a auditoria de origem do preço.</span></div></div><div className="focus-item"><div className="focus-icon blue"><span>2</span></div><div><strong>Importe no formulário abaixo</strong><span>Informe o período de referência (ex.: 09/2026) e a UF. Cada importação vira um catálogo versionado; meses anteriores não são sobrescritos.</span></div></div><div className="focus-item"><div className="focus-icon blue"><span>3</span></div><div><strong>Crie a obra</strong><span>A EAP é montada a partir dos serviços (C...) importados, e cada item carrega o código oficial. Por isso o orçamento encontra o preço sem você digitá-lo.</span></div></div></div>
        </section>
      )}

      <section className="module-card">
        <div className="panel-heading"><div><h3>Nova fonte de preços</h3><p>A fonte e o período acompanham cada referência importada ou cadastrada.</p></div><Plus size={18} className="sparkle" /></div>
        <form className="catalog-form-grid" onSubmit={event => { event.preventDefault(); if (catalogName && catalogPeriod) createCatalog.mutate({ name: catalogName, sourceType, state: catalogState || undefined, referencePeriod: catalogPeriod }); }}>
          <label>Nome da fonte<input value={catalogName} onChange={event => setCatalogName(event.target.value)} placeholder="SINAPI São Paulo" required /></label>
          <label>Tipo<select value={sourceType} onChange={event => setSourceType(event.target.value as typeof sourceType)}><option value="propria">Base própria</option><option value="SINAPI">SINAPI</option><option value="SEINFRA">SEINFRA</option><option value="fornecedor">Fornecedor</option></select></label>
          <label>UF<input value={catalogState} onChange={event => setCatalogState(event.target.value)} placeholder="SP" maxLength={2} /></label>
          <label>Referência<input value={catalogPeriod} onChange={event => setCatalogPeriod(event.target.value)} placeholder="09/2026" required /></label>
          <div className="catalog-form-footer"><span>Para base oficial, use a importação de planilha logo abaixo — é mais rápido e já traz os códigos.</span><button className="primary-button" disabled={createCatalog.isPending}><Plus size={14} /> Criar fonte</button></div>
        </form>
        {createCatalog.error && <p className="form-error">{createCatalog.error.message}</p>}
      </section>

      <section className="module-card">
        <div className="panel-heading"><div><h3>Importar base SEINFRA-CE</h3><p>Upload manual de .xls/.xlsx oficial — cada importação gera um novo catálogo versionado.</p></div><Upload size={18} className="sparkle" /></div>
        <form className="catalog-form-grid" onSubmit={submitImport}>
          <label>Arquivo SEINFRA<input ref={fileInputRef} type="file" accept=".xls,.xlsx" onChange={event => setSeinfraFile(event.target.files?.[0] ?? null)} required /></label>
          <label>Período de referência<input value={seinfraPeriod} onChange={event => setSeinfraPeriod(event.target.value)} placeholder="09/2026" required /></label>
          <label>UF<input value={seinfraUf} onChange={event => setSeinfraUf(event.target.value)} placeholder="CE" maxLength={2} /></label>
          <label>Nome do catálogo<input value={seinfraName} onChange={event => setSeinfraName(event.target.value)} placeholder="SEINFRA-CE 09/2026 (opcional)" /></label>
          <div className="catalog-form-footer">
            <span>Arquivos aceitos: Tabela de Insumos (I...) e Planos de Serviços (C...) da SEINFRA.</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="outline-button"
                disabled={importOfficial0281.isPending}
                onClick={() => importOfficial0281.mutate({ force: false })}
              >
                <BookOpen size={14} />
                {importOfficial0281.isPending ? "Baixando base oficial..." : "Carregar SEINFRA 028.1"}
              </button>
              <button className="primary-button" disabled={!seinfraFile || !seinfraPeriod.trim() || importSheet.isPending}>
                <Upload size={14} /> {importSheet.isPending ? "Importando..." : "Importar planilha"}
              </button>
            </div>
          </div>
        </form>
        {importSheet.error && <p className="form-error">{importSheet.error.message}</p>}
        {importOfficial0281.error && <p className="form-error">{importOfficial0281.error.message}</p>}
        {importResult && <div className="catalog-list-row"><div><strong>Importação concluída · {importResult.referencePeriod}</strong><span>{importResult.imported} itens importados · {importResult.skipped} ignorados{importResult.referenceHint ? ` · ref arquivo: ${importResult.referenceHint}` : ""}</span>{importResult.aviso && <span style={{ color: "var(--warn)" }}>{importResult.aviso}</span>}</div></div>}
      </section>

      <div className="catalog-two-column">
        <section className="module-card">
          <div className="panel-heading"><div><h3>Itens de preço</h3><p>Fonte ativa: {selectedCatalog?.name ?? "nenhuma"}</p></div><button className="outline-button" onClick={() => void catalogQuery.refetch()}><RefreshCw size={13} /> Atualizar</button></div>
          <div className="catalog-selector-row"><select value={selectedCatalog?.id ?? ""} onChange={event => setCatalogId(event.target.value ? Number(event.target.value) : undefined)}><option value="">Selecione uma fonte</option>{(catalogQuery.data?.catalogs ?? []).map(item => <option key={item.id} value={item.id}>{item.name} · {item.referencePeriod}</option>)}</select></div>
          <form className="catalog-compact-form" onSubmit={event => { event.preventDefault(); if (selectedCatalog && itemCode && itemDescription && itemUnit && itemPrice) createItem.mutate({ catalogId: selectedCatalog.id, code: itemCode, description: itemDescription, unit: itemUnit, itemType, unitPrice: Number(itemPrice) }); }}>
            <input value={itemCode} onChange={event => setItemCode(event.target.value)} placeholder="Código" required />
            <div style={{ position: "relative" }}>
              <input value={itemDescription} onChange={event => { setItemDescription(event.target.value); setAcQuery(event.target.value); }} placeholder="Descrição" required />
              {acEnabled && (acQueryResult.data?.candidates.length ?? 0) > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, background: "var(--surface, #fff)", border: "1px solid var(--border, #ddd)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.12)" }}>
                  {acQueryResult.data?.candidates.map(c => (
                    <button type="button" key={`${c.kind}-${c.id}`} onClick={() => applyAutocomplete(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12 }}>
                      <strong>{c.code}</strong> · {c.description} · {money(c.unitPrice)} · score {(c.score * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input value={itemUnit} onChange={event => setItemUnit(event.target.value)} placeholder="Un." required />
            <select value={itemType} onChange={event => setItemType(event.target.value as typeof itemType)}>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <input type="number" min="0" step="0.01" value={itemPrice} onChange={event => setItemPrice(event.target.value)} placeholder="Preço" required />
            <button className="outline-button" disabled={!selectedCatalog || createItem.isPending}><Plus size={13} /> Adicionar</button>
          </form>
          {createItem.error && <p className="form-error">{createItem.error.message}</p>}
          <input
            value={groupQuery}
            onChange={event => setGroupQuery(event.target.value)}
            placeholder="Filtrar itens por código ou descrição"
            style={{ width: "100%", marginBottom: 8 }}
          />
          <div className="catalog-list">
            {(() => {
              const q = groupQuery.trim().toLowerCase();
              const items = (catalogQuery.data?.priceItems ?? []).filter(
                item =>
                  !q ||
                  item.code.toLowerCase().includes(q) ||
                  item.description.toLowerCase().includes(q)
              );
              if (!items.length) return <div className="module-empty">Nenhum item nesta fonte.</div>;
              const order = ["material", "mao_de_obra", "equipamento", "servico"] as const;
              const groups = order
                .map(key => ({ key, label: typeLabels[key], list: items.filter(item => item.itemType === key) }))
                .filter(group => group.list.length > 0);
              return (
                <>
                  {groups.map(group => {
                    const collapsed = collapsedGroups[group.key];
                    const total = group.list.reduce((sum, item) => sum + Number(item.unitPrice), 0);
                    return (
                      <div className="catalog-group" key={group.key}>
                        <button
                          type="button"
                          className="catalog-group-head"
                          onClick={() => toggleGroup(group.key)}
                          aria-expanded={!collapsed}
                        >
                          <span className="catalog-group-chevron">{collapsed ? "▸" : "▾"}</span>
                          <strong>{group.label}</strong>
                          <span className="catalog-group-count">{group.list.length} itens</span>
                          <b>{money(total)}</b>
                        </button>
                        {!collapsed &&
                          group.list.map(item => (
                            <div className="catalog-list-row" key={item.id}>
                              <div>
                                <strong>{item.code} · {item.description}</strong>
                                <span>{typeLabels[item.itemType]} · {item.unit}</span>
                              </div>
                              <b>{money(Number(item.unitPrice))}</b>
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </section>

        <section className="module-card">
          <div className="panel-heading"><div><h3>Composições de serviço</h3><p>O preço é formado pelos componentes e seus coeficientes.</p></div><Calculator size={18} className="sparkle" /></div>
          <form className="catalog-composition-form" onSubmit={event => { event.preventDefault(); if (compositionCode && compositionDescription && compositionUnit) createComposition.mutate({ code: compositionCode, description: compositionDescription, unit: compositionUnit, sourceCatalogId: selectedCatalog?.id }); }}>
            <input value={compositionCode} onChange={event => setCompositionCode(event.target.value)} placeholder="Código da composição" required />
            <input value={compositionDescription} onChange={event => setCompositionDescription(event.target.value)} placeholder="Descrição do serviço" required />
            <input value={compositionUnit} onChange={event => setCompositionUnit(event.target.value)} placeholder="Unidade" required />
            <button className="outline-button" disabled={createComposition.isPending}><Plus size={13} /> Nova composição</button>
          </form>
          {createComposition.error && <p className="form-error">{createComposition.error.message}</p>}
          <div className="catalog-selector-row"><select value={selectedComposition?.id ?? ""} onChange={event => setCompositionId(event.target.value ? Number(event.target.value) : undefined)}><option value="">Selecione uma composição</option>{(catalogQuery.data?.compositions ?? []).map(item => <option key={item.id} value={item.id}>{item.code} · {item.description}</option>)}</select></div>
          {selectedComposition ? <>
            <div className="composition-head"><strong>{selectedComposition.code} · {selectedComposition.description}</strong><span>{selectedComposition.unit} · {selectedComposition.status}</span></div>
            <form className="catalog-component-form" onSubmit={event => { event.preventDefault(); if (priceItemId && coefficient) addComponent.mutate({ compositionId: selectedComposition.id, priceItemId: Number(priceItemId), componentType, coefficient: Number(coefficient) }); }}>
              <select value={priceItemId} onChange={event => setPriceItemId(event.target.value)}><option value="">Item do catálogo</option>{(catalogQuery.data?.priceItems ?? []).map(item => <option key={item.id} value={item.id}>{item.code} · {item.description}</option>)}</select>
              <select value={componentType} onChange={event => setComponentType(event.target.value as typeof componentType)}><option value="material">Material</option><option value="mao_de_obra">Mão de obra</option><option value="equipamento">Equipamento</option></select>
              <input type="number" min="0.000001" step="0.000001" value={coefficient} onChange={event => setCoefficient(event.target.value)} placeholder="Coeficiente" required />
              <button className="outline-button" disabled={!priceItemId || addComponent.isPending}><Plus size={13} /> Componente</button>
            </form>
            {addComponent.error && <p className="form-error">{addComponent.error.message}</p>}
            <div className="catalog-list">
              {catalogQuery.data?.components.map(component => {
                const subtotal = Number(component.coefficient) * Number(component.unitPriceSnapshot);
                return (
                  <div className="catalog-list-row catalog-component-row" key={component.id}>
                    <div>
                      <strong>{component.itemCode} · {component.itemDescription}</strong>
                      <span>{typeLabels[component.componentType]} · {component.itemUnit}</span>
                    </div>
                    <div className="catalog-component-fields">
                      <label className="catalog-component-coef">
                        <span>coef.</span>
                        <input
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value={componentCoefDrafts[component.id] ?? component.coefficient}
                          onChange={event => setComponentCoefDrafts(prev => ({ ...prev, [component.id]: event.target.value }))}
                          onBlur={() => saveComponentCoef(component)}
                          onKeyDown={event => { if (event.key === "Enter") saveComponentCoef(component); }}
                        />
                      </label>
                      <span className="catalog-component-unit">{money(Number(component.unitPriceSnapshot))}</span>
                      <b>{money(subtotal)}</b>
                      <button
                        type="button"
                        className="catalog-component-remove"
                        title="Remover componente"
                        onClick={() => removeComponent.mutate({ componentId: component.id })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {catalogQuery.data?.components.length ? (
                <div className="catalog-component-total">
                  <span>TOTAL DA COMPOSIÇÃO</span>
                  <strong>{money(catalogQuery.data?.total ?? 0)}</strong>
                </div>
              ) : (
                <div className="module-empty">Adicione componentes para calcular o custo unitário.</div>
              )}
            </div>
          </> : <div className="module-empty"><Calculator size={20} /> Crie ou selecione uma composição.</div>}
        </section>
      </div>
    </div>
  );
}
