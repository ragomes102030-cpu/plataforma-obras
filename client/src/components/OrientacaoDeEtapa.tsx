import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { OrientacaoDeBloqueio } from "@shared/planning-guidance";

export function OrientacaoDeEtapa({
  orientacao,
  compacta = false,
}: {
  orientacao: OrientacaoDeBloqueio;
  compacta?: boolean;
}) {
  const navegar = () => window.dispatchEvent(new CustomEvent("abrir-aba", {
    detail: { aba: orientacao.abaDestino },
  }));

  return (
    <article
      className={`orientacao-etapa ${orientacao.severidade}${compacta ? " compacta" : ""}`}
      aria-live="polite"
      role="status"
    >
      <header>
        <span className="orientacao-etapa-icone" aria-hidden="true"><AlertTriangle size={17} /></span>
        <div>
          <small>{orientacao.severidade === "bloqueio" ? "Etapa bloqueada" : "Atenção"}</small>
          <strong>{orientacao.titulo}</strong>
          <p><b>O que aconteceu:</b> {orientacao.oQueAconteceu}</p>
        </div>
      </header>

      <details open={!compacta}>
        <summary>Entender e resolver</summary>
        <div className="orientacao-etapa-conteudo">
          <section>
            <h4>Por que impede continuar</h4>
            <p>{orientacao.porQueBloqueia}</p>
          </section>
          <section>
            <h4>Como resolver</h4>
            <ol>{orientacao.passos.map(passo => <li key={passo}>{passo}</li>)}</ol>
          </section>
          {orientacao.dadosPreservados && (
            <p className="orientacao-etapa-preservado"><CheckCircle2 size={14} aria-hidden="true" /> {orientacao.dadosPreservados}</p>
          )}
          <section>
            <h4>Como confirmar</h4>
            <p>{orientacao.evidenciaDeResolucao}</p>
          </section>
          {orientacao.detalhesTecnicos && (
            <details className="orientacao-etapa-tecnico">
              <summary>Detalhes técnicos</summary>
              <p>{orientacao.detalhesTecnicos}</p>
            </details>
          )}
        </div>
      </details>

      <button type="button" onClick={navegar}>
        {orientacao.rotuloAcao} <ArrowRight size={14} aria-hidden="true" />
      </button>
    </article>
  );
}
