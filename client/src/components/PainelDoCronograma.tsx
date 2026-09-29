import type { AgregadoDoCronograma } from "@shared/cronograma-colunas";

/**
 * O DASHBOARD: o painel de cima da planilha.
 *
 * A planilha escreve `=AVERAGE(CRONOGRAMA!L5:L18)` e escreve "média ponderada"
 * no rótulo. Não pondera nada. Aqui a média é ponderada pela quantidade
 * planejada, e o painel diz isso no rótulo — uma tarefa de 15 dias não pode
 * pesar igual a uma de 150.
 *
 * Os números chegam prontos do motor (`agregadoDoCronograma`). Este componente
 * não divide, não soma e não faz média de nada: ele formata.
 */

type Props = {
  agregado: AgregadoDoCronograma | undefined;
};

function pct(n: number): string {
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function PainelDoCronograma({ agregado }: Props) {
  if (!agregado || agregado.totalAtividades === 0) {
    return (
      <div className="xl-painel">
        <p className="xl-painel-vazio">
          Sem atividades no cronograma, não há avanço para medir. A aba
          CRONOGRAMA diz o que falta.
        </p>
      </div>
    );
  }

  const { contagemPorStatus: c } = agregado;
  const atrasadas = c.Atrasado;

  return (
    <div className="xl-painel">
      <div className="xl-cartoes">
        <Cartao titulo="Avanço físico" valor={pct(agregado.avancoFisico)}>
          ponderado por quantidade, em {agregado.linhasPonderadas} de{" "}
          {agregado.totalAtividades} atividades
        </Cartao>
        <Cartao titulo="Avanço planejado" valor={pct(agregado.avancoPlanejado)}>
          quanto da duração já passou até a data-base
        </Cartao>
        <Cartao
          titulo="Desvio"
          valor={pct(Math.abs(agregado.desvio))}
          tom={agregado.desvio < 0 ? "ruim" : "bom"}
        >
          {agregado.desvio < 0 ? "atrasado" : "adiantado"} — real menos
          planejado
        </Cartao>
        <Cartao
          titulo="Prazo"
          valor={agregado.prazoDias != null ? `${agregado.prazoDias} d` : "—"}
        >
          do primeiro início ao último fim
        </Cartao>
      </div>

      <div className="xl-status-blocos">
        <Status titulo="Concluído" n={c.Concluido} total={agregado.totalAtividades} classe="xl-concluido" />
        <Status titulo="Em andamento" n={c["Em andamento"]} total={agregado.totalAtividades} classe="xl-andamento" />
        <Status titulo="Atrasado" n={c.Atrasado} total={agregado.totalAtividades} classe="xl-atrasado" />
        <Status titulo="Não iniciado" n={c["Nao iniciado"]} total={agregado.totalAtividades} classe="xl-nao-iniciado" />
      </div>

      {atrasadas > 0 && (
        <p className="xl-painel-alerta">
          {atrasadas} {atrasadas === 1 ? "atividade está" : "atividades estão"} sem
          execução e com o fim já passado. A coluna Status da aba CRONOGRAMA
          mostra quais.
        </p>
      )}

      {agregado.linhasSemQuantidade > 0 && (
        <p className="xl-painel-nota">
          {agregado.linhasSemQuantidade}{" "}
          {agregado.linhasSemQuantidade === 1
            ? "atividade está"
            : "atividades estão"}{" "}
          fora da média por não terem quantidade. Medir a quantidade delas é o
          que faz o painel passar a refletir a obra.
        </p>
      )}
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  children,
  tom,
}: {
  titulo: string;
  valor: string;
  children?: React.ReactNode;
  tom?: "ruim" | "bom";
}) {
  return (
    <div className={`xl-cartao${tom ? ` xl-cartao-${tom}` : ""}`}>
      <span className="xl-cartao-titulo">{titulo}</span>
      <strong className="xl-cartao-valor">{valor}</strong>
      {children && <span className="xl-cartao-nota">{children}</span>}
    </div>
  );
}

function Status({
  titulo,
  n,
  total,
  classe,
}: {
  titulo: string;
  n: number;
  total: number;
  classe: string;
}) {
  const fracao = total > 0 ? n / total : 0;
  return (
    <div className={`xl-status ${classe}`}>
      <div className="xl-status-topo">
        <span>{titulo}</span>
        <strong>{n}</strong>
      </div>
      <div className="xl-status-barra">
        <span style={{ width: `${Math.round(fracao * 100)}%` }} />
      </div>
      <span className="xl-status-nota">{pct(fracao)} das atividades</span>
    </div>
  );
}
