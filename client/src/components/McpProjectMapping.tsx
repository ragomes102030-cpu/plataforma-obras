import { trpc } from "@/lib/trpc";
import { CircleAlert, CircleCheck, Link2, Save } from "lucide-react";
import { useEffect, useState } from "react";

type Provider = "eap" | "cronograma" | "ganttLob";

const providerLabels: Record<Provider, string> = {
  eap: "MCP EAP",
  cronograma: "MCP Cronograma",
  ganttLob: "MCP Gantt / LOB",
};

const providers: Provider[] = ["eap", "cronograma", "ganttLob"];

export function McpProjectMapping({ projectId }: { projectId: number }) {
  const mappingsQuery = trpc.integrations.projectMappings.useQuery({
    projectId,
  });
  const saveMutation = trpc.integrations.saveProjectMapping.useMutation({
    onSuccess: () => void mappingsQuery.refetch(),
  });
  const [drafts, setDrafts] = useState<Record<Provider, string>>({
    eap: "",
    cronograma: "",
    ganttLob: "",
  });

  useEffect(() => {
    if (!mappingsQuery.data) return;
    setDrafts(current => {
      const next = { ...current };
      for (const mapping of mappingsQuery.data) {
        next[mapping.provider] = mapping.externalProjectId ?? "";
      }
      return next;
    });
  }, [mappingsQuery.data]);

  return (
    <section className="module-card mcp-mapping-card">
      <div className="panel-heading">
        <div>
          <div className="title-with-badge">
            <h3>Identidade dos MCPs</h3>
            <span className="live-badge">
              <span /> VÍNCULO LOCAL
            </span>
          </div>
          <p>
            Aponte esta obra para um projeto externo distinto em cada domínio.
          </p>
        </div>
        <Link2 size={18} className="mcp-mapping-icon" />
      </div>
      <div className="mcp-mapping-notice">
        <CircleAlert size={14} />
        <span>
          Salvar apenas registra o vínculo local. Nenhum MCP é alterado nesta
          etapa.
        </span>
      </div>
      <div className="mcp-mapping-list">
        {providers.map(provider => {
          const mapping = mappingsQuery.data?.find(
            item => item.provider === provider
          );
          const saved = mapping?.syncState === "ready" && !!mapping.externalProjectId;
          return (
            <div className="mcp-mapping-row" key={provider}>
              <div className="mcp-mapping-label">
                <strong>{providerLabels[provider]}</strong>
                <span>{mapping?.endpointUrl ?? "URL não disponível"}</span>
              </div>
              <div className="mcp-mapping-input-wrap">
                <input
                  className="mcp-mapping-input"
                  value={drafts[provider]}
                  onChange={event =>
                    setDrafts(current => ({
                      ...current,
                      [provider]: event.target.value,
                    }))
                  }
                  placeholder="project_id externo"
                  aria-label={`project_id externo do ${providerLabels[provider]}`}
                />
                <button
                  className="outline-button mcp-mapping-save"
                  disabled={
                    saveMutation.isPending || !drafts[provider].trim() || saved && drafts[provider] === mapping?.externalProjectId
                  }
                  onClick={() =>
                    saveMutation.mutate({
                      projectId,
                      provider,
                      externalProjectId: drafts[provider].trim(),
                    })
                  }
                >
                  <Save size={13} /> Salvar
                </button>
              </div>
              <span className={`mcp-mapping-state ${saved ? "ready" : "pending"}`}>
                {saved ? <CircleCheck size={13} /> : <CircleAlert size={13} />}
                {saved ? "Vinculado" : "Pendente"}
              </span>
            </div>
          );
        })}
      </div>
      {saveMutation.error && (
        <p className="mcp-mapping-error" role="alert">
          {saveMutation.error.message}
        </p>
      )}
    </section>
  );
}
