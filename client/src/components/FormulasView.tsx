import { Calculator } from "lucide-react";

/** Catálogo documental — aba FÓRMULAS da planilha-modelo ARES (P1). */
const FORMULAS: {
  sigla: string;
  nome: string;
  formula: string;
  unidade: string;
  uso: string;
}[] = [
  {
    sigla: "P",
    nome: "Produtividade / ritmo",
    formula: "P = Quantidade ÷ Prazo",
    unidade: "un/h · un/dia",
    uso: "PLANEJAMENTO, PRODUÇÃO, RECURSOS",
  },
  {
    sigla: "D",
    nome: "Duração",
    formula: "D = Fim − Início + 1",
    unidade: "dias",
    uso: "PLANEJAMENTO, CRONOGRAMA (P3)",
  },
  {
    sigla: "%Prod",
    nome: "Percentual produzido",
    formula: "%Prod = Qp ÷ Qc",
    unidade: "%",
    uso: "PRODUÇÃO, INDICADORES",
  },
  {
    sigla: "%Med",
    nome: "Percentual medido",
    formula: "%Med = Qm ÷ Qc",
    unidade: "%",
    uso: "MEDIÇÃO",
  },
  {
    sigla: "Vm",
    nome: "Valor medido",
    formula: "Vm = Qm × P",
    unidade: "R$",
    uso: "MEDIÇÃO, ORÇAMENTO",
  },
  {
    sigla: "S",
    nome: "Saldo",
    formula: "S = Vc − Vm",
    unidade: "R$",
    uso: "MEDIÇÃO, DASHBOARD",
  },
  {
    sigla: "Cr",
    nome: "Custo realizado",
    formula: "Cr = Qp × P",
    unidade: "R$",
    uso: "PRODUÇÃO, ORÇAMENTO",
  },
  {
    sigla: "Pm",
    nome: "Produtividade média",
    formula: "Pm = Q ÷ E",
    unidade: "un/h",
    uso: "RECURSOS, INDICADORES",
  },
  {
    sigla: "%Plan",
    nome: "Percentual planejado",
    formula: "%Plan = Qpl ÷ Qc",
    unidade: "%",
    uso: "PLANEJAMENTO, LOB, CONTROLE",
  },
  {
    sigla: "Sp",
    nome: "Valor planejado",
    formula: "Sp = Qpl × P",
    unidade: "R$",
    uso: "ORÇAMENTO × CRONOGRAMA",
  },
];

const REGRAS = [
  "ORÇADO ≠ CONTRATADO ≠ PRODUZIDO ≠ MEDIDO — nunca confundir as quatro bases.",
  "QTD_PLANEJADA ≠ QTD_PRODUZIDA ≠ QTD_MEDIDA — colunas separadas no modelo.",
  "PLANEJAMENTO ≠ PRODUÇÃO · PRODUÇÃO ≠ MEDIÇÃO.",
  "VALOR_CONTRATADO, VALOR_ORCADO e PRECO_UNITÁRIO (com BDI) são derivados — não digitados.",
  "SERVIÇO = EAP × FRENTE × LOCAL (composição única; duplicatas são sinalizadas).",
  "BDI segue fórmula TCU (CONFIGURAÇÕES); percentuais só com fonte oficial — 0% = pendente.",
] as const;

export function FormulasView({ projectName }: { projectName: string }) {
  return (
    <div className="module-page">
      <div className="module-hero">
        <div className="module-icon">
          <Calculator size={22} />
        </div>
        <div>
          <p className="eyebrow accent">REFERÊNCIA TÉCNICA</p>
          <h2>Fórmulas</h2>
          <p>
            {projectName} · catálogo canônico das fórmulas de domínio (origem:
            planilha-modelo ARES).
          </p>
        </div>
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Fórmulas canônicas</h3>
            <p>
              Qc = quantidade contratada · Qp = produzida · Qm = medida · Qpl =
              planejada · P = preço/produtividade · E = esforço.
            </p>
          </div>
          <Calculator size={17} className="sparkle" />
        </div>
        <div className="budget-table-wrap">
          <table className="budget-table">
            <thead>
              <tr>
                <th>Sigla</th>
                <th>Nome</th>
                <th>Fórmula</th>
                <th>Unidade</th>
                <th>Onde se aplica</th>
              </tr>
            </thead>
            <tbody>
              {FORMULAS.map(item => (
                <tr key={item.sigla}>
                  <td>
                    <strong>{item.sigla}</strong>
                  </td>
                  <td>{item.nome}</td>
                  <td>
                    <code>{item.formula}</code>
                  </td>
                  <td>{item.unidade}</td>
                  <td>{item.uso}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Regras de domínio (anti-conflito)</h3>
            <p>Invariantes que o sistema e os relatórios devem respeitar.</p>
          </div>
        </div>
        <div className="planning-list">
          {REGRAS.map((regra, index) => (
            <div className="planning-row" key={regra}>
              <div>
                <strong>R{index + 1}</strong>
                <span>{regra}</span>
              </div>
              <b>Domínio</b>
            </div>
          ))}
        </div>
      </div>

      <div className="module-card">
        <div className="panel-heading">
          <div>
            <h3>Derivados não digitados</h3>
            <p>Campos calculados — edição manual invalida a consistência.</p>
          </div>
        </div>
        <div className="module-empty">
          VALOR_CONTRATADO · VALOR_ORCADO · CUSTO_DIRETO · PRECO_UNITÁRIO (com
          BDI) · %PROD · %MED · SALDO
        </div>
      </div>
    </div>
  );
}
