import { trpc } from "@/lib/trpc";
import { BookOpen, Calculator, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

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

      <section className="module-card">
        <div className="panel-heading"><div><h3>Nova fonte de preços</h3><p>A fonte e o período acompanham cada referência importada ou cadastrada.</p></div><Plus size={18} className="sparkle" /></div>
        <form className="catalog-form-grid" onSubmit={event => { event.preventDefault(); if (catalogName && catalogPeriod) createCatalog.mutate({ name: catalogName, sourceType, state: catalogState || undefined, referencePeriod: catalogPeriod }); }}>
          <label>Nome da fonte<input value={catalogName} onChange={event => setCatalogName(event.target.value)} placeholder="SINAPI São Paulo" required /></label>
          <label>Tipo<select value={sourceType} onChange={event => setSourceType(event.target.value as typeof sourceType)}><option value="propria">Base própria</option><option value="SINAPI">SINAPI</option><option value="SEINFRA">SEINFRA</option><option value="fornecedor">Fornecedor</option></select></label>
          <label>UF<input value={catalogState} onChange={event => setCatalogState(event.target.value)} placeholder="SP" maxLength={2} /></label>
          <label>Referência<input value={catalogPeriod} onChange={event => setCatalogPeriod(event.target.value)} placeholder="09/2026" required /></label>
          <div className="catalog-form-footer"><span>Importação CSV/XLSX entra na próxima evolução do catálogo.</span><button className="primary-button" disabled={createCatalog.isPending}><Plus size={14} /> Criar fonte</button></div>
        </form>
        {createCatalog.error && <p className="form-error">{createCatalog.error.message}</p>}
      </section>

      <div className="catalog-two-column">
        <section className="module-card">
          <div className="panel-heading"><div><h3>Itens de preço</h3><p>Fonte ativa: {selectedCatalog?.name ?? "nenhuma"}</p></div><button className="outline-button" onClick={() => void catalogQuery.refetch()}><RefreshCw size={13} /> Atualizar</button></div>
          <div className="catalog-selector-row"><select value={selectedCatalog?.id ?? ""} onChange={event => setCatalogId(event.target.value ? Number(event.target.value) : undefined)}><option value="">Selecione uma fonte</option>{(catalogQuery.data?.catalogs ?? []).map(item => <option key={item.id} value={item.id}>{item.name} · {item.referencePeriod}</option>)}</select></div>
          <form className="catalog-compact-form" onSubmit={event => { event.preventDefault(); if (selectedCatalog && itemCode && itemDescription && itemUnit && itemPrice) createItem.mutate({ catalogId: selectedCatalog.id, code: itemCode, description: itemDescription, unit: itemUnit, itemType, unitPrice: Number(itemPrice) }); }}>
            <input value={itemCode} onChange={event => setItemCode(event.target.value)} placeholder="Código" required />
            <input value={itemDescription} onChange={event => setItemDescription(event.target.value)} placeholder="Descrição" required />
            <input value={itemUnit} onChange={event => setItemUnit(event.target.value)} placeholder="Un." required />
            <select value={itemType} onChange={event => setItemType(event.target.value as typeof itemType)}>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <input type="number" min="0" step="0.01" value={itemPrice} onChange={event => setItemPrice(event.target.value)} placeholder="Preço" required />
            <button className="outline-button" disabled={!selectedCatalog || createItem.isPending}><Plus size={13} /> Adicionar</button>
          </form>
          {createItem.error && <p className="form-error">{createItem.error.message}</p>}
          <div className="catalog-list">
            {catalogQuery.data?.priceItems.map(item => <div className="catalog-list-row" key={item.id}><div><strong>{item.code} · {item.description}</strong><span>{typeLabels[item.itemType]} · {item.unit}</span></div><b>{money(Number(item.unitPrice))}</b></div>)}
            {!catalogQuery.data?.priceItems.length && <div className="module-empty">Nenhum item nesta fonte.</div>}
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
              {catalogQuery.data?.components.map(component => <div className="catalog-list-row" key={component.id}><div><strong>{component.priceItemId} · componente</strong><span>{component.componentType} · coeficiente {component.coefficient}</span></div><b>{money(Number(component.coefficient) * Number(component.unitPriceSnapshot))}</b></div>)}
              {!catalogQuery.data?.components.length && <div className="module-empty">Adicione componentes para calcular o custo unitário.</div>}
            </div>
          </> : <div className="module-empty"><Calculator size={20} /> Crie ou selecione uma composição.</div>}
        </section>
      </div>
    </div>
  );
}
