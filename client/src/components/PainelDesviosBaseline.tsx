import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { LinhaDesvio, SituacaoDesvio } from "@shared/desvios-baseline";
import { EstadoCarregando } from "./EstadoCarregando";

/**
 * "O que mudou desde que eu aprovei isto?" — a pergunta que faz a baseline
 * valer alguma coisa. Sem esta comparação, capturar baseline é arquivar uma
 * fotografia que ninguém abre: o engenheiro sabe que atrasou, mas não sabe
 * quanto do atraso é desvio do que foi aprovado e quanto é escopo novo que
 * entrou depois da aprovação.
 *
 * A ligação com a baseline é pelo código da EAP (feita no servidor), então
 * refazer a EAP não zera o histórico.
 */

type BaselineDoProjeto = { id: number; name: string; createdAt: Date | string };

const ROTULO: Record<SituacaoDesvio, string> = {
  atrasada: "Atrasada",
  adiantada: "Adiantada",
  igual: "Igual",
  nova: "Escopo novo",
  removida: "Saiu do plano",
  indefinida: "Sem data",
};

const dias = (valor: number | null): string => {
  if (valor == null) return "—";
  if (valor === 0) return "0 d";
  return `${valor > 0 ? "+" : "−"}${Math.abs(valor)} d`;
};

const dataCurta = (valor: Date | string | null): string => {
  if (!valor) return "—";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

/** Ordena pelo que dói: maior atraso primeiro, sem data e iguais no fim. */
function ordenar(linhas: LinhaDesvio[]): LinhaDesvio[] {
  return [...linhas].sort((a, b) => {
    const ordem = (linha: LinhaDesvio) =>
      linha.situacao === "removida" ? Number.POSITIVE_INFINITY : (linha.deltaFim ?? -1);
    const diferenca = ordem(b) - ordem(a);
    return diferenca !== 0 ? diferenca : (a.wbsCode ?? "").localeCompare(b.wbsCode ?? "");
  });
}

export function PainelDesviosBaseline({
  projetoId,
  baselines,
}: {
  projetoId: number;
  baselines: BaselineDoProjeto[];
}) {
  const [baselineId, setBaselineId] = useState<number | undefined>(undefined);
  const [somenteMudancas, setSomenteMudancas] = useState(true);

  const comparacao = trpc.planning.compararComBaseline.useQuery(
    { projectId: projetoId, baselineId },
    { enabled: projetoId > 0 && baselines.length > 0 }
  );

  const linhas = useMemo(() => {
    const todas = comparacao.data?.linhas ?? [];
    return ordenar(somenteMudancas ? todas.filter(linha => linha.situacao !== "igual") : todas);
  }, [comparacao.data, somenteMudancas]);

  if (baselines.length === 0) return null;

  if (comparacao.isPending) {
    return (
      <div className="pl-planejamento-box">
        <EstadoCarregando rotulo="Comparando o planejamento com a baseline…" detalhe="lendo a fotografia e as datas de hoje" />
      </div>
    );
  }

  if (comparacao.isError) {
    return (
      <div className="pl-planejamento-alerta">
        Não foi possível comparar com a baseline: {comparacao.error.message}
      </div>
    );
  }

  const dados = comparacao.data;
  if (!dados) {
    return (
      <div className="pl-planejamento-box">
        <div className="pl-planejamento-box-head">
          <div>
            <strong>Comparação com a baseline</strong>
            <span>Nenhuma baseline capturada para esta obra.</span>
          </div>
        </div>
      </div>
    );
  }

  const { resumo, baseline } = dados;
  const variacaoDePrazo = resumo.duracaoAtual - resumo.duracaoBaseline;

  return (
    <div className="pl-planejamento-box">
      <div className="pl-planejamento-box-head">
        <div>
          <strong>O que mudou desde a baseline</strong>
          <span>
            {baseline.name} · capturada em {dataCurta(baseline.createdAt)} · compara com a versão de
            trabalho atual pelo código da EAP
          </span>
        </div>
        <div className="pl-desvio-filtros">
          <label>
            Baseline
            <select
              value={baselineId ?? baseline.id}
              onChange={evento => setBaselineId(Number(evento.target.value))}
              aria-label="Baseline usada na comparação"
            >
              {baselines.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pl-desvio-checkbox">
            <input
              type="checkbox"
              checked={somenteMudancas}
              onChange={evento => setSomenteMudancas(evento.target.checked)}
            />
            só o que mudou
          </label>
        </div>
      </div>

      <div className="pl-planejamento-cards pl-desvio-cards">
        <div className={resumo.atrasadas > 0 ? "alerta" : undefined}>
          <span>Atrasadas</span>
          <strong>{resumo.atrasadas}</strong>
          <small>
            {resumo.atrasoNoFim > 0
              ? `maior atraso ${resumo.atrasoNoFim} d · média ${resumo.atrasoMedioFim} d`
              : "nada atrasou"}
          </small>
        </div>
        <div>
          <span>Adiantadas</span>
          <strong>{resumo.adiantadas}</strong>
          <small>{resumo.maiorAvanco < 0 ? `melhor avanço ${resumo.maiorAvanco} d` : "nenhum avanço"}</small>
        </div>
        <div>
          <span>Escopo novo</span>
          <strong>{resumo.novas}</strong>
          <small>atividades que não estavam na baseline</small>
        </div>
        <div className={resumo.removidas > 0 ? "alerta" : undefined}>
          <span>Fora do plano</span>
          <strong>{resumo.removidas}</strong>
          <small>estavam na baseline e saíram</small>
        </div>
        <div>
          <span>Prazo da obra</span>
          <strong>{variacaoDePrazo === 0 ? "igual" : `${variacaoDePrazo > 0 ? "+" : "−"}${Math.abs(variacaoDePrazo)} d`}</strong>
          <small>
            baseline {resumo.duracaoBaseline} d → hoje {resumo.duracaoAtual} d
          </small>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="pl-tabela-legenda">
          Nada mudou desde a baseline: as datas de hoje são as mesmas da fotografia.
        </p>
      ) : (
        <div className="pl-tabela-wrap">
          <table className="pl-tabela-analitica">
            <thead>
              <tr>
                <th>EAP</th>
                <th>Atividade</th>
                <th>Baseline</th>
                <th>Hoje</th>
                <th>Início</th>
                <th>Término</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(linha => (
                <tr key={`${linha.situacao}-${linha.chave}-${linha.atividadeId ?? "b"}`}>
                  <td className="pl-bloqueio-wbs">{linha.wbsCode ?? "—"}</td>
                  <td>{linha.nome}</td>
                  <td>
                    {linha.baselineInicio == null || linha.baselineFim == null
                      ? "—"
                      : `${linha.baselineInicio} → ${linha.baselineFim} d`}
                  </td>
                  <td>
                    {linha.atualInicio == null || linha.atualFim == null
                      ? "—"
                      : `${linha.atualInicio} → ${linha.atualFim} d`}
                  </td>
                  <td>{dias(linha.deltaInicio)}</td>
                  <td className={linha.deltaFim != null && linha.deltaFim > 0 ? "pl-desvio-atraso" : undefined}>
                    {dias(linha.deltaFim)}
                  </td>
                  <td>
                    <span className={`pl-desvio-tag pl-desvio-${linha.situacao}`}>
                      {ROTULO[linha.situacao]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pl-tabela-legenda">
        Dias são contados no calendário corrido do cronograma. "Adiantada" é o que terminou antes do
        aprovado; "Fora do plano" é escopo que existia na fotografia e sumiu — vale registrar o
        motivo antes da próxima aprovação.
      </p>
    </div>
  );
}
