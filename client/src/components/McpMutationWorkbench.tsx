import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Eye, Send } from "lucide-react";
import { useState } from "react";

const exampleArgs = JSON.stringify(
  {
    parent_id: "<id-da-raiz-no-mcp-eap>",
    code: "HOM-01",
    name: "Pacote de homologação",
    node_type: "pacote",
  },
  null,
  2
);

export function McpMutationWorkbench({ projectId }: { projectId: number }) {
  const [argsText, setArgsText] = useState(exampleArgs);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const previewMutation = trpc.integrations.mutationPreview.useMutation();
  const confirmMutation = trpc.integrations.confirmMutation.useMutation();
  const preview = previewMutation.data;
  const parseArgs = () => {
    try {
      const args = JSON.parse(argsText) as unknown;
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("Os argumentos devem ser um objeto JSON.");
      }
      return args as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "JSON de argumentos inválido."
      );
    }
  };

  const createPreview = () => {
    try {
      previewMutation.mutate({
        projectId,
        provider: "eap",
        toolName: "criar_eap_node",
        args: parseArgs(),
        idempotencyKey: `homologacao-${projectId}-${Date.now()}`,
      });
    } catch (error) {
      previewMutation.reset();
      window.alert(error instanceof Error ? error.message : "JSON inválido.");
    }
  };

  const confirm = () => {
    if (!preview || confirmationPhrase !== "CONFIRMAR") return;
    confirmMutation.mutate({
      operationId: preview.id,
      confirmationToken: preview.confirmationToken,
      confirmationPhrase: "CONFIRMAR",
    });
  };

  return (
    <section className="module-card mcp-mutation-card">
      <div className="panel-heading">
        <div>
          <div className="title-with-badge">
            <h3>Teste de mutação controlada</h3>
            <span className="live-badge warning-badge">
              <span /> CONFIRMAÇÃO OBRIGATÓRIA
            </span>
          </div>
          <p>
            Primeira operação habilitada: criar um nó de EAP no projeto externo.
          </p>
        </div>
        <AlertTriangle size={18} className="mcp-mutation-icon" />
      </div>
      <div className="mcp-mutation-warning">
        <AlertTriangle size={14} />
        <span>
          Use somente uma obra de homologação. A confirmação abaixo pode alterar
          o MCP EAP externo; exclusões continuam bloqueadas.
        </span>
      </div>
      <div className="mcp-mutation-form">
        <label htmlFor="mcp-mutation-args">Argumentos JSON da operação</label>
        <textarea
          id="mcp-mutation-args"
          value={argsText}
          onChange={event => setArgsText(event.target.value)}
          spellCheck={false}
        />
        <div className="mcp-mutation-actions">
          <button
            className="outline-button"
            disabled={previewMutation.isPending}
            onClick={createPreview}
          >
            <Eye size={13} />
            {previewMutation.isPending ? "Preparando..." : "Gerar prévia"}
          </button>
          <span>
            A prévia grava apenas a intenção local; ainda não chama o MCP.
          </span>
        </div>
      </div>
      {previewMutation.error && (
        <p className="mcp-mutation-error" role="alert">
          {previewMutation.error.message}
        </p>
      )}
      {preview && preview.status === "preview" && (
        <div className="mcp-mutation-confirmation">
          <div className="mcp-mutation-preview-head">
            <strong>Prévia #{preview.id}</strong>
            <span>Idempotência: {preview.idempotencyKey}</span>
          </div>
          <pre>{preview.argsJson}</pre>
          <label htmlFor="mcp-confirmation-phrase">
            Digite <strong>CONFIRMAR</strong> para autorizar a chamada externa
          </label>
          <div className="mcp-mutation-confirm-row">
            <input
              id="mcp-confirmation-phrase"
              value={confirmationPhrase}
              onChange={event => setConfirmationPhrase(event.target.value)}
              placeholder="CONFIRMAR"
            />
            <button
              className="primary-button danger-button"
              disabled={
                confirmMutation.isPending || confirmationPhrase !== "CONFIRMAR"
              }
              onClick={confirm}
            >
              <Send size={13} />
              {confirmMutation.isPending ? "Executando..." : "Confirmar e executar"}
            </button>
          </div>
        </div>
      )}
      {confirmMutation.error && (
        <p className="mcp-mutation-error" role="alert">
          {confirmMutation.error.message}
        </p>
      )}
      {confirmMutation.data && (
        <div className="mcp-mutation-success">
          <CheckCircle2 size={15} />
          <span>
            Operação registrada como concluída. ID local: {confirmMutation.data.operationId}
          </span>
        </div>
      )}
    </section>
  );
}
