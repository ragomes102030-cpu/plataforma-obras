import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PainelCoerenciaEngenharia } from "./PainelCoerenciaEngenharia";
import { PainelConciliacao } from "./PainelConciliacao";
import { PainelValorGanho } from "./PainelValorGanho";
import { PainelMedicao } from "./PainelMedicao";

type Props = {
  projetoId: number;
};

function moeda(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AbaOrcamento({ projetoId }: Props) {
  const [filtro, setFiltro] = useState<string>("todos");

  const budget = trpc.budgets.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  const items = budget.data?.items ?? [];
  const total = budget.data?.total ?? 0;
  const itensComValor = items.filter((i) => Number(i.unitPrice) > 0).length;
  const itensSemValor = items.length - itensComValor;

  const versaoAtiva = budget.data?.versions?.find((v) => v.id === budget.data?.activeVersionId);
  const carregando = budget.isPending;
  const erro = budget.isError;

  const itensFiltrados =
    filtro === "todos"
      ? items
      : items.filter((i) => {
          if (filtro === "com_valor") return Number(i.unitPrice) > 0;
          if (filtro === "sem_valor") return Number(i.unitPrice) === 0;
          return true;
        });

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">ORÇAMENTO E CUSTOS</span>
          <h2>
            {carregando ? "Lendo orçamento…" : erro ? "Orçamento indisponível" : moeda(total)}
          </h2>
          <p>
            {carregando
              ? "Buscando itens e valores da versão ativa…"
              : erro
                ? "Não foi possível ler o orçamento. Tente novamente."
                : `${items.length} itens — ${itensComValor} com valor, ${itensSemValor} sem valor`}
          </p>
          {!carregando && !erro && versaoAtiva && (
            <p className="xl-painel-versao">
              Versão ativa: v{versaoAtiva.versionNumber} · {versaoAtiva.name}
              {versaoAtiva.status ? ` · ${versaoAtiva.status}` : ""}
            </p>
          )}
        </div>
        <div className="xl-filtros">
          <button
            type="button"
            className={`xl-btn ${filtro === "todos" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("todos")}
            disabled={carregando}
          >
            Todos
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "com_valor" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("com_valor")}
            disabled={carregando}
          >
            Com valor
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "sem_valor" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("sem_valor")}
            disabled={carregando}
          >
            Sem valor
          </button>
        </div>
      </div>

      {erro && (
        <div className="xl-aviso xl-aviso-erro">
          <strong>O orçamento não carregou.</strong>
          <p>O cronograma continua disponível; só esta leitura falhou.</p>
          <button type="button" className="xl-btn xl-btn-primary" onClick={() => void budget.refetch()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!carregando && !erro && items.length === 0 && (
        <div className="xl-aviso">
          <strong>Esta versão do orçamento está vazia.</strong>
          <p>
            Versão nova nasce sem itens: os itens continuam na versão anterior até serem importados
            ou copiados. Enquanto isso, o avanço por valor e a curva financeira ficam sem peso.
          </p>
        </div>
      )}

      <section className="xl-analises">
        <div className="xl-analises-topo">
          <h3>Análises do orçamento</h3>
          <p>
            Cada análise varre composições, vínculos e medições. Elas só rodam quando você abre —
            assim a lista de itens carrega primeiro.
          </p>
        </div>

        <details className="xl-analise">
          <summary>
            <span>Coerência de engenharia</span>
            <small>Quantidade, composição e sequência fora do lugar</small>
          </summary>
          <PainelCoerenciaEngenharia projetoId={projetoId} />
        </details>

        <details className="xl-analise">
          <summary>
            <span>Conciliação atividade ↔ item</span>
            <small>O que está sem vínculo e por que o EVM zera</small>
          </summary>
          <PainelConciliacao projetoId={projetoId} />
        </details>

        <details className="xl-analise">
          <summary>
            <span>Valor ganho (EVM)</span>
            <small>PV, EV, AC, SPI e CPI</small>
          </summary>
          <PainelValorGanho projetoId={projetoId} />
        </details>

        <details className="xl-analise">
          <summary>
            <span>Medição e desembolso</span>
            <small>Executado vira receita; custo vira curva de caixa</small>
          </summary>
          <PainelMedicao projetoId={projetoId} />
        </details>
      </section>

      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Unidade</th>
              <th>Qtd</th>
              <th>Preço unit.</th>
              <th>Total</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={7} className="xl-tabela-vazia">
                  Carregando itens…
                </td>
              </tr>
            ) : itensFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="xl-tabela-vazia">
                  {items.length === 0
                    ? "Nenhum item nesta versão do orçamento."
                    : "Nenhum item neste filtro."}
                </td>
              </tr>
            ) : (
              itensFiltrados.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.description}</td>
                  <td>{item.unit}</td>
                  <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                  <td>{moeda(Number(item.unitPrice))}</td>
                  <td>{moeda(Number(item.quantity) * Number(item.unitPrice))}</td>
                  <td>{item.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
