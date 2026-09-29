import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Edit3, Layers3, Minus, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { McpE2EWorkbench } from "./McpE2EWorkbench";
import { McpMutationWorkbench } from "./McpMutationWorkbench";
import { McpProjectMapping } from "./McpProjectMapping";
import { Phase7ImportWorkbench } from "./Phase7ImportWorkbench";
import { TIPOS_DE_OBRA, type TipoDeObra } from "@shared/eap-engine";

export function EapView({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const wbsQuery = trpc.projects.wbs.useQuery({ projectId });
  const utils = trpc.useUtils();
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const mcpDebugEnabled = useMemo(() => new URLSearchParams(window.location.search).get("mcpdebug") === "1", []);
  const [creatingChild, setCreatingChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [operationError, setOperationError] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const collapseInitializedFor = useRef<number | null>(null);
  const [draft, setDraft] = useState({
    code: "",
    name: "",
    nodeType: "pacote",
    unit: "",
    plannedQuantity: "",
  });
  const nodes = wbsQuery.data ?? [];

  const initializeMutation = trpc.projects.initializePlan.useMutation({
    onSuccess: () => void wbsQuery.refetch(),
    onError: error => setOperationError(error.message),
  });
  // Regenera a EAP a partir do catálogo de preços. Só faz sentido quando a obra
  // nasceu sem base importada: com nós já existentes, o seeder é idempotente
  // e devolve aviso em vez de duplicar a estrutura.
  const [eapNotice, setEapNotice] = useState<string | null>(null);
  const [eapKind, setEapKind] = useState<TipoDeObra>("edificio");
  const generateEap = trpc.projects.generateEapFromCatalog.useMutation({
    onSuccess: async result => {
      const s = result.semeadura;
      setEapNotice(
        s.nosCriados > 0
          ? `EAP gerada do catálogo ${s.catalogo?.nome ?? ""} (${s.catalogo?.referencia ?? ""}): ${s.nosCriados} nós, ${s.servicosUsados} serviços. Orçamento inicial gerado com ${s.itensDeOrcamentoCriados} itens já com preço do catálogo — falta só lançar as quantidades.`
          : s.aviso
      );
      await utils.projects.wbs.invalidate({ projectId });
      await wbsQuery.refetch();
      await utils.budgets.list.invalidate({ projectId });
    },
    onError: error => setOperationError(error.message),
  });
  const updateNode = trpc.projects.updateWbsNode.useMutation({
    onSuccess: async () => {
      await utils.projects.wbs.invalidate({ projectId });
      setEditingNodeId(null);
      setOperationError("");
    },
    onError: error => setOperationError(error.message),
  });
  const createNode = trpc.projects.createWbsNode.useMutation({
    onSuccess: async () => {
      await utils.projects.wbs.invalidate({ projectId });
      setOperationError("");
    },
    onError: error => setOperationError(error.message),
  });
  const moveNode = trpc.projects.moveWbsNode.useMutation({
    onSuccess: async () => {
      await utils.projects.wbs.invalidate({ projectId });
      setOperationError("");
    },
    onError: error => setOperationError(error.message),
  });
  const duplicateNode = trpc.projects.duplicateWbsNode.useMutation({
    onSuccess: async () => {
      await utils.projects.wbs.invalidate({ projectId });
      setOperationError("");
    },
    onError: error => setOperationError(error.message),
  });
  const deleteNode = trpc.projects.deleteWbsNode.useMutation({
    onSuccess: async () => {
      setSelectedNodeId(null);
      await utils.projects.wbs.invalidate({ projectId });
      setOperationError("");
    },
    onError: error => setOperationError(error.message),
  });
  const structuralMutationPending = initializeMutation.isPending || createNode.isPending || moveNode.isPending || duplicateNode.isPending || deleteNode.isPending;

  const childrenByParent = useMemo(() => {
    const grouped = new Map<number | null, typeof nodes>();
    for (const node of nodes) {
      const siblings = grouped.get(node.parentId) ?? [];
      siblings.push(node);
      grouped.set(node.parentId, siblings);
    }
    for (const siblings of Array.from(grouped.values())) {
      siblings.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
    }
    return grouped;
  }, [nodes]);

  useEffect(() => {
    if (!nodes.length || collapseInitializedFor.current === projectId) return;
    const initialCollapsed = new Set<number>();
    for (const node of nodes) {
      if (node.level >= 3 && (childrenByParent.get(node.id)?.length ?? 0) > 0) initialCollapsed.add(node.id);
    }
    setCollapsedIds(initialCollapsed);
    collapseInitializedFor.current = projectId;
  }, [nodes, projectId, childrenByParent]);

  const visibleNodes = useMemo(() => {
    const flattened: Array<{ node: (typeof nodes)[number]; depth: number }> = [];
    const visit = (parentId: number | null, depth: number) => {
      for (const node of childrenByParent.get(parentId) ?? []) {
        flattened.push({ node, depth });
        if (!collapsedIds.has(node.id)) visit(node.id, depth + 1);
      }
    };
    visit(null, 0);
    return flattened;
  }, [childrenByParent, collapsedIds, nodes]);

  const selectedNode = nodes.find(node => node.id === selectedNodeId);
  const editingNode = nodes.find(node => node.id === editingNodeId);
  const hasChildren = (nodeId: number) => (childrenByParent.get(nodeId)?.length ?? 0) > 0;
  const isExpanded = (nodeId: number) => !collapsedIds.has(nodeId);
  const toggleNode = (nodeId: number) => {
    setCollapsedIds(current => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const expandAll = () => setCollapsedIds(new Set());
  const collapseBranches = () => setCollapsedIds(new Set(nodes.filter(node => hasChildren(node.id) && node.level >= 2).map(node => node.id)));
  const allVisibleStructuralPending = structuralMutationPending || updateNode.isPending;

  useEffect(() => {
    if (!selectedNode) return;
    if (editingNodeId !== selectedNode.id) setEditingNodeId(null);
  }, [selectedNode, editingNodeId]);

  const startEditing = (node: (typeof nodes)[number]) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
    setDraft({
      code: node.code,
      name: node.name,
      nodeType: node.nodeType,
      unit: node.unit ?? "",
      plannedQuantity: node.plannedQuantity === null || node.plannedQuantity === undefined ? "" : String(node.plannedQuantity),
    });
  };

  const saveEditing = () => {
    if (!editingNode) return;
    updateNode.mutate({
      projectId,
      nodeId: editingNode.id,
      code: draft.code,
      name: draft.name,
      nodeType: draft.nodeType as "grupo" | "pacote" | "entrega",
      unit: draft.unit || undefined,
      plannedQuantity: draft.plannedQuantity ? Number(draft.plannedQuantity) : undefined,
    });
  };

  const createChild = () => {
    if (!selectedNode || !newChildName.trim()) return;
    createNode.mutate({
      projectId,
      parentId: selectedNode.id,
      name: newChildName.trim(),
      nodeType: selectedNode.nodeType === "grupo" ? "pacote" : "entrega",
    });
    setNewChildName("");
    setCreatingChild(false);
    setCollapsedIds(current => {
      const next = new Set(current);
      next.delete(selectedNode.id);
      return next;
    });
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selectedNode) return;
    const siblings = childrenByParent.get(selectedNode.parentId) ?? [];
    const currentIndex = siblings.findIndex(node => node.id === selectedNode.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    moveNode.mutate({ projectId, nodeId: selectedNode.id, targetParentId: selectedNode.parentId, targetIndex });
  };

  const removeSelected = () => {
    if (!selectedNode) return;
    if (window.confirm(`Excluir ${selectedNode.code} · ${selectedNode.name} e seus descendentes?`)) {
      deleteNode.mutate({ projectId, nodeId: selectedNode.id });
    }
  };

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon"><Layers3 size={22} /></div>
        <div>
          <p className="eyebrow accent">ESTRUTURA ANALÍTICA DO PROJETO</p>
          <h2>EAP da obra</h2>
          <p>{projectName} · escopo organizado em grupos, pacotes e entregas.</p>
        </div>
      </div>
      <div className="module-card eap-card">
        <div className="panel-heading eap-heading">
          <div>
            <h3>Estrutura de entregas</h3>
            <p>{nodes.length} itens na estrutura · expanda cada etapa para editar seus pacotes.</p>
          </div>
          <div className="eap-tree-actions">
            <button className="outline-button" onClick={expandAll} disabled={!nodes.length || allVisibleStructuralPending}><Plus size={13} /> Expandir</button>
            <button className="outline-button" onClick={collapseBranches} disabled={!nodes.length || allVisibleStructuralPending}><Minus size={13} /> Recolher</button>
            <span className="live-badge"><span /> DADOS REAIS</span>
          </div>
        </div>
        <div className="eap-structure-legend">
          <span><b>Grupo</b> macroentrega</span>
          <span><b>Pacote</b> unidade de controle</span>
          <span><b>Entrega</b> item mensurável</span>
        </div>
        {operationError && <div className="eap-operation-error" role="alert"><span>{operationError}</span><button onClick={() => setOperationError("")} aria-label="Fechar erro"><X size={13} /></button></div>}
        {wbsQuery.isPending ? (
          <div className="module-empty">Carregando a EAP da obra...</div>
        ) : wbsQuery.isError ? (
          <div className="module-empty eap-empty-state"><span>Não foi possível carregar a EAP: {wbsQuery.error.message}</span><button className="outline-button" onClick={() => void wbsQuery.refetch()}><RefreshCw size={13} /> Tentar novamente</button></div>
        ) : nodes.length === 0 ? (
          <div className="module-empty eap-empty-state">
            <strong>Esta obra ainda não tem EAP</strong>
            <span>
              A estrutura é montada a partir dos serviços da base oficial de
              preços (SEINFRA), e não de um modelo genérico: cada item carrega o
              código do serviço, e é isso que faz o orçamento encontrar o preço
              sem você digitá-lo.
            </span>
            {eapNotice && <span style={{ color: "var(--warn)" }}>{eapNotice}</span>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center", marginTop: 4 }}>
              <select
                value={eapKind}
                onChange={event => setEapKind(event.target.value as TipoDeObra)}
                style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surf)" }}
                aria-label="Tipo de obra"
              >
                {TIPOS_DE_OBRA.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                className="primary-button"
                disabled={generateEap.isPending}
                onClick={() => generateEap.mutate({ projectId, tipoDeObra: eapKind })}
              >
                {generateEap.isPending ? "Gerando..." : "Gerar EAP do catálogo"}
              </button>
              <button
                className="outline-button"
                disabled={initializeMutation.isPending}
                onClick={() => initializeMutation.mutate({ projectId })}
                title="Estrutura genérica de demonstração, sem ligação com o catálogo de preços"
              >
                {initializeMutation.isPending ? "Gerando..." : "Usar estrutura modelo"}
              </button>
            </div>
            {eapNotice?.includes("Nenhuma base") && (
              <span>Sem base importada, a EAP não pode ser gerada. Vá ao <strong>Catálogo</strong> e importe a planilha da SEINFRA.</span>
            )}
          </div>
        ) : (
          <div className="eap-tree" role="tree" aria-label="Árvore hierárquica da EAP">
            {visibleNodes.map(({ node, depth }) => {
              const branch = hasChildren(node.id);
              return (
                <div
                  className={`eap-node-row level-${node.level} ${selectedNodeId === node.id ? "selected" : ""}`}
                  key={node.id}
                  role="treeitem"
                  aria-level={depth + 1}
                  aria-expanded={branch ? isExpanded(node.id) : undefined}
                  style={{ paddingLeft: `${20 + depth * 26}px` }}
                  onClick={() => setSelectedNodeId(node.id)}
                  onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedNodeId(node.id); }}
                  tabIndex={0}
                >
                  {branch ? <button className="eap-branch-toggle" onClick={event => { event.stopPropagation(); toggleNode(node.id); }} aria-label={isExpanded(node.id) ? `Recolher ${node.name}` : `Expandir ${node.name}`} aria-expanded={isExpanded(node.id)}>{isExpanded(node.id) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button> : <span className="eap-branch-spacer" />}
                  <span className="eap-node-code">{node.code}</span>
                  <strong>{node.name}</strong>
                  <span className="eap-node-type">{node.nodeType}</span>
                  {selectedNodeId === node.id && <span className="eap-node-edit-hint"><Edit3 size={13} /> Editar</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectedNode && (
        <div className="module-card eap-node-detail">
          <div className="eap-detail-heading">
            <div><span className="eyebrow">ITEM SELECIONADO</span><strong>{selectedNode.code} · {selectedNode.name}</strong><p>{selectedNode.nodeType} · nível {selectedNode.level}{selectedNode.unit ? ` · unidade ${selectedNode.unit}` : ""}</p></div>
            {editingNodeId !== selectedNode.id && (
              <div className="eap-detail-actions">
                <button className="outline-button" disabled={allVisibleStructuralPending} onClick={() => setCreatingChild(value => !value)}><Plus size={14} /> Adicionar filho</button>
                <button className="outline-button" disabled={allVisibleStructuralPending} onClick={() => duplicateNode.mutate({ projectId, nodeId: selectedNode.id })}><Copy size={14} /> Duplicar</button>
                <button className="icon-button" disabled={allVisibleStructuralPending} title="Mover para cima" onClick={() => moveSelected(-1)}><ArrowUp size={14} /></button>
                <button className="icon-button" disabled={allVisibleStructuralPending} title="Mover para baixo" onClick={() => moveSelected(1)}><ArrowDown size={14} /></button>
                <button className="outline-button danger-button" disabled={allVisibleStructuralPending} onClick={removeSelected}><Trash2 size={14} /> Excluir</button>
                <button className="primary-button" disabled={allVisibleStructuralPending} onClick={() => startEditing(selectedNode)}><Edit3 size={14} /> Editar item</button>
              </div>
            )}
          </div>
          {creatingChild && editingNodeId !== selectedNode.id && <div className="eap-quick-create"><label>Nome do novo {selectedNode.nodeType === "grupo" ? "pacote" : "entrega"}<input autoFocus value={newChildName} onChange={event => setNewChildName(event.target.value)} placeholder="Ex.: Alvenaria do pavimento" /></label><button className="primary-button" disabled={createNode.isPending || !newChildName.trim()} onClick={createChild}><Plus size={14} /> {createNode.isPending ? "Criando..." : "Criar item"}</button></div>}
          {editingNodeId === selectedNode.id && <div className="eap-edit-panel"><div className="eap-edit-grid"><label>Código<input value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} /></label><label className="eap-edit-wide">Nome<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Tipo<select value={draft.nodeType} onChange={event => setDraft({ ...draft, nodeType: event.target.value })}><option value="grupo">Grupo</option><option value="pacote">Pacote</option><option value="entrega">Entrega</option></select></label><label>Unidade<input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} placeholder="m², m³, un." /></label><label>Quantidade planejada<input type="number" min="0" step="1" value={draft.plannedQuantity} onChange={event => setDraft({ ...draft, plannedQuantity: event.target.value })} /></label></div><div className="eap-edit-actions"><button className="outline-button" disabled={updateNode.isPending} onClick={() => { setEditingNodeId(null); updateNode.reset(); }}><X size={14} /> Cancelar</button><button className="primary-button" disabled={updateNode.isPending || !draft.code.trim() || !draft.name.trim()} onClick={saveEditing}><Check size={14} /> {updateNode.isPending ? "Salvando..." : "Salvar alterações"}</button></div></div>}
        </div>
      )}
      {mcpDebugEnabled && <section className="module-card eap-advanced-tools"><div className="panel-heading"><div><span className="eyebrow">INTEGRAÇÕES AVANÇADAS</span><h3>Homologação e integração MCP</h3><p>Ferramentas de diagnóstico e importação são carregadas somente quando necessárias.</p></div><button className="outline-button" onClick={() => setShowAdvancedTools(current => !current)} aria-expanded={showAdvancedTools}>{showAdvancedTools ? "Ocultar ferramentas" : "Abrir ferramentas"}</button></div>{showAdvancedTools && <div className="eap-advanced-tools-body"><McpProjectMapping projectId={projectId} /><Phase7ImportWorkbench projectId={projectId} /><McpMutationWorkbench projectId={projectId} /><McpE2EWorkbench projectId={projectId} /></div>}</section>}
    </div>
  );
}
