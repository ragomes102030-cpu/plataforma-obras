import { trpc } from "@/lib/trpc";
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  Link2,
  Play,
  RefreshCw,
  Save,
} from "lucide-react";
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
  const statusQuery = trpc.integrations.mcpStatus.useQuery(undefined, {
    enabled: false,
  });
  const saveMutation = trpc.integrations.saveProjectMapping.useMutation({
    onSuccess: () => void mappingsQuery.refetch(),
  });
  const homologationMutation = trpc.integrations.homologateProject.useMutation({
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

  const allMapped = providers.every(provider =>
    Boolean(
      mappingsQuery.data?.find(item => item.provider === provider)
        ?.externalProjectId
    )
  );

  return (
    <section className="module-card mcp-mapping-card">
      <div className="panel-heading">
        <div>
          <div className="title-with-badge">
            <h3>Conexões dos MCPs</h3>
            <span className="live-badge">
              <span /> STATUS REAL
            </span>
          </div>
          <p>
            Aponte esta obra para um projeto externo e teste a conexão antes de
            importar dados.
          </p>
        </div>
        <Link2 size={18} className="mcp-mapping-icon" />
      </div>
      <div className="mcp-homologation-action">
        <button
          className="outline-button"
          disabled={statusQuery.isFetching}
          onClick={() => void statusQuery.refetch()}
        >
          <RefreshCw size={13} />
          {statusQuery.isFetching ? "Testando conexões..." : "Testar conexões MCP"}
        </button>
        <span>
          {statusQuery.data
            ? `Status geral: ${statusQuery.data.status} · ${statusQuery.data.durationMs} ms`
            : "Executa initialize e tools/list sem alterar nenhum MCP."}
        </span>
      </div>
      <div className="mcp-mapping-notice">
        <CircleAlert size={14} />
        <span>
          Salvar registra apenas o vínculo local. O status só vira homologado
          depois de uma consulta bem-sucedida.
        </span>
      </div>
      <div className="mcp-homologation-action">
        <button
          className="primary-button"
          disabled={homologationMutation.isPending || !allMapped}
          onClick={() => homologationMutation.mutate({ projectId })}
        >
          <Play size={13} />
          {homologationMutation.isPending
            ? "Executando consultas..."
            : "Executar homologação somente leitura"}
        </button>
        <span>
          Consulta uma ferramenta permitida por MCP e não executa operações de
          escrita.
        </span>
      </div>
      <div className="mcp-mapping-list">
        {providers.map(provider => {
          const mapping = mappingsQuery.data?.find(
            item => item.provider === provider
          );
          const saved =
            mapping?.syncState === "ready" && !!mapping.externalProjectId;
          const serverStatus = statusQuery.data?.servers[provider];
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
                    saveMutation.isPending ||
                    !drafts[provider].trim() ||
                    (saved && drafts[provider] === mapping?.externalProjectId)
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
              <span
                className={`mcp-mapping-state ${saved ? "ready" : "pending"}`}
              >
                {saved ? <CircleCheck size={13} /> : <CircleAlert size={13} />}
                {saved
                  ? "Homologado"
                  : mapping?.externalProjectId
                    ? "Aguardando teste"
                    : "Pendente"}
              </span>
              {serverStatus && (
                <small className="mcp-mapping-status">
                  {serverStatus.status === "online" ? "Online" : "Offline"}
                  {` · ${serverStatus.latencyMs} ms · ${serverStatus.toolCount} ferramentas`}
                </small>
              )}
            </div>
          );
        })}
      </div>
      {saveMutation.error && (
        <p className="mcp-mapping-error" role="alert">
          {saveMutation.error.message}
        </p>
      )}
      {statusQuery.error && (
        <p className="mcp-mapping-error" role="alert">
          Não foi possível testar os MCPs: {statusQuery.error.message}
        </p>
      )}
      {homologationMutation.error && (
        <p className="mcp-mapping-error" role="alert">
          {homologationMutation.error.message}
        </p>
      )}
      {homologationMutation.data && (
        <div className="mcp-homologation-result">
          <div className="mcp-homologation-result-heading">
            <strong>Resultado da homologação</strong>
            <span>
              <Clock3 size={12} /> {homologationMutation.data.durationMs} ms ·
              requestId {homologationMutation.data.requestId}
            </span>
          </div>
          <div className="mcp-homologation-grid">
            {providers.map(provider => {
              const result = homologationMutation.data.servers[provider];
              const passed = result.status === "passed";
              return (
                <div
                  className={`mcp-homologation-server ${result.status}`}
                  key={provider}
                >
                  <span>
                    {passed ? <CircleCheck size={12} /> : <CircleAlert size={12} />}
                    {providerLabels[provider]}
                  </span>
                  <strong>
                    {result.status === "passed"
                      ? "Aprovado"
                      : result.status === "skipped"
                        ? "Não executado"
                        : "Falhou"}
                  </strong>
                  <small>
                    {result.toolName ?? "sem ferramenta"} · {result.durationMs} ms
                  </small>
                  <small>{result.error ?? result.detail}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
