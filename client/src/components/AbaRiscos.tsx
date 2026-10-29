type Props = {
  projetoId: number;
};

/**
 * A aba permanece explícita enquanto o sistema ainda não possui persistência
 * de riscos. Não exibir cenários estáticos como registros reais da obra.
 */
export function AbaRiscos({ projetoId }: Props) {
  return (
    <section className="xl-painel" aria-labelledby="riscos-titulo" data-project-id={projetoId}>
      <header className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">RISCOS DA OBRA</span>
          <h2 id="riscos-titulo">Registro de riscos ainda não habilitado</h2>
          <p>Não há riscos cadastrados nesta obra.</p>
        </div>
      </header>
      <div className="xl-aviso" role="status">
        <strong>Esta aba ainda não grava nem consulta riscos.</strong>
        <p>
          Os cenários demonstrativos foram removidos para não serem confundidos
          com riscos avaliados por um responsável. Probabilidade, impacto,
          responsável e plano de resposta só devem aparecer depois que o cadastro
          persistente estiver disponível.
        </p>
      </div>
    </section>
  );
}
