import { trpc } from "@/lib/trpc";
import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useState } from "react";

type Phase7Preview = {
  projectId: number;
  projectExternalId: string;
  counts: { wbsNodes: number; activities: number; dependencies: number };
  criticalPath: string[];
  totalDurationDays: number | null;
  plan: unknown;
};

export function Phase7ImportWorkbench({ projectId }: { projectId: number }) {
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [preview, setPreview] = useState<Phase7Preview | null>(null);
  const previewMutation = trpc.integrations.phase7PreviewImport.useMutation({
    onSuccess: setPreview,
  });
  const importMutation = trpc.integrations.phase7ImportLocal.useMutation({
    onSuccess: () => {
      setConfirmationPhrase("");
      setPreview(null);
    },
  });

  return (
    <section className="module-card" aria-labelledby="phase7-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow accent">FASE 7 · IMPORTAÇÃO</p>
          <h3 id="phase7-title">Importar EAP e cronograma de homologação</h3>
          <p>
            Lê a obra MCP vinculada, valida referências e prepara uma importação idempotente no banco local.
            Nenhuma escrita externa é executada.
          </p>
        </div>
      </div>
      <div className="button-row">
        <button
          className="secondary-button"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate({ projectId })}
        >
          <RefreshCw size={14} />
          {previewMutation.isPending ? "Lendo homologação..." : "Gerar preview"}
        </button>
      </div>
      {previewMutation.error && <p className="mcp-e2e-error" role="alert">{previewMutation.error.message}</p>}
      {preview && (
        <div className="mcp-e2e-result">
          <div className="mcp-e2e-result-head">
            <strong>Preview validado</strong>
            <span>{preview.projectExternalId} · {preview.totalDurationDays ?? "—"} dias</span>
          </div>
          <p>
            {preview.counts.wbsNodes} nós EAP · {preview.counts.activities} atividades · {preview.counts.dependencies} dependências
          </p>
          <div className="button-row">
            <input
              aria-label="Digite CONFIRMAR para importar localmente"
              placeholder="Digite CONFIRMAR"
              value={confirmationPhrase}
              onChange={event => setConfirmationPhrase(event.target.value)}
            />
            <button
              className="primary-button"
              disabled={confirmationPhrase !== "CONFIRMAR" || importMutation.isPending}
              onClick={() => importMutation.mutate({ projectId, confirmationPhrase: "CONFIRMAR" })}
            >
              <Download size={14} />
              {importMutation.isPending ? "Importando..." : "Importar no banco local"}
            </button>
          </div>
          {importMutation.data && (
            <p>
              <CheckCircle2 size={14} /> Importados {importMutation.data.wbsNodes} nós, {importMutation.data.activities} atividades e {importMutation.data.dependencies} dependências.
            </p>
          )}
          {importMutation.error && <p className="mcp-e2e-error" role="alert">{importMutation.error.message}</p>}
        </div>
      )}
    </section>
  );
}
