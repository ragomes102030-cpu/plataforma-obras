import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Props = {
  projetoId: number;
};

/**
 * Painel de coerencia de engenharia.
 *
 * Mostra o que a validacao de FORMA nao pega: composicao que nao corresponde ao
 * servico, ordem de execucao impossivel, preco sem lastro. Foi escrito depois de
 * a AURORA TESTE acumular R$ 1,45 milhao num item de "Drenagem externa" que na
 * verdade era servico de cadastro em meio magnetico — dado valido, engenharia
 * absurda.
 *
 * Nao bloqueia nada: informa. Quem decide e o engenheiro.
 */
export function PainelCoerenciaEngenharia({ projetoId }: Props) {
  const [aberto, setAberto] = useState(true);

  const coerencia = trpc.planning.validateEngineeringCoherence.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  if (coerencia.isPending) {
    return (
      <div className="xl-achados xl-achados-carregando">
        <span className="xl-painel-kicker">COERENCIA DE ENGENHARIA</span>
        <p>Analisando composicoes, sequencia e quantitativos...</p>
      </div>
    );
  }

  if (coerencia.isError) {
    return (
      <div className="xl-achados xl-achados-erro">
        <span className="xl-painel-kicker">COERENCIA DE ENGENHARIA</span>
        <p>Nao foi possivel analisar: {coerencia.error.message}</p>
      </div>
    );
  }

  const dados = coerencia.data;
  if (!dados || dados.resumo.total === 0) {
    return (
      <div className="xl-achados xl-achados-ok">
        <span className="xl-painel-kicker">COERENCIA DE ENGENHARIA</span>
        <p>
          <strong>Nenhuma incoerencia encontrada.</strong> Composicoes correspondem aos
          servicos, sequencia e construtivamente possivel e os precos tem lastro nos componentes.
        </p>
      </div>
    );
  }

  type Achado = { severity: string; code: string; message: string; ref?: string };
  const todos = dados.issues as Achado[];
  const erros = todos.filter(i => i.severity === "error");
  const avisos = todos.filter(i => i.severity === "warning");
  const emRisco = dados.resumo.valorEmRisco;

  return (
    <div className={`xl-achados ${erros.length > 0 ? "xl-achados-critico" : "xl-achados-atencao"}`}>
      <div className="xl-achados-cabecalho" onClick={() => setAberto(v => !v)} role="button" tabIndex={0}>
        <div>
          <span className="xl-painel-kicker">COERENCIA DE ENGENHARIA</span>
          <strong>
            {erros.length > 0
              ? `${erros.length} incoerencia(s) que impedem execucao`
              : `${avisos.length} ponto(s) de atencao`}
          </strong>
          {emRisco > 0 && (
            <p className="xl-achados-valor">
              R$ {emRisco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em itens afetados
            </p>
          )}
        </div>
        <span className="xl-achados-toggle">{aberto ? "ocultar" : "ver detalhes"}</span>
      </div>

      {aberto && (
        <div className="xl-achados-lista">
          {erros.length > 0 && (
            <>
              <div className="xl-achados-grupo">IMPEDEM EXECUCAO</div>
              {erros.map((i: Achado, n: number) => (
                <div key={`e-${n}`} className="xl-achado xl-achado-erro">
                  <div className="xl-achado-topo">
                    <span className="xl-achado-ref">{i.ref}</span>
                    <span className="xl-achado-codigo">{i.code}</span>
                  </div>
                  <p>{i.message}</p>
                </div>
              ))}
            </>
          )}
          {avisos.length > 0 && (
            <>
              <div className="xl-achados-grupo">PONTOS DE ATENCAO</div>
              {avisos.map((i: Achado, n: number) => (
                <div key={`w-${n}`} className="xl-achado xl-achado-aviso">
                  <div className="xl-achado-topo">
                    <span className="xl-achado-ref">{i.ref}</span>
                    <span className="xl-achado-codigo">{i.code}</span>
                  </div>
                  <p>{i.message}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
