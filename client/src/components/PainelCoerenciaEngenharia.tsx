import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Props = {
  projetoId: number;
};

type CoberturaRegra = {
  regra: string;
  universo: string;
  total: number;
  avaliados: number;
  fora: number;
  motivo: string | null;
  motivos: { motivo: string; itens: number }[];
};

/** "4. preco sem lastro" -> "a regra de preco sem lastro" (linguagem de engenheiro). */
function nomeDaRegra(regra: string): string {
  return `a regra de ${regra.replace(/^\s*\d+\.\s*/, "").trim()}`;
}

/**
 * Alcance de cada regra. NAO sao achados e nao mudam severidade: existem para que
 * "sem achado" nunca seja lido como "obra coerente" quando a regra nao conseguiu
 * avaliar tudo. O motivo de exclusao aparece NOMEADO.
 */
function BlocoCobertura({ cobertura }: { cobertura: CoberturaRegra[] }) {
  if (!cobertura || cobertura.length === 0) return null;
  return (
    <div className="xl-cobertura">
      <div className="xl-achados-grupo">O QUE FOI CONFERIDO</div>
      <p className="xl-cobertura-nota">
        Nao haver achado em uma regra significa que ela nao encontrou incoerencia <em>no que
        conseguiu conferir</em>. O alcance de cada regra esta abaixo — item fora nao foi reprovado,
        nao foi conferido.
      </p>
      {cobertura.map((r, n) => (
        <div key={`c-${n}`} className="xl-cobertura-linha">
          <span className="xl-cobertura-regra">{nomeDaRegra(r.regra)}</span>
          <span className="xl-cobertura-conta">
            {r.total === 0
              ? `nao havia ${r.universo} para conferir`
              : `conferiu ${r.avaliados} de ${r.total} ${r.universo}`}
          </span>
          {r.fora > 0 && (
            <span className="xl-cobertura-fora">
              {r.fora} fora por{" "}
              {r.motivos.length > 1
                ? r.motivos.map(m => `${m.itens} ${m.motivo}`).join("; ")
                : r.motivo}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

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
  const cobertura = dados?.resumo.cobertura ?? [];
  // Sem cobertura registrada e sem achado, nada foi conferido — nao existe "obra ok"
  // para mostrar. (Caminho degenerado: a analise nao chegou a rodar.) Sem isto, o
  // zero-achado voltaria a ser lido como coerencia.
  if (dados && dados.resumo.total === 0 && cobertura.length === 0) {
    return (
      <div className="xl-achados xl-achados-erro">
        <span className="xl-painel-kicker">COERENCIA DE ENGENHARIA</span>
        <p>
          <strong>Nada foi conferido.</strong> A validacao nao chegou a rodar nesta obra, entao
          nao ha alcance nem achado para mostrar. Isto NAO e um atestado de coerencia.
        </p>
      </div>
    );
  }

  if (!dados || dados.resumo.total === 0) {
    return (
      <div className="xl-achados xl-achados-ok">
        <span className="xl-painel-kicker">COERENCIA DE ENGENHARIA</span>
        <p>
          <strong>Nenhuma incoerencia encontrada no que foi conferido.</strong>{" "}
          Isto nao afirma que a obra esta coerente — afirma que as regras nao acusaram nada
          dentro do alcance delas, que esta declarado abaixo.
        </p>
        <BlocoCobertura cobertura={cobertura} />
      </div>
    );
  }

  type Achado = { severity: string; code: string; message: string; refs?: string[]; ref?: string; dominio?: string };
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
              R$ {emRisco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} em itens de orçamento
              afetados (não inclui achados de cronograma)
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
                    <span className="xl-achado-ref">
                      {(i.refs ?? []).slice(0, 6).join(", ")}
                      {(i.refs ?? []).length > 6 ? ` +${(i.refs ?? []).length - 6}` : ""}
                    </span>
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
                    <span className="xl-achado-ref">
                      {(i.refs ?? []).slice(0, 6).join(", ")}
                      {(i.refs ?? []).length > 6 ? ` +${(i.refs ?? []).length - 6}` : ""}
                    </span>
                    <span className="xl-achado-codigo">{i.code}</span>
                  </div>
                  <p>{i.message}</p>
                </div>
              ))}
            </>
          )}
          <BlocoCobertura cobertura={cobertura} />
        </div>
      )}
    </div>
  );
}
