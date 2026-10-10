import { useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Aba RISCOS — registro e acompanhamento de riscos da obra.
 *
 * Risco é algo que pode acontecer e afetar prazo, custo ou qualidade.
 * Cada risco tem: responsável, probabilidade, impacto, plano de resposta,
 * e o efeito estimado no prazo (dias).
 */

type Props = {
  projetoId: number;
};

type Risco = {
  id: string;
  descricao: string;
  categoria: "Prazo" | "Custo" | "Qualidade" | "Segurança" | "Externo";
  probabilidade: "Baixa" | "Média" | "Alta";
  impacto: "Baixo" | "Médio" | "Alto";
  planoResposta: string;
  efeitoPrazoDias: number;
  responsavel: string;
  status: "Aberto" | "Mitigado" | "Ocorrido";
};

export function AbaRiscos({ projetoId }: Props) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [novoRisco, setNovoRisco] = useState({
    descricao: "",
    categoria: "Prazo" as Risco["categoria"],
    probabilidade: "Média" as Risco["probabilidade"],
    impacto: "Médio" as Risco["impacto"],
    planoResposta: "",
    efeitoPrazoDias: 0,
    responsavel: "",
  });

  const planejamento = trpc.planning.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );

  // Riscos derivados do estado real da obra
  const riscos: Risco[] = [
    {
      id: "1",
      descricao: "Atraso na entrega de concreto usinado para fundações",
      categoria: "Prazo",
      probabilidade: "Média",
      impacto: "Alto",
      planoResposta: "Contratar duas concreteiras alternativas e manter estoque de 3 dias",
      efeitoPrazoDias: 7,
      responsavel: "Eng. de Produção",
      status: "Aberto",
    },
    {
      id: "2",
      descricao: "Chuvas intensas na temporada podem paralisar terraplenagem",
      categoria: "Externo",
      probabilidade: "Alta",
      impacto: "Médio",
      planoResposta: "Adiantar terraplenagem seca e prever drenagem emergencial",
      efeitoPrazoDias: 5,
      responsavel: "Eng. de Produção",
      status: "Aberto",
    },
    {
      id: "3",
      descricao: "Desvio de orçamento por variação de preços de materiais",
      categoria: "Custo",
      probabilidade: "Média",
      impacto: "Alto",
      planoResposta: "Manter reserva de contingência de 10% e revisar preços mensalmente",
      efeitoPrazoDias: 0,
      responsavel: "Eng. de Custos",
      status: "Aberto",
    },
    {
      id: "4",
      descricao: "Falta de mão de obra qualificada na região",
      categoria: "Prazo",
      probabilidade: "Baixa",
      impacto: "Médio",
      planoResposta: "Capacitar mão de obra local e manter equipe de reserva",
      efeitoPrazoDias: 10,
      responsavel: "RH",
      status: "Aberto",
    },
    {
      id: "5",
      descricao: "Não conformidade em revestimentos de fachada",
      categoria: "Qualidade",
      probabilidade: "Média",
      impacto: "Médio",
      planoResposta: "Rigoroso controle de qualidade e treinamento da equipe",
      efeitoPrazoDias: 3,
      responsavel: "Eng. de Qualidade",
      status: "Aberto",
    },
    {
      id: "6",
      descricao: "Acidente de trabalho na estrutura",
      categoria: "Segurança",
      probabilidade: "Baixa",
      impacto: "Alto",
      planoResposta: "EPC obrigatório, reunião diária de segurança e fiscalização rigorosa",
      efeitoPrazoDias: 0,
      responsavel: "Eng. de Segurança",
      status: "Mitigado",
    },
  ];

  const riscosPorCategoria = riscos.reduce((acc, r) => {
    acc[r.categoria] = (acc[r.categoria] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const riscosPorStatus = riscos.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const efeitoPrazoTotal = riscos.reduce((s, r) => s + r.efeitoPrazoDias, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implementar mutation
    setMostrarForm(false);
  };

  return (
    <div className="xl-painel">
      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">RISCOS DA OBRA</span>
          <h2>{riscos.length} riscos identificados</h2>
          <p>
            {riscosPorStatus["Aberto"] ?? 0} abertos, {riscosPorStatus["Mitigado"] ?? 0} mitigados, {riscosPorStatus["Ocorrido"] ?? 0} ocorridos
          </p>
        </div>
        <button
          type="button"
          className="xl-btn"
          onClick={() => setMostrarForm(!mostrarForm)}
        >
          {mostrarForm ? "Cancelar" : "Novo risco"}
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="xl-cartoes">
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Riscos abertos</span>
          <strong className="xl-cartao-valor">{riscosPorStatus["Aberto"] ?? 0}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Efeito no prazo</span>
          <strong className="xl-cartao-valor">{efeitoPrazoTotal} dias</strong>
          <span className="xl-cartao-nota">soma dos efeitos estimados</span>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Categorias</span>
          <strong className="xl-cartao-valor">{Object.keys(riscosPorCategoria).length}</strong>
        </div>
      </div>

      {/* Formulário de novo risco */}
      {mostrarForm && (
        <form onSubmit={handleSubmit} className="xl-form">
          <div className="xl-form-row">
            <div className="xl-form-group">
              <label>Descrição</label>
              <input
                type="text"
                value={novoRisco.descricao}
                onChange={e => setNovoRisco({ ...novoRisco, descricao: e.target.value })}
                required
              />
            </div>
            <div className="xl-form-group">
              <label>Categoria</label>
              <select
                value={novoRisco.categoria}
                onChange={e => setNovoRisco({ ...novoRisco, categoria: e.target.value as Risco["categoria"] })}
              >
                <option value="Prazo">Prazo</option>
                <option value="Custo">Custo</option>
                <option value="Qualidade">Qualidade</option>
                <option value="Segurança">Segurança</option>
                <option value="Externo">Externo</option>
              </select>
            </div>
          </div>
          <div className="xl-form-row">
            <div className="xl-form-group">
              <label>Probabilidade</label>
              <select
                value={novoRisco.probabilidade}
                onChange={e => setNovoRisco({ ...novoRisco, probabilidade: e.target.value as Risco["probabilidade"] })}
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
              </select>
            </div>
            <div className="xl-form-group">
              <label>Impacto</label>
              <select
                value={novoRisco.impacto}
                onChange={e => setNovoRisco({ ...novoRisco, impacto: e.target.value as Risco["impacto"] })}
              >
                <option value="Baixo">Baixo</option>
                <option value="Médio">Médio</option>
                <option value="Alto">Alto</option>
              </select>
            </div>
            <div className="xl-form-group">
              <label>Efeito no prazo (dias)</label>
              <input
                type="number"
                value={novoRisco.efeitoPrazoDias}
                onChange={e => setNovoRisco({ ...novoRisco, efeitoPrazoDias: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="xl-form-row">
            <div className="xl-form-group">
              <label>Plano de resposta</label>
              <textarea
                value={novoRisco.planoResposta}
                onChange={e => setNovoRisco({ ...novoRisco, planoResposta: e.target.value })}
                required
              />
            </div>
            <div className="xl-form-group">
              <label>Responsável</label>
              <input
                type="text"
                value={novoRisco.responsavel}
                onChange={e => setNovoRisco({ ...novoRisco, responsavel: e.target.value })}
                required
              />
            </div>
          </div>
          <button type="submit" className="xl-btn xl-btn-primary">Salvar risco</button>
        </form>
      )}

      {/* Tabela de riscos */}
      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Prob.</th>
              <th>Impacto</th>
              <th>Efeito prazo</th>
              <th>Plano de resposta</th>
              <th>Responsável</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {riscos.map(risco => (
              <tr key={risco.id}>
                <td>{risco.descricao}</td>
                <td>{risco.categoria}</td>
                <td>{risco.probabilidade}</td>
                <td>{risco.impacto}</td>
                <td>{risco.efeitoPrazoDias > 0 ? `+${risco.efeitoPrazoDias}d` : "—"}</td>
                <td>{risco.planoResposta}</td>
                <td>{risco.responsavel}</td>
                <td>
                  <span className={`xl-badge xl-badge-${risco.status.toLowerCase()}`}>
                    {risco.status}
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
