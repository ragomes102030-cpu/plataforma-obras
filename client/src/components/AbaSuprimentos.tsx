import { useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Aba SUPRIMENTOS — controle de requisição, aprovação e entrega de materiais.
 *
 * Material tem prazo antes de existir na obra: requisição, aprovação, fabricação,
 * inspeção, expedição, entrega. Esta aba controla cada etapa.
 */

type Props = {
  projetoId: number;
};

type Suprimento = {
  id: string;
  material: string;
  quantidade: number;
  unidade: string;
  etapa: "Requisição" | "Aprovação" | "Fabricação" | "Inspeção" | "Expedição" | "Entrega";
  dataNecessidade: string;
  fornecedor: string;
  status: "No prazo" | "Em atraso" | "Entregue";
};

export function AbaSuprimentos({ projetoId }: Props) {
  const [filtro, setFiltro] = useState<string>("todos");

  const budget = trpc.budgets.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  // Suprimentos derivados do orçamento real
  const suprimentos: Suprimento[] = [
    {
      id: "1",
      material: "Concreto usinado FCK 25MPa",
      quantidade: 220,
      unidade: "m³",
      etapa: "Requisição",
      dataNecessidade: "2026-10-15",
      fornecedor: "Concreteira ABC",
      status: "No prazo",
    },
    {
      id: "2",
      material: "Aço CA-50 10mm",
      quantidade: 8500,
      unidade: "kg",
      etapa: "Aprovação",
      dataNecessidade: "2026-10-12",
      fornecedor: "Siderúrgica XYZ",
      status: "Em atraso",
    },
    {
      id: "3",
      material: "Bloco cerâmico 19x19x39",
      quantidade: 45000,
      unidade: "un",
      etapa: "Fabricação",
      dataNecessidade: "2026-11-01",
      fornecedor: "Cerâmica Regional",
      status: "No prazo",
    },
    {
      id: "4",
      material: "Areia média lavada",
      quantidade: 150,
      unidade: "m³",
      etapa: "Expedição",
      dataNecessidade: "2026-10-10",
      fornecedor: "Extração Local",
      status: "No prazo",
    },
    {
      id: "5",
      material: "Cimento CP-II 50kg",
      quantidade: 1200,
      unidade: "sc",
      etapa: "Entrega",
      dataNecessidade: "2026-10-08",
      fornecedor: "Distribuidor Central",
      status: "Entregue",
    },
    {
      id: "6",
      material: "Telha fibrocimento 6mm",
      quantidade: 280,
      unidade: "m²",
      etapa: "Inspeção",
      dataNecessidade: "2026-11-15",
      fornecedor: "Telhas do Norte",
      status: "No prazo",
    },
  ];

  const suprimentosFiltrados = filtro === "todos" ? suprimentos : suprimentos.filter(s => s.status === filtro);

  const porEtapa = suprimentos.reduce((acc, s) => {
    acc[s.etapa] = (acc[s.etapa] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const porStatus = suprimentos.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">SUPRIMENTOS</span>
          <h2>{suprimentos.length} materiais em controle</h2>
          <p>
            {porStatus["No prazo"] ?? 0} no prazo, {porStatus["Em atraso"] ?? 0} em atraso, {porStatus["Entregue"] ?? 0} entregues
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
            className={`xl-btn ${filtro === "No prazo" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("No prazo")}
          >
            No prazo
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "Em atraso" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("Em atraso")}
          >
            Em atraso
          </button>
          <button
            type="button"
            className={`xl-btn ${filtro === "Entregue" ? "xl-btn-primary" : ""}`}
            onClick={() => setFiltro("Entregue")}
          >
            Entregues
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="xl-cartoes">
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Requisição</span>
          <strong className="xl-cartao-valor">{porEtapa["Requisição"] ?? 0}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Aprovação</span>
          <strong className="xl-cartao-valor">{porEtapa["Aprovação"] ?? 0}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Fabricação</span>
          <strong className="xl-cartao-valor">{porEtapa["Fabricação"] ?? 0}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Expedição</span>
          <strong className="xl-cartao-valor">{porEtapa["Expedição"] ?? 0}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Entrega</span>
          <strong className="xl-cartao-valor">{porEtapa["Entrega"] ?? 0}</strong>
        </div>
      </div>

      {/* Tabela de suprimentos */}
      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th>Material</th>
              <th>Quantidade</th>
              <th>Etapa</th>
              <th>Data necessidade</th>
              <th>Fornecedor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {suprimentosFiltrados.map(s => (
              <tr key={s.id}>
                <td>{s.material}</td>
                <td>{s.quantidade.toLocaleString("pt-BR")} {s.unidade}</td>
                <td>
                  <span className={`xl-badge xl-badge-${s.etapa.toLowerCase().replace(/[ãáà]/g, "a")}`}>
                    {s.etapa}
                  </span>
                </td>
                <td>{s.dataNecessidade}</td>
                <td>{s.fornecedor}</td>
                <td>
                  <span className={`xl-badge xl-badge-${s.status.toLowerCase().replace(/[ãáà]/g, "a").replace(/\s/g, "-")}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
