import { useMemo, useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * A aba DOCUMENTOS: o intake documental da obra.
 *
 * POR QUE OS ARQUIVOS VÃO PARA O BANCO
 *
 * `project_documents.content` é bytea, NotNull. Não existe storage externo no
 * projeto, então o arquivo entra no próprio Postgres. Isso é decisão de schema,
 * não do componente — e é o que define o teto de tamanho aqui.
 *
 * POR QUE BASE64
 *
 * O tRPC transporta JSON e não tem tipo binário. O upload recebe base64 e o
 * download devolve base64, mesmo caminho que `catalog.importPriceSheet` já usa
 * com `.xls`. Não há streaming: é binário na memória, dos dois lados.
 *
 * POR QUE NÃO MOSTRA "ANALISADO"
 *
 * `analysisStatus` nasce 'pending' e ninguém o move: o projeto **não tem
 * extrator de texto** (nem `pdf-parse`, nem `mammoth`). Mostrar "analisado"
 * seria afirmar um processamento que não existe. Enquanto não houver extrator,
 * a lista diz que a análise está pendente — e diz por quê.
 *
 * POR QUE A LISTA NÃO TRAZ O CONTEÚDO
 *
 * `documents.list` devolve só metadados e `documents.download` busca um arquivo
 * por vez. Trazer `content` na listagem arrastaria todos os arquivos da obra
 * para dentro de uma resposta só.
 */

/** Espelha `EXTENSOES_DE_DOCUMENTO` de `server/routers.ts`.
 *  O servidor recusa de novo — esta cópia existe para o usuário saber antes de
 *  esperar subir 30 MB para receber "não aceito" no fim. */
const EXTENSOES_ACEITAS = ["pdf", "doc", "docx", "xls", "xlsx", "txt", "md", "csv", "png", "jpg"];

/** Teto do servidor: 40 MB de base64 (~30 MB de arquivo). */
const TETO_BASE64 = 40_000_000;

function extensaoDe(nome: string): string {
  return (nome.split(".").pop() ?? "").toLowerCase();
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataLegivel(valor: string | Date): string {
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}

/** `readAsDataURL` devolve `data:<mime>;base64,<dados>` — o servidor quer só a parte depois da vírgula. */
function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onerror = () => rejeitar(new Error("Não foi possível ler o arquivo escolhido."));
    leitor.onload = () => {
      const resultado = String(leitor.result ?? "");
      const virgula = resultado.indexOf(",");
      if (virgula < 0) {
        rejeitar(new Error("Formato inesperado ao ler o arquivo escolhido."));
        return;
      }
      resolver(resultado.slice(virgula + 1));
    };
    leitor.readAsDataURL(arquivo);
  });
}

export function DocumentosDaObra({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const documentos = trpc.documents.list.useQuery({ projectId: projetoId });

  const subir = trpc.documents.upload.useMutation({
    onSuccess: async () => {
      await utils.documents.list.invalidate({ projectId: projetoId });
    },
  });

  const remover = trpc.documents.remove.useMutation({
    onSuccess: async () => {
      await utils.documents.list.invalidate({ projectId: projetoId });
    },
    onError: problema => setErro(problema.message),
  });

  const lista = useMemo(() => documentos.data ?? [], [documentos.data]);

  async function aoEscolher(arquivo: File) {
    setErro(null);
    const extensao = extensaoDe(arquivo.name);
    if (!EXTENSOES_ACEITAS.includes(extensao)) {
      setErro(`Tipo de arquivo não aceito (.${extensao || "sem extensão"}). Aceitos: ${EXTENSOES_ACEITAS.join(", ")}.`);
      return;
    }
    setEnviando(true);
    try {
      // O base64 é ~33% maior que o arquivo: checar o arquivo antes de codificar
      // evita montar 40 MB de string para depois recusar.
      if (arquivo.size * 1.34 > TETO_BASE64) {
        setErro(`Arquivo grande demais (${tamanhoLegivel(arquivo.size)}). O limite é cerca de 30 MB.`);
        return;
      }
      const base64 = await lerComoBase64(arquivo);
      await subir.mutateAsync({
        projectId: projetoId,
        fileName: arquivo.name,
        mimeType: arquivo.type || "application/octet-stream",
        contentBase64: base64,
      });
      if (inputRef.current) inputRef.current.value = "";
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Falha ao enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  async function baixar(documentoId: number) {
    setErro(null);
    try {
      const arquivo = await utils.documents.download.fetch({ documentId: documentoId });
      const bytes = Uint8Array.from(atob(arquivo.contentBase64), caractere => caractere.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: arquivo.mimeType }));
      const ancora = window.document.createElement("a");
      ancora.href = url;
      ancora.download = arquivo.fileName;
      ancora.click();
      URL.revokeObjectURL(url);
    } catch (problema) {
      setErro(problema instanceof Error ? problema.message : "Falha ao baixar o arquivo.");
    }
  }

  function apagar(documentoId: number, nome: string) {
    setErro(null);
    // Remoção é definitiva: sem coluna de exclusão lógica, a linha e o bytea
    // somem. Perguntar antes é o mínimo.
    if (!window.confirm(`Remover "${nome}"? O arquivo é apagado do banco e não há como recuperar.`)) return;
    remover.mutate({ documentId: documentoId });
  }

  return (
    <div className="eap-documentos">
      <div className="eap-documentos-cabecalho">
        <div>
          <div className="eap-documentos-titulo">
            <FileText size={14} /> Documentos da obra
          </div>
          <div className="eap-documentos-subtitulo">
            Laudos, planilhas, contratos e imagens da obra. Ficam no banco da plataforma e disponíveis para consulta do Arquimedes.
            A extração de texto ainda não existe: os documentos entram com análise pendente.
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={EXTENSOES_ACEITAS.map(extensao => `.${extensao}`).join(",")}
          style={{ display: "none" }}
          onChange={evento => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) void aoEscolher(arquivo);
          }}
        />
        <button
          type="button"
          className="eap-btn"
          onClick={() => inputRef.current?.click()}
          disabled={enviando || subir.isPending}
        >
          <Upload size={13} /> {enviando || subir.isPending ? "Enviando…" : "Anexar documento"}
        </button>
      </div>

      {erro && (
        <div className="eap-documentos-vazio">
          <strong>Não foi possível concluir:</strong> {erro}
        </div>
      )}

      {documentos.isLoading ? (
        <div className="eap-documentos-vazio">Carregando documentos…</div>
      ) : documentos.isError ? (
        <div className="eap-documentos-vazio">
          Não foi possível ler os documentos da obra: {documentos.error.message}
        </div>
      ) : lista.length === 0 ? (
        <div className="eap-documentos-vazio">
          Nenhum documento nesta obra ainda. Use “Anexar documento” para enviar o primeiro.
        </div>
      ) : (
        <div className="eap-documentos-lista">
          {lista.map(documento => (
            <div key={documento.id} className="eap-documento">
              <div className="eap-documento-info">
                <strong title={documento.fileName}>{documento.fileName}</strong>
                <span>
                  {tamanhoLegivel(documento.sizeBytes)} · {documento.mimeType} · enviado em {dataLegivel(documento.createdAt)} ·
                  análise pendente (sem extrator de texto)
                </span>
              </div>
              <button
                type="button"
                className="eap-documento-acao"
                title="Baixar"
                onClick={() => void baixar(documento.id)}
              >
                <Download size={14} />
              </button>
              <button
                type="button"
                className="eap-documento-remover"
                title="Remover"
                disabled={remover.isPending}
                onClick={() => apagar(documento.id, documento.fileName)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
