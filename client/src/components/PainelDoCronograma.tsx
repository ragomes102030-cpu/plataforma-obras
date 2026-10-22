import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { AgregadoDoCronograma, LinhaDoCronograma } from "@shared/cronograma-colunas";
import { diasEntre, montarResumo } from "@shared/painel-obra";
import { calcularPesosDaCurva } from "@/lib/curva-s-pesos";
import { EstadoCarregando } from "@/components/EstadoCarregando";

/**
 * Painel da obra.
 *
 * Regra que vale para todo o painel: número sem régua é ruído. Avanço físico é
 * ponderado pela quantidade; valor é ponderado pelo orçamento; contagem é por
 * atividade. Cada um aparece com o nome da sua régua e com o desvio assinado.
 */

type Props = {
  projetoId: number;
  agregado?: AgregadoDoCronograma | null;
  linhas?: LinhaDoCronograma[];
  carregandoGrade?: boolean;
  nomeObra?: string;
};

const FORMATO_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function brl(valor: number): string {
  if (valor >= 1_000_000) {
    const mi = valor / 1_000_000;
    return `R$ ${mi.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  return FORMATO_BRL.format(valor);
}

function pct(valor: number): string {
  return `${(valor * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function pontos(valor: number): string {
  const sinal = valor > 0 ? "+" : valor < 0 ? "−" : "";
  return `${sinal}${Math.abs(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} p.p.`;
}

function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * A data chega como `Date` em alguns endpoints e como `AAAA-MM-DD` em outros.
 * `String(date).slice(0, 10)` devolvia "Wed Sep 30" e a tabela imprimia
 * "30/ep/Wed".
 */
function isoDoValor(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const texto = String(valor ?? "");
  const achado = /^(\d{4}-\d{2}-\d{2})/.exec(texto);
  return achado ? achado[1] : "";
}

function dataLonga(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function hojeIso(): string {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function abrirAba(aba: string) {
  window.dispatchEvent(new CustomEvent("abrir-aba", { detail: { aba } }));
}

export function PainelDoCronograma({
  projetoId,
  agregado,
  linhas,
  carregandoGrade,
  nomeObra,
}: Props) {
  const hoje = hojeIso();

  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );
  const orcamento = trpc.budgets.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );
  const producao = trpc.production.entries.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );
  const lookahead = trpc.planning.lookahead.useQuery(
    { projectId: projetoId, hoje },
    { enabled: projetoId > 0, retry: false }
  );
  const baseline = trpc.planning.compararComBaseline.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false }
  );

  const dados = useMemo(() => {
    const atividades = (plano.data?.activities ?? []).map((a) => ({
      id: a.id,
      wbsNodeId: a.wbsNodeId,
      wbsCode: a.wbsCode,
    }));
    const custo = calcularPesosDaCurva(atividades, orcamento.data?.items ?? []);

    const pctPorCodigo = new Map<string, number>();
    for (const linha of linhas ?? []) {
      if (linha.codigo) pctPorCodigo.set(linha.codigo, linha.pctReal);
    }

    let executado = 0;
    for (const atividade of atividades) {
      const valorDaAtividade = custo.custoPorAtividade.get(atividade.id) ?? 0;
      const avanco = pctPorCodigo.get(atividade.wbsCode ?? "") ?? 0;
      executado += valorDaAtividade * avanco;
    }

    const total = Number(orcamento.data?.total ?? 0);
    const distribuido = Math.max(0, total - custo.valorSemDestino);

    const lancamentos = producao.data ?? [];
    const confirmados = lancamentos.filter((l) => l.status === "confirmada");
    const foraDoPlano = confirmados.filter((l) => l.vinculo && l.vinculo !== "atual").length;

    const linhasAvaliadas = linhas ?? [];
    const maiorAtraso = linhasAvaliadas
      .filter((l) => l.status === "Atrasado" && l.fim)
      .map((l) => diasEntre(l.fim, hoje) ?? 0)
      .filter((d) => d > 0)
      .sort((a, b) => b - a)[0];

    const resumo = montarResumo({
      hoje,
      inicio: agregado?.inicio ?? null,
      fim: agregado?.fim ?? null,
      fisico: {
        real: agregado?.avancoFisico ?? 0,
        planejado: agregado?.avancoPlanejado ?? 0,
      },
      status: {
        total: agregado?.totalAtividades ?? 0,
        concluidas: agregado?.contagemPorStatus.Concluido ?? 0,
        emAndamento: agregado?.contagemPorStatus["Em andamento"] ?? 0,
        atrasadas: agregado?.contagemPorStatus.Atrasado ?? 0,
        naoIniciadas: agregado?.contagemPorStatus["Nao iniciado"] ?? 0,
      },
      valor: { total, distribuido, executado },
      alertas: {
        atrasadas: agregado?.contagemPorStatus.Atrasado ?? 0,
        maiorAtrasoDias: maiorAtraso ?? null,
        semQuantidade: agregado?.linhasSemQuantidade ?? 0,
        foraDoPlano,
        bloqueadas: lookahead.data?.totalBloqueadas ?? 0,
        valorSemAtividade: custo.valorSemDestino,
        ppc: lookahead.data?.ppcCorrente ?? null,
        atrasoBaselineDias: baseline.data?.resumo?.atrasoNoFim ?? null,
      },
    });

    return {
      resumo,
      valorSemDestino: custo.valorSemDestino,
      ultimos: [...lancamentos]
        .sort((a, b) => isoDoValor(b.productionDate).localeCompare(isoDoValor(a.productionDate)))
        .slice(0, 5),
      semana: lookahead.data?.semanas?.find((s) => s.situacao === "corrente") ?? lookahead.data?.semanas?.[0],
    };
  }, [agregado, baseline.data, hoje, linhas, lookahead.data, orcamento.data, plano.data, producao.data]);

  const aindaCarregando = carregandoGrade || !agregado;

  if (aindaCarregando) {
    return (
      <div className="pd">
        <div className="pd-cabecalho">
          <div>
            <p className="pd-sobretitulo">Painel da obra</p>
            <h2 className="pd-titulo">{nomeObra ?? "Carregando obra…"}</h2>
            <p className="pd-sub">Lendo cronograma e produção…</p>
          </div>
        </div>
        <EstadoCarregando
          rotulo="Carregando o painel da obra…"
          detalhe="Avanço, prazo, valor e compromissos aparecem quando o cronograma chegar."
          linhas={5}
        />
      </div>
    );
  }

  if (agregado.totalAtividades === 0) {
    return (
      <div className="pd">
        <div className="pd-cabecalho">
          <div>
            <p className="pd-sobretitulo">Painel da obra</p>
            <h2 className="pd-titulo">{nomeObra ?? "Obra"}</h2>
            <p className="pd-sub">Ainda não há atividades planejadas.</p>
          </div>
        </div>
        <div className="pd-vazio">
          <strong>O painel nasce da EAP.</strong>
          <p>
            Monte a estrutura analítica e lance as atividades com duração e quantidade. O painel
            mostra avanço, prazo, valor, compromissos e alertas em cima desse plano.
          </p>
          <div className="pd-vazio-acoes">
            <button type="button" className="pd-botao" onClick={() => abrirAba("eap")}>
              Abrir a EAP
            </button>
            <button type="button" className="pd-botao pd-botao-fraco" onClick={() => abrirAba("atividades")}>
              Abrir atividades
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { resumo, valorSemDestino, ultimos, semana } = dados;
  const { prazo, fisico, valor, status, selo, alertas } = resumo;
  const segmentos = [
    { chave: "concluidas", rotulo: "Concluídas", valor: status.concluidas, classe: "ok" },
    { chave: "andamento", rotulo: "Em andamento", valor: status.emAndamento, classe: "andamento" },
    { chave: "atrasadas", rotulo: "Atrasadas", valor: status.atrasadas, classe: "atraso" },
    { chave: "naoIniciadas", rotulo: "Não iniciadas", valor: status.naoIniciadas, classe: "neutro" },
  ].filter((s) => s.valor > 0);

  // `pronta` significa "sem restrição aberta", não "concluída". A semana lista
  // tudo o que está em aberto, com as bloqueadas marcadas.
  const abertasNaSemana = (semana?.atividades ?? [])
    .filter((a) => (a.percentualExecutado ?? 0) < 1)
    .sort((a, b) => String(a.startIso).localeCompare(String(b.startIso)));
  const atividadesDaSemana = abertasNaSemana.slice(0, 7);
  const restantesDaSemana = abertasNaSemana.length - atividadesDaSemana.length;

  return (
    <div className="pd">
      <header className="pd-cabecalho">
        <div>
          <p className="pd-sobretitulo">Painel da obra</p>
          <h2 className="pd-titulo">{nomeObra ?? "Obra"}</h2>
          <p className="pd-sub">
            {dataLonga(hoje)} · {status.total} atividades
            {agregado.prazoDias ? ` · plano de ${agregado.prazoDias} dias corridos` : ""}
          </p>
        </div>
        <span className={`pd-selo pd-selo-${selo.tipo}`}>{selo.rotulo}</span>
      </header>

      <section className="pd-kpis" aria-label="Indicadores principais">
        <article className="pd-kpi">
          <p className="pd-rotulo">
            Avanço físico <span className="pd-regua">ponderado por quantidade</span>
          </p>
          <p className={`pd-numero pd-numero-${fisico.rotulo.replace(/\s/g, "-")}`}>{pct(fisico.real)}</p>
          <div className="pd-barra" role="img" aria-label={`Avanço ${pct(fisico.real)} contra planejado ${pct(fisico.planejado)}`}>
            <span className="pd-barra-real" style={{ width: `${Math.min(100, fisico.real * 100)}%` }} />
            <span className="pd-barra-alvo" style={{ left: `${Math.min(100, fisico.planejado * 100)}%` }} />
          </div>
          <p className="pd-legenda">
            Planejado até hoje <strong>{pct(fisico.planejado)}</strong> · desvio{" "}
            <strong className={fisico.pontos < 0 ? "pd-negativo" : "pd-positivo"}>{pontos(fisico.pontos)}</strong>
          </p>
        </article>

        <article className="pd-kpi">
          <p className="pd-rotulo">
            Prazo <span className="pd-regua">dias de calendário</span>
          </p>
          <p className={`pd-numero ${prazo.situacao === "atrasada" ? "pd-numero-atrasada" : ""}`}>
            {prazo.rotulo}
          </p>
          <div className="pd-linha-tempo" role="img" aria-label={`Prazo decorrido ${pct(prazo.fracaoDecorrida)}`}>
            <span className="pd-linha-tempo-cheia" style={{ width: `${prazo.fracaoDecorrida * 100}%` }} />
            <span className="pd-linha-tempo-hoje" style={{ left: `${prazo.fracaoDecorrida * 100}%` }} />
          </div>
          <p className="pd-legenda">
            {dataBr(prazo.inicio)} → {dataBr(prazo.fim)} · {pct(prazo.fracaoDecorrida)} do prazo
          </p>
        </article>

        <article className="pd-kpi">
          <p className="pd-rotulo">
            Valor <span className="pd-regua">ponderado pelo orçamento</span>
          </p>
          <p className={`pd-numero ${valor.pctExecutado === null ? "pd-numero-fraco" : ""}`}>
            {orcamento.isPending
              ? "Lendo orçamento…"
              : valor.pctExecutado === null
                ? "Sem orçamento"
                : pct(valor.pctExecutado)}
          </p>
          <div className="pd-barra">
            <span className="pd-barra-real pd-barra-valor" style={{ width: `${(valor.pctExecutado ?? 0) * 100}%` }} />
            <span className="pd-barra-orcamento" style={{ width: `${valor.pctDistribuido * 100}%` }} />
          </div>
          <p className="pd-legenda">
            {orcamento.isPending ? (
              "Aguardando o orçamento para ponderar o valor…"
            ) : valor.total > 0 ? (
              <>
                {brl(valor.executado)} de {brl(valor.total)} ·{" "}
                {valorSemDestino > 0 ? (
                  <button type="button" className="pd-link" onClick={() => abrirAba("financeiro")}>
                    {brl(valorSemDestino)} sem atividade
                  </button>
                ) : (
                  "todo o valor ligado ao cronograma"
                )}
              </>
            ) : (
              <button type="button" className="pd-link" onClick={() => abrirAba("financeiro")}>
                Importar orçamento
              </button>
            )}
          </p>
        </article>

        <article className="pd-kpi">
          <p className="pd-rotulo">
            Compromissos <span className="pd-regua">semana corrente</span>
          </p>
          <p
            className={`pd-numero ${
              lookahead.data?.ppcCorrente == null
                ? "pd-numero-fraco"
                : lookahead.data.ppcCorrente < 70
                  ? "pd-numero-atencao"
                  : ""
            }`}
          >
            {lookahead.data?.ppcCorrente != null ? `${Math.round(lookahead.data.ppcCorrente)}%` : "Sem registro"}
          </p>
          <p className="pd-legenda pd-legenda-alta">
            {lookahead.data?.ppcCorrente != null ? "PPC da semana" : "Nenhum compromisso assumido"}
            <br />
            <strong>{lookahead.data?.totalBloqueadas ?? 0}</strong> bloqueadas ·{" "}
            <strong>{lookahead.data?.compromissosPendentes ?? 0}</strong> pendentes
          </p>
          <button type="button" className="pd-link" onClick={() => abrirAba("producao")}>
            Ver compromissos
          </button>
        </article>
      </section>

      <section className="pd-status" aria-label="Situação das atividades">
        <div className="pd-status-topo">
          <p className="pd-rotulo">
            Situação das atividades <span className="pd-regua">contagem simples, não ponderada</span>
          </p>
          <p className="pd-status-total">{status.total} atividades</p>
        </div>
        <div className="pd-status-barra">
          {segmentos.map((s) => (
            <span
              key={s.chave}
              className={`pd-status-segmento pd-status-${s.classe}`}
              style={{ width: `${(s.valor / Math.max(1, status.total)) * 100}%` }}
              title={`${s.rotulo}: ${s.valor}`}
            />
          ))}
        </div>
        <div className="pd-status-legenda">
          {segmentos.map((s) => (
            <span key={s.chave} className="pd-status-item">
              <i className={`pd-ponto pd-status-${s.classe}`} />
              {s.rotulo} <strong>{s.valor}</strong>
              <span className="pd-status-fatia">
                {Math.round((s.valor / Math.max(1, status.total)) * 100)}%
              </span>
            </span>
          ))}
        </div>
      </section>

      <div className="pd-duas-colunas">
        <section className="pd-bloco" aria-label="Precisa de decisão">
          <div className="pd-bloco-topo">
            <h3 className="pd-bloco-titulo">Precisa de decisão</h3>
            <span className="pd-contador">{alertas.length}</span>
          </div>
          {alertas.length === 0 ? (
            <p className="pd-tranquilo">
              Nada crítico: prazo, avanço, valor e compromissos dentro do esperado.
            </p>
          ) : (
            <ul className="pd-alertas">
              {alertas.map((a) => (
                <li key={a.id} className={`pd-alerta pd-alerta-${a.nivel}`}>
                  <span className="pd-alerta-marca" aria-hidden />
                  <div className="pd-alerta-texto">
                    <p className="pd-alerta-titulo">{a.titulo}</p>
                    <p className="pd-alerta-detalhe">{a.detalhe}</p>
                  </div>
                  {a.aba && (
                    <button type="button" className="pd-alerta-acao" onClick={() => abrirAba(a.aba!)}>
                      {a.acao ?? "Abrir"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pd-bloco" aria-label="Próximos sete dias">
          <div className="pd-bloco-topo">
            <h3 className="pd-bloco-titulo">Próximos 7 dias</h3>
            {semana && (
              <span className="pd-bloco-nota">
                semana {semana.numero} · {dataBr(semana.inicio)} a {dataBr(semana.fim)}
              </span>
            )}
          </div>
          {!lookahead.data ? (
            <p className="pd-tranquilo">Carregando compromissos…</p>
          ) : atividadesDaSemana.length === 0 ? (
            <p className="pd-tranquilo">Nenhuma atividade em aberto para esta semana.</p>
          ) : (
            <>
              <ul className="pd-semana">
                {atividadesDaSemana.map((a) => (
                  <li key={`${a.id}-${a.startIso}`} className="pd-semana-item">
                    <span className="pd-semana-codigo">{a.wbsCode || "—"}</span>
                    <div className="pd-semana-texto">
                      <p className="pd-semana-nome">{a.name}</p>
                      <p className="pd-semana-meta">
                        {dataBr(a.startIso)} → {dataBr(a.finishIso)}
                        {a.openConstraints > 0 ? ` · ${a.openConstraints} restrição(ões)` : ""}
                      </p>
                    </div>
                    {a.openConstraints > 0 && (
                      <span className="pd-etiqueta pd-etiqueta-bloqueio">a liberar</span>
                    )}
                  </li>
                ))}
              </ul>
              {restantesDaSemana > 0 && (
                <button type="button" className="pd-link" onClick={() => abrirAba("producao")}>
                  + {restantesDaSemana} atividade(s) na semana
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <section className="pd-bloco" aria-label="Últimos lançamentos">
        <div className="pd-bloco-topo">
          <h3 className="pd-bloco-titulo">Últimos lançamentos</h3>
          <button type="button" className="pd-link" onClick={() => abrirAba("producao")}>
            Abrir produção
          </button>
        </div>
        {ultimos.length === 0 ? (
          <p className="pd-tranquilo">Nenhum lançamento registrado ainda.</p>
        ) : (
          <table className="pd-tabela">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Atividade</th>
                <th scope="col" className="pd-num">
                  Quantidade
                </th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((l) => (
                <tr key={l.id}>
                  <td>{dataBr(isoDoValor(l.productionDate))}</td>
                  <td>
                    <span className="pd-tabela-codigo">{l.codigoEap ?? "—"}</span>
                    {l.atividadeNome ?? "atividade removida do plano"}
                  </td>
                  <td className="pd-num">
                    {Number(l.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    <span className="pd-unidade">{l.unidade ?? ""}</span>
                  </td>
                  <td>
                    <span
                      className={`pd-etiqueta ${
                        l.status === "confirmada"
                          ? l.vinculo && l.vinculo !== "atual"
                            ? "pd-etiqueta-bloqueio"
                            : "pd-etiqueta-ok"
                          : "pd-etiqueta-neutra"
                      }`}
                    >
                      {l.status === "confirmada"
                        ? l.vinculo && l.vinculo !== "atual"
                          ? "fora do plano"
                          : "confirmada"
                        : "rascunho"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="pd-nota">
        <strong>Como este painel calcula</strong>
        <p>
          Avanço físico pondera pela quantidade planejada de cada atividade. Valor pondera pelo
          orçamento e só conta o que está ligado a uma atividade. Prazo conta dias de calendário do
          primeiro início ao último fim. A contagem de atividades é simples e serve para achar o
          serviço, não para medir avanço.
        </p>
      </footer>
    </div>
  );
}

export default PainelDoCronograma;
