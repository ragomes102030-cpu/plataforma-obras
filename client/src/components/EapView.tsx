import { trpc } from "@/lib/trpc";
import { ChevronRight, Layers3 } from "lucide-react";
import { useState } from "react";
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
  const initializeMutation = trpc.projects.initializePlan.useMutation({
    onSuccess: () => void wbsQuery.refetch(),
  });
  const nodes = wbsQuery.data ?? [];
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const selectedNode = nodes.find(node => node.id === selectedNodeId);

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
            <p>{nodes.length} itens persistidos no banco</p>
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
              {initializeMutation.isPending
                ? "Montando..."
                : "Montar plano inicial"}
            </button>
          </div>
        ) : (
          <div className="eap-tree">
            {nodes.map(node => (
              <button
                className={`eap-node level-${node.level} ${selectedNodeId === node.id ? "selected" : ""}`}
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span className="eap-node-code">{node.code}</span>
                <ChevronRight size={14} className="eap-node-chevron" />
                <strong>{node.name}</strong>
                <span className="eap-node-type">{node.nodeType}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedNode && (
        <div className="module-card eap-node-detail">
          <span className="eyebrow">ITEM SELECIONADO</span>
          <strong>{selectedNode.code} · {selectedNode.name}</strong>
          <p>{selectedNode.nodeType} · nível {selectedNode.level}{selectedNode.unit ? ` · unidade ${selectedNode.unit}` : ""}</p>
        </div>
      )}
      <section className="module-card eap-advanced-tools">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">INTEGRAÇÕES AVANÇADAS</span>
            <h3>Homologação e integração MCP</h3>
            <p>
              Ferramentas de diagnóstico e importação são carregadas somente
              quando necessárias.
            </p>
          </div>
          <button
            className="outline-button"
            onClick={() => setShowAdvancedTools(current => !current)}
            aria-expanded={showAdvancedTools}
          >
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
