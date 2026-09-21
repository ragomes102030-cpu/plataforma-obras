import { trpc } from "@/lib/trpc";
import { Check, ChevronRight, Edit3, Layers3, X } from "lucide-react";
import { useEffect, useState } from "react";
import { McpE2EWorkbench } from "./McpE2EWorkbench";
import { McpMutationWorkbench } from "./McpMutationWorkbench";
import { McpProjectMapping } from "./McpProjectMapping";
import { Phase7ImportWorkbench } from "./Phase7ImportWorkbench";

export function EapView({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const wbsQuery = trpc.projects.wbs.useQuery({ projectId });
  const utils = trpc.useUtils();
  const initializeMutation = trpc.projects.initializePlan.useMutation({
    onSuccess: () => void wbsQuery.refetch(),
  });
  const updateNode = trpc.projects.updateWbsNode.useMutation({
    onSuccess: async () => {
      await utils.projects.wbs.invalidate({ projectId });
      setEditingNodeId(null);
    },
  });
  const nodes = wbsQuery.data ?? [];
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [draft, setDraft] = useState({
    code: "",
    name: "",
    nodeType: "pacote",
    unit: "",
    plannedQuantity: "",
  });
  const selectedNode = nodes.find(node => node.id === selectedNodeId);
  const editingNode = nodes.find(node => node.id === editingNodeId);

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
      plannedQuantity:
        node.plannedQuantity === null || node.plannedQuantity === undefined
          ? ""
          : String(node.plannedQuantity),
    });
  };

  const cancelEditing = () => {
    setEditingNodeId(null);
    updateNode.reset();
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
      plannedQuantity: draft.plannedQuantity
        ? Number(draft.plannedQuantity)
        : undefined,
    });
  };

  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Layers3 size={22} />
        </div>
        <div>
          <p className="eyebrow accent">ESTRUTURA ANALÍTICA DO PROJETO</p>
          <h2>EAP da obra</h2>
          <p>
            {projectName} · escopo organizado em grupos e pacotes de trabalho.
          </p>
        </div>
      </div>
      <div className="module-card eap-card">
        <div className="panel-heading eap-heading">
          <div>
            <h3>Estrutura de entregas</h3>
            <p>{nodes.length} itens persistidos no banco · clique em um item para editar</p>
          </div>
          <span className="live-badge">
            <span /> DADOS REAIS
          </span>
        </div>
        {wbsQuery.isPending ? (
          <div className="module-empty">Carregando a EAP da obra...</div>
        ) : wbsQuery.isError ? (
          <div className="module-empty eap-empty-state">
            <span>Não foi possível carregar a EAP: {wbsQuery.error.message}</span>
            <button className="outline-button" onClick={() => void wbsQuery.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="module-empty eap-empty-state">
            <span>Esta obra ainda não possui uma EAP montada.</span>
            <button
              className="primary-button"
              disabled={initializeMutation.isPending}
              onClick={() => initializeMutation.mutate({ projectId })}
            >
              {initializeMutation.isPending ? "Montando..." : "Montar plano inicial"}
            </button>
          </div>
        ) : (
          <div className="eap-tree">
            {nodes.map(node => (
              <button
                className={`eap-node level-${node.level} ${selectedNodeId === node.id ? "selected" : ""}`}
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                aria-label={`Selecionar ${node.code} ${node.name}`}
              >
                <span className="eap-node-code">{node.code}</span>
                <ChevronRight size={14} className="eap-node-chevron" />
                <strong>{node.name}</strong>
                <span className="eap-node-type">{node.nodeType}</span>
                {selectedNodeId === node.id && (
                  <span className="eap-node-edit-hint"><Edit3 size={13} /> Editar</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedNode && (
        <div className="module-card eap-node-detail">
          <div className="eap-detail-heading">
            <div>
              <span className="eyebrow">ITEM SELECIONADO</span>
              <strong>{selectedNode.code} · {selectedNode.name}</strong>
              <p>{selectedNode.nodeType} · nível {selectedNode.level}{selectedNode.unit ? ` · unidade ${selectedNode.unit}` : ""}</p>
            </div>
            {editingNodeId !== selectedNode.id && (
              <button className="primary-button" onClick={() => startEditing(selectedNode)}>
                <Edit3 size={14} /> Editar item
              </button>
            )}
          </div>
          {editingNodeId === selectedNode.id && (
            <div className="eap-edit-panel">
              <div className="eap-edit-grid">
                <label>Código<input value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} /></label>
                <label className="eap-edit-wide">Nome<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
                <label>Tipo<select value={draft.nodeType} onChange={event => setDraft({ ...draft, nodeType: event.target.value })}><option value="grupo">Grupo</option><option value="pacote">Pacote</option><option value="entrega">Entrega</option></select></label>
                <label>Unidade<input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} placeholder="m², m³, un." /></label>
                <label>Quantidade planejada<input type="number" min="0" step="1" value={draft.plannedQuantity} onChange={event => setDraft({ ...draft, plannedQuantity: event.target.value })} /></label>
              </div>
              <div className="eap-edit-actions">
                {updateNode.error && <span className="eap-edit-error">Não foi possível salvar: {updateNode.error.message}</span>}
                <button className="outline-button" onClick={cancelEditing}><X size={14} /> Cancelar</button>
                <button className="primary-button" disabled={updateNode.isPending || !draft.code.trim() || !draft.name.trim()} onClick={saveEditing}><Check size={14} /> {updateNode.isPending ? "Salvando..." : "Salvar alterações"}</button>
              </div>
            </div>
          )}
        </div>
      )}
      <section className="module-card eap-advanced-tools">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">INTEGRAÇÕES AVANÇADAS</span>
            <h3>Homologação e integração MCP</h3>
            <p>Ferramentas de diagnóstico e importação são carregadas somente quando necessárias.</p>
          </div>
          <button className="outline-button" onClick={() => setShowAdvancedTools(current => !current)} aria-expanded={showAdvancedTools}>
            {showAdvancedTools ? "Ocultar ferramentas" : "Abrir ferramentas"}
          </button>
        </div>
        {showAdvancedTools && (
          <div className="eap-advanced-tools-body">
            <McpProjectMapping projectId={projectId} />
            <Phase7ImportWorkbench projectId={projectId} />
            <McpMutationWorkbench projectId={projectId} />
            <McpE2EWorkbench projectId={projectId} />
          </div>
        )}
      </section>
    </div>
  );
}
EOF
