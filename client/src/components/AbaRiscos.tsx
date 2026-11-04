import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Props = { projetoId: number };

export function AbaRiscos({ projetoId }: Props) {
  const riscos = trpc.risks.list.useQuery({ projectId: projetoId }, { enabled: projetoId > 0 });
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState("3");
  const [impact, setImpact] = useState("3");
  const [responsePlan, setResponsePlan] = useState("");
  const [responsible, setResponsible] = useState("");
  const criar = trpc.risks.create.useMutation({
    onSuccess: async () => {
      await utils.risks.list.invalidate({ projectId: projetoId });
      setTitle(""); setDescription(""); setResponsePlan(""); setResponsible("");
    },
  });

  return (
    <section className="xl-painel" aria-labelledby="riscos-titulo" data-project-id={projetoId}>
      <header className="xl-painel-intro"><div><span className="xl-painel-kicker">RISCOS DA OBRA</span><h2 id="riscos-titulo">Registro de riscos</h2><p>Cadastre riscos avaliados pelo engenheiro. Nada é criado automaticamente.</p></div></header>
      <form className="xl-form-grid" onSubmit={event => { event.preventDefault(); criar.mutate({ projectId: projetoId, title, description, probability: Number(probability), impact: Number(impact), responsePlan: responsePlan || undefined, responsible: responsible || undefined }); }}>
        <label>Título<input value={title} onChange={e => setTitle(e.target.value)} required minLength={3} /></label>
        <label>Descrição<textarea value={description} onChange={e => setDescription(e.target.value)} required minLength={3} /></label>
        <label>Probabilidade<select value={probability} onChange={e => setProbability(e.target.value)}>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Impacto<select value={impact} onChange={e => setImpact(e.target.value)}>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Plano de resposta<textarea value={responsePlan} onChange={e => setResponsePlan(e.target.value)} /></label>
        <label>Responsável<input value={responsible} onChange={e => setResponsible(e.target.value)} /></label>
        <button type="submit" disabled={criar.isPending}>{criar.isPending ? "Gravando…" : "Cadastrar risco"}</button>
        {criar.isError && <p role="alert">{criar.error.message}</p>}
      </form>
      <div className="xl-lista" aria-live="polite"><h3>Riscos cadastrados ({riscos.data?.length ?? 0})</h3>{riscos.isPending && <p>Carregando riscos…</p>}{!riscos.isPending && !(riscos.data?.length) && <p>Nenhum risco cadastrado nesta obra.</p>}{(riscos.data ?? []).map(risco => <article className="xl-card" key={risco.id}><strong>{risco.title}</strong><p>{risco.description}</p><small>Probabilidade {risco.probability}/5 · Impacto {risco.impact}/5 · {risco.status}</small>{risco.responsePlan && <p>Resposta: {risco.responsePlan}</p>}</article>)}</div>
    </section>
  );
}
