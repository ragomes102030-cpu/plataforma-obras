import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Aba SUPRIMENTOS — materiais que o orçamento manda comprar.
 *
 * Antes esta aba mostrava seis materiais inventados ("Concreteira ABC",
 * "Siderúrgica XYZ") com prazo e status de entrega, ao lado do orçamento real.
 * Numa obra de verdade isso é pior do que tela vazia: o engenheiro não sabe o
 * que é dado e o que é exemplo.
 *
 * Agora ela lê a versão ativa do orçamento e lista o que existe de fato. O
 * controle de requisição, aprovação e entrega entra quando houver onde gravar —
 * até lá cada linha diz, com todas as letras, "sem requisição".
 */

type Props = {
  projetoId: number;
};

function moeda(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AbaSuprimentos({ projetoId }: Props) {
  const [busca, setBusca] = useState("");

  const budget = trpc.budgets.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  const itens = budget.data?.items ?? [];
  const total = budget.data?.total ?? 0;

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .map((item) => ({
        ...item,
        valorTotal: Number(item.quantity) * Number(item.unitPrice),
      }))
      .filter((item) => {
        if (!termo) return true;
        return `${item.code} ${item.description}`.toLowerCase().includes(termo);
      })
      .sort((a, b) => b.valorTotal - a.valorTotal);
  }, [busca, itens]);

  const carregando = budget.isPending;
  const erro = budget.isError;

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">SUPRIMENTOS</span>
          <h2>
            {carregando
              ? "Lendo orçamento…"
              : erro
                ? "Orçamento indisponível"
                : `${itens.length} materiais no orçamento`}
          </h2>
          <p>
            {carregando
              ? "Buscando os itens da versão ativa…"
              : erro
                ? "Não foi possível ler os itens. Tente novamente."
                : `${moeda(total)} em materiais e serviços previstos`}
          </p>
        </div>
        <div className="xl-filtros">
          <input
            type="search"
            className="xl-campo-busca"
            placeholder="Buscar material ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            disabled={carregando || erro}
            aria-label="Buscar material ou código"
          />
        </div>
      </div>

      <div className="xl-aviso">
        <strong>O que já está pronto e o que falta.</strong>
        <p>
          A lista abaixo é real: vem do orçamento. Requisição, aprovação, fabricação e entrega
          ainda não têm onde ser gravadas — quando tiverem, cada linha ganha prazo e fornecedor.
          Até lá, toda linha aparece como <em>sem requisição</em>.
        </p>
      </div>

      {erro && (
        <div className="xl-aviso xl-aviso-erro">
          <strong>Os itens não carregaram.</strong>
          <button type="button" className="xl-btn xl-btn-primary" onClick={() => void budget.refetch()}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th>Código</th>
              <th>Material</th>
              <th>Unidade</th>
              <th>Quantidade</th>
              <th>Valor unit.</th>
              <th>Valor total</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={7} className="xl-tabela-vazia">
                  Carregando materiais…
                </td>
              </tr>
            ) : lista.length === 0 ? (
              <tr>
                <td colSpan={7} className="xl-tabela-vazia">
                  {itens.length === 0
                    ? "O orçamento desta obra ainda não tem itens. Importe o orçamento para ver os materiais aqui."
                    : "Nenhum material com esse termo."}
                </td>
              </tr>
            ) : (
              lista.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.description}</td>
                  <td>{item.unit}</td>
                  <td>{Number(item.quantity).toLocaleString("pt-BR")}</td>
                  <td>{moeda(Number(item.unitPrice))}</td>
                  <td>{moeda(item.valorTotal)}</td>
                  <td>
                    <span className="xl-badge">sem requisição</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
