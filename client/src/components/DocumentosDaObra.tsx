import { FileText } from "lucide-react";

export function DocumentosDaObra({ projetoId }: { projetoId: number }) {
  return (
    <section className="eap-documentos" aria-label="Documentos da obra">
      <div className="eap-documentos-cabecalho">
        <div>
          <div className="eap-documentos-titulo"><FileText size={15} /> Documentos para o Arquimedes</div>
          <div className="eap-documentos-subtitulo">
            O armazenamento e a extração de documentos ainda não estão expostos no contrato tRPC atual.
            Esta área permanece explicitamente desabilitada para não simular upload nem perder arquivos.
          </div>
        </div>
      </div>
      <div className="eap-documentos-vazio">
        A obra {projetoId} não possui uma operação de documentos disponível nesta versão.
      </div>
    </section>
  );
}
