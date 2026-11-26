import { ArrowRight, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { destinoDaBarreira, primeiraBarreiraDoContexto, rotuloDaBarreira, type ContextoReadinessGate } from "@/lib/readiness-gate";

export function ReadinessGate({ projetoId, abrirAba, contexto = "dashboard" }: { projetoId: number; abrirAba: (aba: string) => void; contexto?: ContextoReadinessGate }) {
  const readiness = trpc.planning.readiness.useQuery({ projectId: projetoId }, { staleTime: 30_000 });
  const barrier = readiness.data ? primeiraBarreiraDoContexto(readiness.data, contexto) : null;
  if (!barrier) return null;
  const planejamentoLiberado = readiness.data?.prontoParaPlanejamento === true;
  const aba = destinoDaBarreira(barrier);
  const rotulo = rotuloDaBarreira(barrier, planejamentoLiberado);
  return <section className={`ct-readiness-gate${planejamentoLiberado ? " ct-readiness-gate--planning-ready" : ""}`} aria-label="Primeira barreira da obra">
    <div><span className="ct-overline"><TriangleAlert size={13}/> {rotulo}</span><strong>{planejamentoLiberado ? "A obra pode continuar sendo planejada." : barrier.titulo}</strong><p>{planejamentoLiberado ? `${barrier.titulo}. ${barrier.explicacao}` : barrier.explicacao}</p><small><b>Como resolver:</b> {barrier.comoResolver}</small></div>
    <button type="button" className="ct-button" onClick={() => abrirAba(aba)}>Abrir etapa responsável <ArrowRight size={15}/></button>
  </section>;
}
