import { ArrowRight, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function ReadinessGate({ projetoId, abrirAba }: { projetoId: number; abrirAba: (aba: string) => void }) {
  const readiness = trpc.planning.readiness.useQuery({ projectId: projetoId }, { staleTime: 30_000 });
  const barrier = readiness.data?.primeiraBarreira;
  if (!barrier) return null;
  const aba = barrier.impacta[0] === "orcamento" ? "financeiro" : barrier.impacta[0] === "cpm" ? "cpm" : barrier.impacta[0] === "baseline" ? "baseline" : barrier.impacta[0] === "eap" ? "eap" : "escopo";
  const planejamentoLiberado = readiness.data?.prontoParaPlanejamento === true;
  return <section className={`ct-readiness-gate${planejamentoLiberado ? " ct-readiness-gate--planning-ready" : ""}`} aria-label="Primeira barreira da obra">
    <div><span className="ct-overline"><TriangleAlert size={13}/> {planejamentoLiberado ? "PLANEJAMENTO LIBERADO · CONTROLE FINANCEIRO EM REVISÃO" : "GOVERNANÇA DO PLANEJAMENTO"}</span><strong>{planejamentoLiberado ? "A obra pode continuar sendo planejada." : barrier.titulo}</strong><p>{planejamentoLiberado ? `${barrier.titulo}. ${barrier.explicacao}` : barrier.explicacao}</p><small><b>Como resolver:</b> {barrier.comoResolver}</small></div>
    <button type="button" className="ct-button" onClick={() => abrirAba(aba)}>Abrir etapa responsável <ArrowRight size={15}/></button>
  </section>;
}
