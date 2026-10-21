import { CheckCheck, GitMerge, Link2, TriangleAlert, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Conciliação cronograma ↔ orçamento.
 *
 * O EVM não fecha enquanto a atividade não apontar para um item de orçamento com
 * quantidade: sem isso não existe valor planejado por atividade, e sem valor
 * planejado não há curva S física, SPI nem CPI. Na AURORA TESTE as 53 atividades
 * e os 53 itens tinham os MESMOS códigos WBS e nenhum vínculo — o sistema não
 * sabia ligá-los.
 *
 * A tela não vincula sozinha. Ela mostra o que o servidor sugere, com o motivo
 * (mesmo código? descrição?) e deixa o planejador decidir linha a linha.
 */

type Sugestao = {
  budgetItemId: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  confidence: number;
  reason: "codigo" | "descricao";
  unitMismatch: boolean;
};

type Pendencia = {
  id: number;
  wbsCode: string;
  name: string;
  unit: string | null;
  plannedQuantity: number | null;
  budgetItemId: number | null;
  sugestoes: Sugestao[];
};

type Escolha = {
  itemId: number | null;
  quantidade: string;
  marcado: boolean;
};

const rotuloMotivo = (sugestao: Sugestao) =>
  sugestao.reason === "codigo" ? "mesmo código WBS" : `${Math.round(sugestao.confidence * 100)}% de semelhança`;

export function PainelConciliacao({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [mostrarComposicoes, setMostrarComposicoes] = useState(false);

  const diagnostico = trpc.planning.conciliacao.useQuery({ projectId: projetoId });

  const aplicar = trpc.planning.aplicarConciliacao.useMutation({
    onSuccess: async resultado => {
      setMensagem(`${resultado.aplicados} atividade(s) vinculada(s) ao orçamento.`);
      setEscolhas({});
      await Promise.all([
        utils.planning.conciliacao.invalidate(),
        utils.budgets.list.invalidate(),
      ]);
    },
    onError: erro => setMensagem(erro.message),
  });

  const pendencias = useMemo<Pendencia[]>(() => diagnostico.data?.pendencias ?? [], [diagnostico.data]);

  // Sugestão pré-marcada só quando o vínculo é inequívoco (mesmo código WBS).
  // Semelhança de texto abre o item, não decide por ninguém.
  useEffect(() => {
    if (!pendencias.length) return;
    setEscolhas(atual => {
      const proximo = { ...atual };
      for (const pendencia of pendencias) {
        if (proximo[pendencia.id]) continue;
        const primeira = pendencia.sugestoes[0];
        proximo[pendencia.id] = {
          itemId: primeira ? primeira.budgetItemId : null,
          quantidade: primeira ? String(primeira.quantity) : "",
          marcado: primeira?.reason === "codigo" && !primeira.unitMismatch,
        };
      }
      return proximo;
    });
  }, [pendencias]);

  const selecionadas = pendencias.filter(
    pendencia => escolhas[pendencia.id]?.marcado && escolhas[pendencia.id]?.itemId
  );

  const vincular = () => {
    if (!selecionadas.length) return;
    aplicar.mutate({
      projectId: projetoId,
      vinculos: selecionadas.map(pendencia => {
        const escolha = escolhas[pendencia.id];
        const quantidade = Number(escolha.quantidade);
        return {
          activityId: pendencia.id,
          budgetItemId: Number(escolha.itemId),
          plannedQuantity: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : null,
        };
      }),
    });
  };

  const cobertura = diagnostico.data?.cobertura;
  const percentual = cobertura ? Math.round(cobertura.percentual * 100) : 0;

  const reconciliacao = trpc.budgets.reconcilePreview.useQuery(
    { projectId: projetoId },
    { enabled: mostrarComposicoes, staleTime: 60_000 }
  );

  const aplicarReconciliacao = trpc.budgets.applyReconciliation.useMutation({
    onSuccess: async resultado => {
      setMensagem(`${resultado.applied} composição(ões) aplicada(s) ao orçamento.`);
      await Promise.all([
        utils.budgets.reconcilePreview.invalidate(),
        utils.budgets.list.invalidate(),
        utils.planning.conciliacao.invalidate(),
      ]);
    },
    onError: erro => setMensagem(erro.message),
  });

  const semComposicao = (reconciliacao.data?.items ?? []).filter(item => item.match);
  const confiaveis = semComposicao.filter(item => (item.match?.score ?? 0) >= 0.9);

  const aplicarComposicoes = (itens: typeof semComposicao) => {
    if (!itens.length) return;
    aplicarReconciliacao.mutate({
      projectId: projetoId,
      decisions: itens.map(item => ({
        budgetItemId: item.budgetItemId,
        action: "apply_match" as const,
        matchKind: item.match!.kind,
        matchId: item.match!.id,
        score: item.match!.score,
      })),
    });
  };

  return (
    <div className="pl-planejamento-box">
      <div className="pl-planejamento-box-head">
        <div>
          <strong>
            <GitMerge size={13} /> Conciliação com o orçamento
          </strong>
          <span>
            Sem vínculo entre atividade e item de orçamento não existe valor planejado por atividade —
            e sem valor planejado não existe curva S física, SPI nem CPI.
          </span>
        </div>
        {selecionadas.length > 0 && (
          <button type="button" className="pl-planejamento-cpm" onClick={vincular} disabled={aplicar.isPending}>
            <Link2 size={13} />
            {aplicar.isPending ? "Vinculando…" : `Vincular ${selecionadas.length}`}
          </button>
        )}
      </div>

      {diagnostico.isError && <div className="pl-planejamento-alerta erro">{diagnostico.error.message}</div>}
      {mensagem && <div className="pl-planejamento-alerta">{mensagem}</div>}

      {cobertura && (
        <>
          <div className="pl-conciliacao-barra" title={`${percentual}% do valor do orçamento está preso a uma atividade`}>
            <span style={{ width: `${Math.min(100, percentual)}%` }} />
          </div>
          <div className="pl-planejamento-cards">
            <div>
              <span>Orçamento vinculado</span>
              <strong>{percentual}%</strong>
              <small>
                {cobertura.valorVinculado.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} de{" "}
                {cobertura.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </small>
            </div>
            <div>
              <span>Atividades vinculadas</span>
              <strong>
                {cobertura.atividadesVinculadas}/{cobertura.atividadesTotal}
              </strong>
              <small>{cobertura.atividadesTotal - cobertura.atividadesVinculadas} sem item de orçamento</small>
            </div>
            <div>
              <span>Sem quantidade</span>
              <strong>{cobertura.atividadesSemQuantidade}</strong>
              <small>vinculadas, mas sem peso no EVM</small>
            </div>
            <div>
              <span>Itens sem composição</span>
              <strong>
                {cobertura.itensSemComposicao}/{cobertura.itensTotal}
              </strong>
              <small>custo unitário sem origem rastreável</small>
            </div>
          </div>
        </>
      )}

      {diagnostico.data && !diagnostico.data.versao && (
        <div className="pl-planejamento-alerta">
          <TriangleAlert size={13} /> Esta obra ainda não tem versão de orçamento — não há item para vincular.
        </div>
      )}

      {pendencias.length > 0 && (
        <>
          <div className="pl-planejamento-box-head">
            <div>
              <strong>Atividades sem item de orçamento</strong>
              <span>
                {pendencias.length} atividade(s). As marcadas vêm de vínculo inequívoco (mesmo código WBS);
                as demais são sugestão e precisam da sua decisão.
              </span>
            </div>
          </div>
          <div className="pl-cpm-tabela">
            {pendencias.map(pendencia => {
              const escolha = escolhas[pendencia.id];
              const sugestao = pendencia.sugestoes.find(item => item.budgetItemId === escolha?.itemId);
              return (
                <div key={pendencia.id} className="pl-conciliacao-linha">
                  <label className="pl-conciliacao-marca">
                    <input
                      type="checkbox"
                      checked={Boolean(escolha?.marcado)}
                      onChange={evento =>
                        setEscolhas(atual => ({
                          ...atual,
                          [pendencia.id]: { ...atual[pendencia.id], marcado: evento.target.checked },
                        }))
                      }
                      disabled={!escolha?.itemId}
                    />
                  </label>
                  <span className="pl-conciliacao-atividade">
                    <strong>{pendencia.wbsCode || "—"}</strong> {pendencia.name}
                    {pendencia.unit && <small> · {pendencia.unit}</small>}
                  </span>
                  <select
                    value={escolha?.itemId ?? ""}
                    onChange={evento => {
                      const itemId = evento.target.value ? Number(evento.target.value) : null;
                      const alvo = pendencia.sugestoes.find(item => item.budgetItemId === itemId);
                      setEscolhas(atual => ({
                        ...atual,
                        [pendencia.id]: {
                          itemId,
                          quantidade: alvo ? String(alvo.quantity) : "",
                          marcado: Boolean(itemId),
                        },
                      }));
                    }}
                  >
                    <option value="">— não vincular —</option>
                    {pendencia.sugestoes.map(item => (
                      <option key={item.budgetItemId} value={item.budgetItemId}>
                        {item.code} · {item.description.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={escolha?.quantidade ?? ""}
                    onChange={evento =>
                      setEscolhas(atual => ({
                        ...atual,
                        [pendencia.id]: { ...atual[pendencia.id], quantidade: evento.target.value },
                      }))
                    }
                    aria-label={`Quantidade prevista de ${pendencia.name}`}
                    placeholder="qtd"
                  />
                  <span className="pl-conciliacao-motivo">
                    {sugestao
                      ? sugestao.reason === "codigo"
                        ? "mesmo código"
                        : rotuloMotivo(sugestao)
                      : "sem sugestão"}
                    {sugestao?.unitMismatch && <em> · unidade difere</em>}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pendencias.length === 0 && cobertura && (
        <div className="pl-planejamento-alerta">
          <CheckCheck size={13} /> Todas as atividades já apontam para um item de orçamento.
          {cobertura.atividadesSemQuantidade > 0 &&
            ` Falta quantidade em ${cobertura.atividadesSemQuantidade} delas — preencha na aba de planejamento, coluna Quantidade.`}
        </div>
      )}

      {cobertura && cobertura.itensSemComposicao > 0 && (
        <>
          <div className="pl-planejamento-box-head">
            <div>
              <strong>Itens de orçamento sem composição</strong>
              <span>
                {cobertura.itensSemComposicao} item(ns) têm preço digitado mas nenhuma composição que o
                sustente. Sem isso o custo não é rastreável e o EVM compara previsto com previsto.
              </span>
            </div>
            <button
              type="button"
              className="pl-planejamento-cpm"
              onClick={() => setMostrarComposicoes(valor => !valor)}
              disabled={reconciliacao.isFetching}
            >
              <Wand2 size={13} />
              {mostrarComposicoes ? "Ocultar sugestões" : "Buscar composições"}
            </button>
          </div>

          {mostrarComposicoes && reconciliacao.isFetching && (
            <div className="pl-planejamento-alerta">Consultando a base SEINFRA…</div>
          )}

          {mostrarComposicoes && confiaveis.length > 0 && (
            <div className="pl-planejamento-alerta">
              <button
                type="button"
                className="pl-planejamento-cpm"
                onClick={() => aplicarComposicoes(confiaveis)}
                disabled={aplicarReconciliacao.isPending}
              >
                <CheckCheck size={13} /> Aplicar as {confiaveis.length} de confiança ≥ 90%
              </button>
            </div>
          )}

          {mostrarComposicoes && semComposicao.length > 0 && (
            <div className="pl-cpm-tabela">
              {semComposicao.slice(0, 25).map(item => (
                <div key={item.budgetItemId} className="pl-conciliacao-linha">
                  <span className="pl-conciliacao-atividade">
                    <strong>{item.code}</strong> {item.description.slice(0, 50)}
                    <small> · {item.unit}</small>
                  </span>
                  <span className="pl-conciliacao-atividade">
                    {item.match!.description.slice(0, 60)}
                    <small> · {Math.round(item.match!.score * 100)}%</small>
                  </span>
                  <span>{item.match!.unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  <button
                    type="button"
                    className="pl-planejamento-cpm"
                    onClick={() => aplicarComposicoes([item])}
                    disabled={aplicarReconciliacao.isPending}
                  >
                    Aplicar
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
