import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { localIsoDe } from "@/lib/datas";

/**
 * A aba PRODUÇÃO: a fonte do `% Real`.
 *
 * POR QUE ESTA ABA É A FONSA
 *
 * Na planilha de referência, `% Real` é \`SUMIF(PRODUCAO!B:B, código,
 * PRODUCAO!C:C) / Quantidade\` — a soma do que foi executado, na aba
 * PRODUCAO, dividida pelo planejado. E o motor de colunas faz a mesma coisa,
 * lendo \`production_entries\`. Sem lançamento aqui, o avanço real é zero por
 * construção, sem erro e sem aviso: só a coluna em 0%.
 *
 * POR QUE A GRADE E LINHA × DATA
 *
 * É a forma da planilha, e a forma que deixa bater o olho em "a alvenaria parou
 * em novembro" sem somar coluna por coluna. A soma por atividade vem pronta do
 * backend (\`porAtividade\`), e a grade aqui só desenha: um \`reduce\` no
 * componente para formar a grade é o tipo de conta que diverge do motor.
 *
 * POR QUE EQUIPE E FRENTE NÃO ESTÃO AQUI
 *
 * A frente é \`activity.phase\`, que a aba CRONOGRAMA já mostra. Criar uma
 * segunda dimensão de frente aqui seria o mesmo dado com dois nomes — que foi o
 * defeito da casca de abas. A equipe entra quando a Linha de Balanço precisar
 * balancear ritmo.
 */

type Linha = {
  codigo: string;
  atividade: string;
  unidade: string | null;
  atividadeId: number;
};

export function AbaProducao({ projetoId }: { projetoId: number }) {
  const [data, setData] = useState(() => localIsoDe(new Date()));
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("");
  const [observacao, setObservacao] = useState("");

  const grade = trpc.production.entries.useQuery({ projectId: projetoId });
  const frentes = trpc.production.fronts.useQuery({ projectId: projetoId });
  const equipes = trpc.production.teams.useQuery({ projectId: projetoId });
  const unidades = trpc.production.units.useQuery({ projectId: projetoId });
  const gradeCrono = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const utils = trpc.useUtils();

  const registrar = trpc.production.createEntry.useMutation({
    onSuccess: async () => {
      await utils.production.entries.invalidate({ projectId: projetoId });
      await utils.planning.list.invalidate({ projectId: projetoId });
      setQuantidade("");
      setObservacao("");
    },
  });
  // As linhas são as atividades do cronograma, na ordem do código. Vêm do
  // `grade`, que já aplicou o motor e sabe a ordem.
  const linhas: Linha[] = useMemo(() => {
    return (gradeCrono.data?.activities ?? []).map(l => ({
      codigo: l.wbsCode,
      atividade: l.name,
      unidade: l.unit ?? null,
      atividadeId: l.id,
    }));
  }, [gradeCrono.data]);

  const erro = registrar.isError ? registrar.error.message : null;

  if (linhas.length === 0) {
    return (
      <div className="xl-vazia-folha">
        <h3>Não há atividades para medir</h3>
        <p className="xl-vazia-falta">
          A produção é medida por atividade, e a aba CRONOGRAMA está vazia. Vá até
          lá e traga as folhas da EAP — cada folha vira uma linha que aceita
          quantidade.
        </p>
      </div>
    );
  }

  const lancamentos = grade.data ?? [];
  const datas = Array.from(new Set(lancamentos.map(l => new Date(l.productionDate).toISOString().slice(0, 10)))).sort();
  const grade_: Record<string, Record<string, string>> = {};
  const porAtividade: Record<string, string> = {};
  for (const l of lancamentos) {
    const dia = new Date(l.productionDate).toISOString().slice(0, 10);
    grade_[dia] ??= {};
    grade_[dia][String(l.activityId)] = String((Number(grade_[dia][String(l.activityId)] ?? 0) + Number(l.quantity)).toFixed(3));
    porAtividade[String(l.activityId)] = String((Number(porAtividade[String(l.activityId)] ?? 0) + Number(l.quantity)).toFixed(3));
  }
  const totalGeral = lancamentos.reduce((sum, l) => sum + Number(l.quantity), 0).toFixed(3);

  const atividadesComQuantidade = linhas.filter(l => {
    const totalPlanejado = gradeCrono.data?.activities?.find(a => a.id === l.atividadeId)?.plannedQuantity;
    return totalPlanejado && Number(totalPlanejado) > 0;
  });
  const avancoMedio = atividadesComQuantidade.length > 0
    ? atividadesComQuantidade.reduce((sum, l) => {
        const realizado = Number(porAtividade[String(l.atividadeId)] ?? 0);
        const planejado = Number(gradeCrono.data?.activities?.find(a => a.id === l.atividadeId)?.plannedQuantity ?? 0);
        return sum + (realizado / planejado) * 100;
      }, 0) / atividadesComQuantidade.length
    : 0;

  return (
    <div className="xl-painel">
      {erro && (
        <div className="xl-aviso-erro" role="alert">
          {erro}
        </div>
      )}

      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">CONTROLE DE PRODUÇÃO</span>
          <h2>{linhas.length} atividades · {datas.length} {datas.length === 1 ? "dia lançado" : "dias lançados"}</h2>
          <p>Avanço médio: <strong>{avancoMedio.toFixed(1)}%</strong> · Total geral: <strong>{totalGeral}</strong></p>
        </div>
      </div>

      <div className="xl-cartoes">
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Atividades</span>
          <strong className="xl-cartao-valor">{linhas.length}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Dias lançados</span>
          <strong className="xl-cartao-valor">{datas.length}</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Avanço médio</span>
          <strong className="xl-cartao-valor">{avancoMedio.toFixed(1)}%</strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Lançamentos</span>
          <strong className="xl-cartao-valor">{lancamentos.length}</strong>
        </div>
      </div>

      <p className="xl-nota-folha">
        <strong>% Real = Executado ÷ Quantidade.</strong> A soma do que foi
        lançado por atividade é o que aparece na coluna L do CRONOGRAMA. Linha
        em branco é dia sem produção — e isso é informação, não falta.
      </p>

      <div className="xl-tabela-container">
        <table className="xl-tabela">
          <thead>
            <tr>
              <th className="xl-tabela-th" scope="col">Data</th>
              {linhas.map(l => (
                <th
                  key={l.codigo}
                  className="xl-tabela-th xl-tabela-th-atividade"
                  scope="col"
                  title={`${l.atividade}${l.unidade ? ` (${l.unidade})` : ""}`}
                >
                  <span className="xl-tabela-codigo">{l.codigo}</span>
                  <span className="xl-tabela-nome">{l.atividade}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datas.length === 0 ? (
              <tr>
                <td className="xl-vazia" colSpan={linhas.length + 1}>
                  <strong>Nenhum lançamento ainda</strong>
                  <span>
                    Registre a primeira produção no formulário abaixo. O que não é
                    lançado aparece como 0% no CRONOGRAMA.
                  </span>
                </td>
              </tr>
            ) : (
              datas.map(dia => (
                <tr key={dia}>
                  <th className="xl-tabela-data" scope="row">
                    {new Date(dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </th>
                  {linhas.map(l => {
                    const v = grade_[dia]?.[String(l.atividadeId)];
                    const planejado = Number(gradeCrono.data?.activities?.find(a => a.id === l.atividadeId)?.plannedQuantity ?? 0);
                    const realizado = v ? Number(v) : 0;
                    const pct = planejado > 0 ? (realizado / planejado) * 100 : 0;
                    return (
                      <td
                        key={l.codigo}
                        className={`xl-tabela-celula${v ? " xl-tabela-celula-valor" : ""}`}
                      >
                        {v ?? ""}
                        {v && planejado > 0 && (
                          <span className="xl-tabela-pct">({pct.toFixed(0)}%)</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
            <tr className="xl-tabela-total">
              <th scope="row">TOTAL</th>
              {linhas.map(l => {
                const v = porAtividade[String(l.atividadeId)];
                const planejado = Number(gradeCrono.data?.activities?.find(a => a.id === l.atividadeId)?.plannedQuantity ?? 0);
                const realizado = v ? Number(v) : 0;
                const pct = planejado > 0 ? (realizado / planejado) * 100 : 0;
                return (
                  <td key={l.codigo} className="xl-tabela-celula xl-tabela-total-celula">
                    <strong>{v ?? "—"}</strong>
                    {v && planejado > 0 && (
                      <span className="xl-tabela-pct xl-tabela-pct-total">({pct.toFixed(0)}%)</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="prod-form">
        <h3>Registrar produção</h3>
        <div className="prod-form-linha">
          <label>
            Data
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
            />
          </label>
          <label className="prod-form-atividade">
            Atividade
            <select
              value={selecionada ?? ""}
              onChange={e => {
                const id = Number(e.target.value) || null;
                setSelecionada(id);
                const l = linhas.find(x => x.atividadeId === id);
                setUnidade(l?.unidade ?? "");
              }}
            >
              <option value="">Escolha…</option>
              {linhas.map(l => (
                <option key={l.codigo} value={l.atividadeId}>
                  {l.codigo} — {l.atividade}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </label>
          <label>
            Unid
            <input
              value={unidade}
              onChange={e => setUnidade(e.target.value)}
              placeholder="un"
            />
          </label>
        </div>
        <div className="prod-form-linha">
          <label className="prod-form-obs">
            Observação
            <input
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="opcional"
            />
          </label>
          <button
            type="button"
            className="eap-btn"
            disabled={!selecionada || registrar.isPending || !quantidade.trim() || !frentes.data?.length || !equipes.data?.length || !unidades.data?.length}
            onClick={() => {
              if (!selecionada) return;
              const frontId = frentes.data?.[0]?.id;
              const teamId = equipes.data?.[0]?.id;
              const unitId = unidades.data?.find(u => u.name === (unidade || ""))?.id ?? unidades.data?.[0]?.id;
              if (!frontId || !teamId || !unitId) return;
              registrar.mutate({
                projectId: projetoId,
                frontId,
                teamId,
                unitId,
                activityId: selecionada,
                productionDate: data,
                quantity: Number(quantidade),
                measurementUnit: unidade || "un",
                notes: observacao.trim() || undefined,
                status: "confirmada",
              });
            }}
          >
            {registrar.isPending ? "Registrando…" : "Registrar"}
          </button>
        </div>
        <p className="prod-form-nota">
          O lançamento entra como <strong>confirmado</strong> e já conta no{" "}
          <code>% Real</code>. Para corrigir um lançamento errado, apague o dia na
          grade abaixo e registre de novo — editar o valor deixaria o histórico
          mentindo.
        </p>
      </div>
    </div>
  );
}
