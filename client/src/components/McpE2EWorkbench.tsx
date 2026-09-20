import { trpc } from "@/lib/trpc";
import { CheckCircle2, ClipboardCheck, Play, XCircle } from "lucide-react";
import { useState } from "react";

const providers = ["eap", "cronograma", "ganttLob"] as const;
const labels = {
  eap: "MCP EAP",
  cronograma: "MCP Cronograma",
  ganttLob: "MCP Gantt / LOB",
};

export function McpE2EWorkbench({ projectId }: { projectId: number }) {
  const [mutationOperationId, setMutationOperationId] = useState("");
  const e2eMutation = trpc.integrations.runIntegratedHomologation.useMutation();
  const run = () =>
    e2eMutation.mutate({
      projectId,
      mutationOperationId: mutationOperationId.trim()
        ? Number(mutationOperationId)
        : undefined,
    });
  const result = e2eMutation.data;

  return (
    <section className="module-card mcp-e2e-card">
      <div className="panel-heading">
        <div>
          <div className="title-with-badge">
            <h3>Corredor E2E de homologação</h3>
            <span className="live-badge">
              <span /> SOMENTE LEITURA + RECONCILIAÇÃO
            </span>
          </div>
          <p>
            Executa os probes dos três MCPs e compara a evidência da mutação
            local já concluída.
          </p>
        </div>
        <ClipboardCheck size={18} className="mcp-e2e-icon" />
      </div>
      <div className="mcp-e2e-notice">
        <CheckCircle2 size={14} />
        <span>
          Este corredor não cria nem altera dados externos. A mutação, quando
          informada, precisa ter sido confirmada anteriormente na bancada.
        </span>
      </div>
      <div className="mcp-e2e-controls">
        <label htmlFor="mcp-e2e-operation">
          ID da operação de mutação concluída (opcional)
        </label>
        <div className="mcp-e2e-control-row">
          <input
            id="mcp-e2e-operation"
            value={mutationOperationId}
            onChange={event => setMutationOperationId(event.target.value)}
            inputMode="numeric"
            placeholder="ex.: 42"
          />
          <button
            className="primary-button"
            disabled={
              e2eMutation.isPending ||
              (Boolean(mutationOperationId.trim()) &&
                !/^\d+$/.test(mutationOperationId.trim()))
            }
            onClick={run}
          >
            <Play size={13} />
            {e2eMutation.isPending ? "Executando E2E..." : "Executar corredor E2E"}
          </button>
        </div>
        <span>
          Sem ID, o teste valida somente leitura. Com ID, também reconcilia a
          operação concluída.
        </span>
      </div>
      {e2eMutation.error && (
        <p className="mcp-e2e-error" role="alert">
          {e2eMutation.error.message}
        </p>
      )}
      {result && (
        <div className="mcp-e2e-result">
          <div className="mcp-e2e-result-head">
            <strong>Execução #{result.runId}</strong>
            <span>
              {result.status} · requestId {result.requestId}
            </span>
          </div>
          <div className="mcp-e2e-grid">
            {providers.map(provider => {
              const server = result.result.servers[provider];
              const passed = server.status === "passed";
              return (
                <div className={`mcp-e2e-server ${server.status}`} key={provider}>
                  <span>
                    {passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {labels[provider]}
                  </span>
                  <strong>{passed ? "OK" : server.status}</strong>
                  <small>
                    {server.toolName ?? "sem probe"} · {server.durationMs} ms · {server.attempts} tentativa{server.attempts === 1 ? "" : "s"}
                  </small>
                  <small>{server.error ?? server.detail}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
