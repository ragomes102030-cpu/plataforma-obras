import { trpc } from "@/lib/trpc";
import { ChevronRight, Layers3 } from "lucide-react";

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
              <div className={`eap-node level-${node.level}`} key={node.id}>
                <span className="eap-node-code">{node.code}</span>
                <ChevronRight size={14} className="eap-node-chevron" />
                <strong>{node.name}</strong>
                <span className="eap-node-type">{node.nodeType}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
