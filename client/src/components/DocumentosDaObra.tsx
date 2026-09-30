import { useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";

function tamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentosDaObra({ projetoId }: { projetoId: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const documentos = trpc.projects.documents.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const upload = trpc.projects.uploadDocument.useMutation({
    onSuccess: async () => {
      setErro(null);
      await utils.projects.documents.invalidate({ projectId: projetoId });
    },
    onError: e => setErro(e.message),
  });
  const remover = trpc.projects.deleteDocument.useMutation({
    onSuccess: async () => {
      setErro(null);
      await utils.projects.documents.invalidate({ projectId: projetoId });
    },
    onError: e => setErro(e.message),
  });

  async function enviar(file: File) {
    setErro(null);
    if (file.type !== "application/pdf") {
      setErro("Nesta primeira versão, o Arquimedes recebe documentos em PDF.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErro("O PDF deve ter no máximo 20 MB.");
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result ?? "");
        const comma = value.indexOf(",");
        resolve(comma >= 0 ? value.slice(comma + 1) : value);
      };
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsDataURL(file);
    });
    upload.mutate({
      projectId: projetoId,
      fileName: file.name,
      mimeType: "application/pdf",
      fileDataBase64: base64,
    });
  }

  return (
    <section className="eap-documentos" aria-label="Documentos da obra">
      <div className="eap-documentos-cabecalho">
        <div>
          <div className="eap-documentos-titulo"><FileText size={15} /> Documentos para o Arquimedes</div>
          <div className="eap-documentos-subtitulo">
            PDFs da obra ficam vinculados a esta obra. O próximo passo é extrair o texto e gerar evidências para a proposta de EAP.
          </div>
        </div>
        <button
          type="button"
          className="eap-tool-btn eap-tool-agent"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} />
          {upload.isPending ? "Enviando…" : "Adicionar PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void enviar(file);
          }}
        />
      </div>

      {erro && <div className="xl-aviso-erro" role="alert">{erro}</div>}

      <div className="eap-documentos-lista">
        {(documentos.data ?? []).map(doc => (
          <div className="eap-documento" key={doc.id}>
            <FileText size={17} />
            <div className="eap-documento-info">
              <strong>{doc.fileName}</strong>
              <span>{tamanho(doc.sizeBytes)} · {doc.analysisStatus === "pending" ? "Aguardando análise" : doc.analysisStatus}</span>
            </div>
            <button
              type="button"
              className="eap-documento-remover"
              title="Remover documento"
              disabled={remover.isPending}
              onClick={() => {
                if (window.confirm(`Remover "${doc.fileName}" desta obra?`)) {
                  remover.mutate({ projectId: projetoId, documentId: doc.id });
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {(documentos.data ?? []).length === 0 && !documentos.isPending && (
          <div className="eap-documentos-vazio">Nenhum documento anexado. Adicione o memorial, projeto ou especificação em PDF.</div>
        )}
      </div>
    </section>
  );
}
