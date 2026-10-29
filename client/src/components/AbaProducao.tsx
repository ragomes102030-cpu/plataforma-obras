import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { localIsoDe } from "@/lib/datas";
import { PainelLookahead } from "./PainelLookahead";
import { ListaLancamentosProducao } from "./ListaLancamentosProducao";
import { EstadoCarregando } from "./EstadoCarregando";
import { selectConfirmedProductionEntries } from "@shared/production-entries";

/**
 * A aba PRODUÇÃO: a fonte do `% Real`.
 *
 * POR QUE ESTA ABA É A FONSA
 *
 * `% Real` soma apenas lançamentos confirmados; rascunhos ficam no histórico,
 * mas ainda não representam execução medida.
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
 * A frente é \`activity.phase\`, que a aba ATIVIDADES já mostra. Criar uma
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

/**
 * Data do dia na grade, lida como texto.
 *
 * `new Date("2026-10-03").toLocaleDateString()` roda em UTC-3 e devolve 02/10:
 * a coluna inteira andava um dia para trás.
 */
function diaBr(dia: string): string {
  const achado = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dia));
  if (!achado) return String(dia);
  return `${achado[3]}/${achado[2]}/${achado[1]}`;
}

export function AbaProducao({ projetoId }: { projetoId: number }) {
  const [data, setData] = useState(() => localIsoDe(new Date()));
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmarExcedente, setConfirmarExcedente] = useState(false);

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
  const todosLancamentos = grade.data ?? [];
  const lancamentos = useMemo(
    () => selectConfirmedProductionEntries(todosLancamentos),
    [todosLancamentos]
  );

  // Carregando ≠ "não há atividades para medir". Esta aba dizia isso com 10-30 s
  // de espera pela frente, numa obra que tem 53 atividades.
  const carregando =
    projetoId > 0 &&
    (gradeCrono.isPending || grade.isPending || frentes.isPending || equipes.isPending || unidades.isPending);

  if (carregando) {
    return (
      <div className="xl-painel">
        <EstadoCarregando
          rotulo="Carregando o controle de produção…"
          detalhe="Atividades, apontamentos, frentes de serviço e equipes vêm de consultas separadas."
          linhas={5}
        />
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="xl-vazia-folha">
        <h3>Não há atividades para medir</h3>
        <p className="xl-vazia-falta">
          A produção é medida por atividade, e ainda não há atividades na obra. Abra
          a aba ATIVIDADES e traga as folhas da EAP — cada folha vira uma linha que
          aceita quantidade.
        </p>
      </div>
    );
  }

  const datas = Array.from(new Set(lancamentos.map(l => new Date(l.productionDate).toISOString().slice(0, 10)))).sort();
  // A chave é o CÓDIGO da EAP, não o id da linha: lançamento antigo aponta para a
  // atividade de uma versão anterior do plano e nunca casava com a coluna de hoje
  // — a grade mostrava tudo em branco e o avanço médio zerado.
  const chaveDoLancamento = (l: { activityId: number; codigoEap?: string | null }) =>
    l.codigoEap ?? String(l.activityId);
  const grade_: Record<string, Record<string, string>> = {};
  const porAtividade: Record<string, string> = {};
  for (const l of lancamentos) {
    const dia = new Date(l.productionDate).toISOString().slice(0, 10);
    const chave = chaveDoLancamento(l);
    grade_[dia] ??= {};
    grade_[dia][chave] = String((Number(grade_[dia][chave] ?? 0) + Number(l.quantity)).toFixed(3));
    porAtividade[chave] = String((Number(porAtividade[chave] ?? 0) + Number(l.quantity)).toFixed(3));
  }
  // Não existe "total geral" de produção: somar m³ com m² e kg não significa
  // nada. O avanço é sempre por atividade, contra a própria quantidade.

  const atividadesComQuantidade = linhas.filter(l => {
    const totalPlanejado = gradeCrono.data?.activities?.find(a => a.id === l.atividadeId)?.plannedQuantity;
    return totalPlanejado && Number(totalPlanejado) > 0;
  });
  const avancoMedio = atividadesComQuantidade.length > 0
    ? atividadesComQuantidade.reduce((sum, l) => {
        const realizado = Number(porAtividade[l.codigo] ?? 0);
        const planejado = Number(gradeCrono.data?.activities?.find(a => a.id === l.atividadeId)?.plannedQuantity ?? 0);
        return sum + (realizado / planejado) * 100;
      }, 0) / atividadesComQuantidade.length
    : 0;

  // Aviso suave (não bloqueio): se o lançamento proposto levar a soma executada
  // acima da quantidade planejada da atividade, avisa o usuário antes de confirmar.
  const atividadeSelecionada = selecionada
    ? gradeCrono.data?.activities?.find(a => a.id === selecionada)
    : null;
  const planejadoSelecionado = atividadeSelecionada
    ? Number(atividadeSelecionada.plannedQuantity ?? 0)
    : 0;
  const realizadoSelecionado = atividadeSelecionada
    ? Number(porAtividade[atividadeSelecionada.wbsCode] ?? 0)
    : 0;
  const quantidadeNova = Number(quantidade) || 0;
  const totalComNova = realizadoSelecionado + quantidadeNova;

  const excedeOrçamento =
    planejadoSelecionado > 0 &&
    quantidadeNova > 0 &&
    totalComNova > planejadoSelecionado;

  return (
    <div className="xl-painel">
      {erro && (
        <div className="xl-aviso-erro" role="alert">
          {erro}
        </div>
      )}
      {excedeOrçamento && (
        <div className="xl-aviso-erro" role="alert">
          A quantidade informada ({quantidadeNova.toFixed(3)}) somada ao já
          lançado ({realizadoSelecionado.toFixed(3)}) excede a quantidade
          planejada da atividade ({planejadoSelecionado.toFixed(3)}).
          Se a medição real estiver correta, confirme para registrá-la acima do
          previsto.
          <label className="prod-confirma-excedente">
            <input type="checkbox" checked={confirmarExcedente}
              onChange={e=>setConfirmarExcedente(e.target.checked)} />
            Confirmo o excesso em relação ao quantitativo planejado.
          </label>
        </div>
      )}

      <div className="xl-painel-intro">
        <div>
          <span className="xl-painel-kicker">CONTROLE DE PRODUÇÃO</span>
          <h2>{linhas.length} atividades · {datas.length} {datas.length === 1 ? "dia lançado" : "dias lançados"}</h2>
          <p>
            Avanço médio <strong>{avancoMedio.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong>{" "}
            <span className="xl-regua">média simples entre as atividades com quantidade</span>
          </p>
        </div>
      </div>

      {/* O lookahead vem antes da grade diária de propósito: a reunião de
          segunda decide o que vai acontecer, e a grade conta o que aconteceu.
          Invertido, o painel vira relatório de fim de semana. */}
      <PainelLookahead projetoId={projetoId} />

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
          <strong className="xl-cartao-valor">
            {avancoMedio.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </strong>
        </div>
        <div className="xl-cartao">
          <span className="xl-cartao-titulo">Lançamentos</span>
          <strong className="xl-cartao-valor">{lancamentos.length}</strong>
        </div>
      </div>

      <p className="xl-nota-folha">
        <strong>% Real = Executado ÷ Quantidade.</strong> O que é lançado por
        atividade aparece no painel da obra e na Curva S. Linha em branco é dia
        sem produção — e isso é informação, não falta.
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
                    lançado aparece como 0% no painel e na Curva S.
                  </span>
                </td>
              </tr>
            ) : (
              datas.map(dia => (
                <tr key={dia}>
                  <th className="xl-tabela-data" scope="row">
                    {diaBr(dia)}
                  </th>
                  {linhas.map(l => {
                    const v = grade_[dia]?.[l.codigo];
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
                const v = porAtividade[l.codigo];
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
                setConfirmarExcedente(false);
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
              onChange={e => {setQuantidade(e.target.value);setConfirmarExcedente(false);}}
              placeholder="0"
              inputMode="decimal"
            />
          </label>
          <label>
            Unid
            <input
              value={unidade}
              onChange={e => setUnidade(e.target.value)}
              readOnly={Boolean(atividadeSelecionada?.unit)}
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
            disabled={
              !selecionada ||
              registrar.isPending ||
              !quantidade.trim() ||
              (excedeOrçamento && !confirmarExcedente)
            }
            onClick={() => {
              if (!selecionada) return;
              // Frente/equipe/unidade são opcionais (o schema já as aceita nulas).
              // Antes, obra sem organograma cadastrado tinha o botão travado para
              // sempre, sem explicar o motivo.
              const frontId = frentes.data?.[0]?.id;
              const teamId = equipes.data?.[0]?.id;
              const unitId = unidades.data?.find(u => u.name === (unidade || ""))?.id ?? unidades.data?.[0]?.id;
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
          <code>% Real</code>. Para corrigir, use a lista de lançamentos abaixo:
          clique em <strong>Desfazer</strong> (a medição volta para rascunho, o que
          foi enviado continua no histórico), depois <strong>Editar</strong> e
          confirme de novo.
        </p>
      </div>
      <ListaLancamentosProducao projetoId={projetoId} lancamentos={todosLancamentos} />
    </div>
  );
}
