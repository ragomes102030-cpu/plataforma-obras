/**
 * Estado de carregamento explícito.
 *
 * POR QUE ESTE COMPONENTE EXISTE (Fase 1 — 22/10/2026)
 *
 * Os painéis mostravam o estado VAZIO enquanto a consulta ainda estava em voo.
 * No plano gratuito isso dura 10–30 s, e o resultado é que uma obra com 53
 * atividades exibia "Planejamento ainda não entrou no cronograma", com 0 em
 * todos os cartões. Numa inspeção feita no navegador em 22/10/2026 eu mesmo
 * concluí que o dashboard estava quebrado — era só carregamento. O mesmo
 * aconteceu no catálogo (12.077 itens no banco, tela dizendo "0 itens") e no
 * controle ("0 dias lançados" com 9 dias lançados).
 *
 * A regra que este componente impõe: enquanto `isPending`, a tela diz que está
 * carregando. "Não há dados" só depois de a resposta chegar.
 *
 * Usar assim:
 *
 *   if (consulta.isPending) return <EstadoCarregando rotulo="Carregando o planejamento…" />;
 *
 * Cuidado com consulta desabilitada: com `enabled: false` o React Query deixa
 * `isPending` verdadeiro para sempre. Nesse caso, condicione pelo id da obra
 * (ver PainelDoCronograma) — senão o esqueleto nunca sai da tela.
 */
type Props = {
  rotulo?: string;
  detalhe?: string;
  linhas?: number;
};

export function EstadoCarregando({
  rotulo = "Carregando dados…",
  detalhe,
  linhas = 4,
}: Props) {
  return (
    <div className="xl-carregando" role="status" aria-live="polite" aria-busy="true">
      <div className="xl-carregando-topo">
        <span className="xl-carregando-spinner" aria-hidden="true" />
        <strong>{rotulo}</strong>
      </div>
      {detalhe ? <p className="xl-carregando-detalhe">{detalhe}</p> : null}
      <div className="xl-carregando-esqueleto" aria-hidden="true">
        {Array.from({ length: linhas }).map((_, i) => (
          <span key={i} className="xl-carregando-barra" style={{ width: `${100 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}
