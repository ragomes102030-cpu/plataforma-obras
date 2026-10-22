import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * O HISTÓRICO DA PRODUÇÃO, COM CONSERTO.
 *
 * A aba PRODUÇÃO só tinha a grade linha × data e um formulário. Uma vez lançado,
 * não havia como corrigir: a nota da tela mandava "apague o dia na grade", e não
 * existia apagar. Na AURORA TESTE isso deixou 10 medições presas — uma delas
 * datada de 25/10 (futuro) e todas apontando para atividades de uma versão
 * anterior da EAP, o que zerava o `% Real` do cronograma.
 *
 * Aqui cada medição vira uma linha com situação e três ações:
 *  - Desfazer confirmação (confirmada → rascunho, sem apagar histórico);
 *  - Editar data e quantidade (só rascunho, para o número enviado não mudar calado);
 *  - Excluir (só rascunho).
 * E o botão "Recalcular avanço real" refaz o `% Real` de todas as atividades
 * somando os lançamentos pelo CÓDIGO da EAP — inclusive os de versões antigas.
 */

type Lancamento = {
  id: number;
  productionDate: Date | string;
  quantity: string | number;
  measurementUnit: string;
  status: string;
  activityId: number;
  notes?: string | null;
  codigoEap?: string | null;
  atividadeNome?: string | null;
  vinculo?: "atual" | "versao_anterior" | "perdido";
};

type Props = {
  projetoId: number;
  lancamentos: Lancamento[];
};

const dataIso = (valor: Date | string) => new Date(valor).toISOString().slice(0, 10);

export function ListaLancamentosProducao({ projetoId, lancamentos }: Props) {
  const utils = trpc.useUtils();
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [dataEdicao, setDataEdicao] = useState("");
  const [quantidadeEdicao, setQuantidadeEdicao] = useState("");
  const [somenteComProblema, setSomenteComProblema] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const atualizarTelas = async () => {
    await Promise.all([
      utils.production.entries.invalidate({ projectId: projetoId }),
      utils.planning.list.invalidate({ projectId: projetoId }),
    ]);
  };

  const aoFalhar = (e: { message: string }) => {
    setErro(e.message);
    setMensagem(null);
  };

  const recalcular = trpc.production.recalcularAvanco.useMutation({
    onSuccess: async r => {
      setErro(null);
      setMensagem(
        r.atividadesQueMudaram > 0
          ? `Avanço real recalculado: ${r.atividadesQueMudaram} atividade(s) mudaram de % no cronograma.`
          : "Avanço real recalculado: nenhuma atividade mudou de % — os lançamentos já estavam refletidos."
      );
      if (r.lancamentosSemVinculo > 0)
        setMensagem(
          m =>
            `${m} ${r.lancamentosSemVinculo} lançamento(s) continuam sem vínculo com a EAP atual.`
        );
      await atualizarTelas();
    },
    onError: aoFalhar,
  });

  // Sem este botão, "Desfazer" seria uma porta só de ida: o rascunho podia ser
  // editado ou excluído, mas nunca voltava a contar no avanço.
  const confirmar = trpc.production.confirmEntry.useMutation({
    onSuccess: async () => {
      setErro(null);
      setMensagem("Medição confirmada: voltou a contar no avanço real.");
      await atualizarTelas();
    },
    onError: aoFalhar,
  });

  const desfazer = trpc.production.unconfirmEntry.useMutation({
    onSuccess: async () => {
      setErro(null);
      setMensagem("Confirmação desfeita: a medição voltou para rascunho e saiu do avanço.");
      await atualizarTelas();
    },
    onError: aoFalhar,
  });

  const editar = trpc.production.updateEntry.useMutation({
    onSuccess: async () => {
      setErro(null);
      setMensagem("Medição corrigida.");
      setEditandoId(null);
      await atualizarTelas();
    },
    onError: aoFalhar,
  });

  const excluir = trpc.production.deleteEntry.useMutation({
    onSuccess: async () => {
      setErro(null);
      setMensagem("Medição excluída.");
      await atualizarTelas();
    },
    onError: aoFalhar,
  });

  const semVinculo = useMemo(
    () => lancamentos.filter(l => l.vinculo === "perdido"),
    [lancamentos]
  );
  const visiveis = useMemo(
    () =>
      somenteComProblema
        ? lancamentos.filter(l => (l.vinculo ?? "atual") !== "atual")
        : lancamentos,
    [lancamentos, somenteComProblema]
  );

  const ocupado =
    recalcular.isPending ||
    confirmar.isPending ||
    desfazer.isPending ||
    editar.isPending ||
    excluir.isPending;

  if (!lancamentos.length) return null;

  return (
    <section className="xl-painel secao-lancamentos">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">LANÇAMENTOS</span>
          <h2>
            {lancamentos.length} medição(ões) · {visiveis.length} nesta lista
          </h2>
          <p>
            Corrija aqui o que foi digitado errado. Medição confirmada precisa ser
            desconfirmada antes de mudar de valor.
          </p>
        </div>
        <div className="producao-acoes">
          <label className="producao-filtro">
            <input
              type="checkbox"
              checked={somenteComProblema}
              onChange={e => setSomenteComProblema(e.target.checked)}
            />
            só lançamentos fora do plano atual
          </label>
          <button
            type="button"
            className="eap-btn"
            disabled={ocupado}
            title="Soma os lançamentos confirmados pelo código da EAP e refaz o % Real das atividades de hoje."
            onClick={() => {
              setMensagem(null);
              recalcular.mutate({ projectId: projetoId });
            }}
          >
            {recalcular.isPending ? "Recalculando…" : "Recalcular avanço real"}
          </button>
        </div>
      </div>

      {(semVinculo.length > 0 || (erro ?? "").length > 0) && (
        <div className="xl-aviso-erro" role="alert">
          {erro ??
            `${semVinculo.length} lançamento(s) apontam para atividades que não existem na EAP atual. Clique em "Recalcular avanço real" para somar o que ainda casa por código e re-lance o restante.`}
        </div>
      )}
      {mensagem && <p className="producao-mensagem">{mensagem}</p>}

      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th className="xl-tabela-th" scope="col">Data</th>
              <th className="xl-tabela-th" scope="col">Atividade</th>
              <th className="xl-tabela-th" scope="col">Quantidade</th>
              <th className="xl-tabela-th" scope="col">Situação</th>
              <th className="xl-tabela-th" scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td className="xl-vazia" colSpan={5}>
                  <strong>Nenhum lançamento fora do plano atual</strong>
                  <span>Desmarque o filtro para ver todas as medições.</span>
                </td>
              </tr>
            ) : (
              visiveis.map(l => {
                const emEdicao = editandoId === l.id;
                const confirmada = l.status === "confirmada";
                const vinculo = l.vinculo ?? "atual";
                return (
                  <tr key={l.id}>
                    <td className="xl-tabela-celula">
                      {emEdicao ? (
                        <input
                          type="date"
                          value={dataEdicao}
                          onChange={e => setDataEdicao(e.target.value)}
                        />
                      ) : (
                        new Date(l.productionDate).toLocaleDateString("pt-BR")
                      )}
                    </td>
                    <td className="xl-tabela-celula">
                      <span className="xl-tabela-codigo">{l.codigoEap ?? "—"}</span>
                      <span className="xl-tabela-nome">{l.atividadeNome ?? "atividade inexistente"}</span>
                    </td>
                    <td className="xl-tabela-celula">
                      {emEdicao ? (
                        <input
                          inputMode="decimal"
                          value={quantidadeEdicao}
                          onChange={e => setQuantidadeEdicao(e.target.value)}
                        />
                      ) : (
                        `${l.quantity} ${l.measurementUnit}`
                      )}
                    </td>
                    <td className="xl-tabela-celula">
                      <span className={`producao-tag producao-tag-${confirmada ? "confirmada" : "rascunho"}`}>
                        {confirmada ? "confirmada" : "rascunho"}
                      </span>
                      {vinculo !== "atual" && (
                        <span
                          className="producao-tag producao-tag-aviso"
                          title="A atividade desta medição pertence a uma versão anterior da EAP."
                        >
                          {vinculo === "versao_anterior" ? "plano anterior" : "sem vínculo"}
                        </span>
                      )}
                    </td>
                    <td className="xl-tabela-celula producao-acoes-linha">
                      {emEdicao ? (
                        <>
                          <button
                            type="button"
                            className="eap-btn"
                            disabled={ocupado || !quantidadeEdicao.trim() || Number(quantidadeEdicao) <= 0}
                            onClick={() =>
                              editar.mutate({
                                projectId: projetoId,
                                entryId: l.id,
                                quantity: Number(quantidadeEdicao),
                                productionDate: dataEdicao || undefined,
                              })
                            }
                          >
                            Salvar
                          </button>
                          <button type="button" className="outline-button" onClick={() => setEditandoId(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {confirmada && (
                            <button
                              type="button"
                              className="outline-button"
                              disabled={ocupado}
                              onClick={() => desfazer.mutate({ projectId: projetoId, entryId: l.id })}
                            >
                              Desfazer
                            </button>
                          )}
                          {!confirmada && (
                            <>
                              <button
                                type="button"
                                className="eap-btn"
                                disabled={ocupado}
                                title="Volta a contar no avanço real."
                                onClick={() => confirmar.mutate({ projectId: projetoId, entryId: l.id })}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className="outline-button"
                                disabled={ocupado}
                                onClick={() => {
                                  setEditandoId(l.id);
                                  setDataEdicao(dataIso(l.productionDate));
                                  setQuantidadeEdicao(String(l.quantity));
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="outline-button"
                                disabled={ocupado}
                                onClick={() => {
                                  if (window.confirm(`Excluir a medição de ${number(l.quantity)} ${l.measurementUnit} em ${new Date(l.productionDate).toLocaleDateString("pt-BR")}?`))
                                    excluir.mutate({ projectId: projetoId, entryId: l.id });
                                }}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function number(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
