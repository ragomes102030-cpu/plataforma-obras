import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Props = {
  projetoId: number;
};

export function AbaOrcamento({ projetoId }: Props) {
  const [filtro, setFiltro] = useState<string>("todos");

  const budget = trpc.budgets.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  const items = budget.data?.items ?? [];
  const total = items.reduce((s, item) => s + Number(item.quantity) * Number(item.unitPrice), 0);
  const itensComValor = items.filter(i => Number(i.unitPrice) > 0).length;
  const itensSemValor = items.length - itensComValor;

  const itensFiltrados = filtro === "todos" ? items : items.filter(i => {
    if (filtro === "com_valor") return Number(i.unitPrice) > 0;
    if (filtro === "sem_valor") return Number(i.unitPrice) === 0;
    return true;
  });

  // Agrupa por código WBS
  const porGrupo = items.reduce((acc, item) => {
    const grupo = item.wbsNodeId?.toString() ?? "sem_grupo";
    acc[grupo] = (acc[grupo] ?? 0) + Number(item.quantity) * Number(item.unitPrice);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">ORÇAMENTO E CUSTOS</span>
          <h2>R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</h2>
          <p>
            {items.length} itens — {itensComValor} com valor, {itensSemValor} sem valor
          </p>
        </div>
        <div className="xl-filtros">
          <button
            type="button"
            className={`xl-btn ${filtro === "todos" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("todos")}
          >
            Todos
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "com_valor" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("com_valor")}
          >
            Com valor
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "sem_valor" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("sem_valor")}
          >
            Sem valor
          </button>
        </div>
      </div>

      <div className="xl-cartoes">
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Total geral</span>
          <strong className="xl-cartao-valor">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Itens</span>
          <strong className="xl-cartao-valor">{items.length}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Com valor</span>
          <strong className="xl-cartao-valor">{itensComValor}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Sem valor</span>
          <strong className="xl-cartao-valor">{itensSemValor}</strong>
        </div>
      </div>

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
            {itensFiltrados.map(item => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.description}</td>
                <td>{item.unit}</td>
                <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                <td>R$ {Number(item.unitPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td>R$ {(Number(item.quantity) * Number(item.unitPrice)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td>{item.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
