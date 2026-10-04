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

