import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { agregadoDoCronograma, type AgregadoDoCronograma, type LinhaDoCronograma } from "@shared/cronograma-colunas";
import { diasEntre, montarResumo, type AlertaDoPainel } from "@shared/painel-obra";
import { calcularPesosDaCurva } from "@/lib/curva-s-pesos";
import { classificarEstadoAtividadesDashboard, excluirAtividadesDeDemonstracao } from "@/lib/dashboard-work-scope";
import { avaliarPrazoDashboard } from "@/lib/prazo-dashboard";
import { avaliarIntegridadeDashboard } from "@/lib/dashboard-integridade";
import { EstadoCarregando } from "@/components/EstadoCarregando";
import { ControlTowerDashboard } from "./ControlTowerDashboard";
import { selecionarSemanaDashboard } from "@/lib/dashboard-lookahead";

/**
 * Painel da obra.
 *
 * Regra que vale para todo o painel: avanço físico e valor agregado são eixos
 * diferentes. O orçamento pondera EVM; nunca substitui pesos físicos aprovados.
 */

type Props = {
  projetoId: number;
  agregado?: AgregadoDoCronograma | null;
  linhas?: LinhaDoCronograma[];
  carregandoGrade?: boolean;
  nomeObra?: string;
  hojeReferencia?: string;
  codigosExemplo?: ReadonlySet<string>;
  erroGrade?: boolean;
  tentarNovamenteGrade?: () => void;
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
  hojeReferencia,
  codigosExemplo = new Set(),
  erroGrade = false,
  tentarNovamenteGrade,
}: Props) {
  const hoje = hojeReferencia ?? hojeIso();

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
  // A coerência do orçamento existia só dentro do orçamento, atrás de um clique.
  // Na AURORA ela acusa R$ 2,34 mi (45% do orçamento) em itens com composição
  // incompatível — e o painel anunciava "29,1% planejado" sem dizer que o
  // orçamento está sob suspeita. Aqui ela vira decisão, não detalhe.
  const coerencia = trpc.planning.validateEngineeringCoherence.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0, retry: false, staleTime: 5 * 60_000 }
  );

  const atividades = (plano.data?.activities ?? []).map((a) => ({
    id: a.id,
    wbsNodeId: a.wbsNodeId,
    wbsCode: a.wbsCode,
    budgetItemId: a.budgetItemId ?? null,
    cpmCalculatedAt: a.cpmCalculatedAt ?? null,
    updatedAt: a.updatedAt ?? null,
  })).filter(a => !codigosExemplo.has(a.wbsCode ?? ""));
  const linhasDaObra = useMemo(
    () => excluirAtividadesDeDemonstracao(linhas ?? [], codigosExemplo),
    [codigosExemplo, linhas],
  );
  const agregadoDaObra = linhas ? agregadoDoCronograma(linhasDaObra) : agregado;
  const estadoAtividades = classificarEstadoAtividadesDashboard({
    carregandoPlano: plano.isPending,
    erroPlano: plano.isError,
    atividadesOperacionais: atividades.length,
    atividadesNaGrade: agregadoDaObra?.totalAtividades ?? 0,
  });

  const dados = useMemo(() => {
    const custo = calcularPesosDaCurva(atividades, orcamento.data?.items ?? []);

    const pctPorAtividade = new Map<number, number>();
    const planejadoPorAtividade = new Map<number, number>();
    for (const linha of linhasDaObra) {
      pctPorAtividade.set(linha.activityId, linha.pctReal);
      planejadoPorAtividade.set(linha.activityId, linha.pctPlanejado);
    }

    let executado = 0;
    let planejadoPorValor = 0;
    let pesoComOrcamento = 0;
    for (const atividade of atividades) {
      const valorDaAtividade = custo.custoPorAtividade.get(atividade.id) ?? 0;
      if (valorDaAtividade <= 0) continue;
      const avanco = pctPorAtividade.get(atividade.id) ?? 0;
      executado += valorDaAtividade * avanco;
      pesoComOrcamento += valorDaAtividade;
      planejadoPorValor += valorDaAtividade * (planejadoPorAtividade.get(atividade.id) ?? 0);
    }

    // Frações 0..1: `pctReal` e `pctPlanejado` já vêm assim da grade.
    const avancoPorValor = {
      real: pesoComOrcamento > 0 ? executado / pesoComOrcamento : 0,
      planejado: pesoComOrcamento > 0 ? planejadoPorValor / pesoComOrcamento : 0,
    };

    const total = Number(orcamento.data?.total ?? 0);
    const distribuido = Math.max(0, total - custo.valorSemDestino);

    const lancamentos = (producao.data ?? []).filter(l =>
      Number(l.exemplo ?? 0) !== 1 &&
      !codigosExemplo.has(l.codigoEap ?? "") &&
      isoDoValor(l.productionDate) <= hoje
    );
    const confirmados = lancamentos.filter((l) => l.status === "confirmada");
    const integridade = avaliarIntegridadeDashboard({
      hoje, atividades, itens: orcamento.data?.items ?? [],
      versaoAtivaAprovada: orcamento.data?.versions?.find(v => v.id === orcamento.data?.activeVersionId)?.status === "aprovado",
      custoPorAtividade: custo.custoPorAtividade, lancamentos,
      pesosFisicosAprovados: agregadoDaObra?.pesosFisicosAprovados === true,
      erroFisico: producao.isError,
      erroFinanceiro: orcamento.isError,
    });
    const foraDoPlano = confirmados.filter((l) => l.vinculo && l.vinculo !== "atual").length;

    const linhasAvaliadas = linhasDaObra;
    const maiorAtraso = linhasAvaliadas
      .filter((l) => l.status === "Atrasado" && l.fim)
      .map((l) => diasEntre(l.fim, hoje) ?? 0)
      .filter((d) => d > 0)
      .sort((a, b) => b - a)[0];

    const resumo = montarResumo({
      hoje,
      inicio: agregadoDaObra?.inicio ?? null,
      fim: agregadoDaObra?.fim ?? null,
      fisico: {
        real: agregadoDaObra?.avancoFisico ?? 0,
        planejado: agregadoDaObra?.avancoPlanejado ?? 0,
      },
      status: {
        total: agregadoDaObra?.totalAtividades ?? 0,
        concluidas: agregadoDaObra?.contagemPorStatus.Concluido ?? 0,
        emAndamento: agregadoDaObra?.contagemPorStatus["Em andamento"] ?? 0,
        atrasadas: agregadoDaObra?.contagemPorStatus.Atrasado ?? 0,
        naoIniciadas: agregadoDaObra?.contagemPorStatus["Nao iniciado"] ?? 0,
      },
      valor: { total, distribuido, executado },
      alertas: {
        atrasadas: agregadoDaObra?.contagemPorStatus.Atrasado ?? 0,
        maiorAtrasoDias: maiorAtraso ?? null,
        semQuantidade: agregadoDaObra?.linhasSemQuantidade ?? 0,
        foraDoPlano,
        bloqueadas: lookahead.data?.totalBloqueadas ?? 0,
        valorSemAtividade: custo.valorSemDestino,
        ppc: lookahead.data?.ppcCorrente ?? null,
        atrasoBaselineDias: baseline.data?.resumo?.atrasoNoFim ?? null,
      },
    });

    return {
      resumo,
      integridade,
      avancoFinanceiro: avancoPorValor,
      valorSemDestino: custo.valorSemDestino,
      ultimos: [...lancamentos]
        .sort((a, b) => isoDoValor(b.productionDate).localeCompare(isoDoValor(a.productionDate)))
        .slice(0, 5),
      semana: selecionarSemanaDashboard(lookahead.data?.semanas ?? []),
    };
  }, [agregadoDaObra, baseline.data, codigosExemplo, hoje, linhasDaObra, lookahead.data, orcamento.data, plano.data, producao.data]);

  const aindaCarregando = carregandoGrade || !agregado || estadoAtividades === "carregando";

  if (erroGrade && !agregado) {
    return (
      <div className="pd">
        <div className="pd-cabecalho">
          <div>
            <p className="pd-sobretitulo">Painel da obra</p>
            <h2 className="pd-titulo">{nomeObra ?? "Obra"}</h2>
            <p className="pd-sub">Não foi possível consultar o cronograma.</p>
          </div>
        </div>
        <div className="pd-vazio" role="alert">
          <strong>Os indicadores não estão disponíveis.</strong>
          <p>O cronograma não respondeu. Tente novamente; nenhum dado foi alterado.</p>
          {tentarNovamenteGrade && <button type="button" className="pd-botao" onClick={tentarNovamenteGrade}>Tentar novamente</button>}
        </div>
      </div>
    );
  }

  if (estadoAtividades === "erro") {
    return (
      <div className="pd">
        <div className="pd-cabecalho">
          <div>
            <p className="pd-sobretitulo">Painel da obra</p>
            <h2 className="pd-titulo">{nomeObra ?? "Obra"}</h2>
            <p className="pd-sub">Não foi possível consultar as atividades do plano.</p>
          </div>
        </div>
        <div className="pd-vazio" role="alert">
          <strong>Os indicadores não estão disponíveis.</strong>
          <p>A consulta do plano falhou. Tente novamente; nenhum dado foi alterado.</p>
          <button type="button" className="pd-botao" onClick={() => void plano.refetch()}>Tentar novamente</button>
        </div>
      </div>
    );
  }

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

  if (estadoAtividades === "sem-atividades") {
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
            Monte a estrutura analítica e detalhe as atividades. Registre uma duração fundamentada
            ou, quando aplicável, estime-a com quantidade e produtividade válida. O painel mostra
            avanço, prazo, valor, compromissos e alertas a partir do plano.
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

  if (estadoAtividades === "sem-grade") {
    return (
      <div className="pd">
        <div className="pd-cabecalho">
          <div>
            <p className="pd-sobretitulo">Painel da obra</p>
            <h2 className="pd-titulo">{nomeObra ?? "Obra"}</h2>
            <p className="pd-sub">Há {atividades.length} atividade(s) no plano, mas nenhuma aparece na grade do cronograma.</p>
          </div>
        </div>
        <div className="pd-vazio" role="alert">
          <strong>O painel ainda não consegue calcular os indicadores.</strong>
          <p>Confira os vínculos das atividades com a EAP, as datas e durações, e se o CPM foi calculado. As atividades continuam no plano; a grade vazia não significa que a obra esteja sem atividades.</p>
          <div className="pd-vazio-acoes">
            <button type="button" className="pd-botao" onClick={() => abrirAba("atividades")}>Conferir atividades</button>
            <button type="button" className="pd-botao pd-botao-fraco" onClick={() => abrirAba("cpm")}>Conferir CPM</button>
          </div>
        </div>
      </div>
    );
  }

  const { resumo, integridade, valorSemDestino, ultimos, semana } = dados;
  const { prazo, fisico, valor, status, selo, alertas } = resumo;
  const prazoConfianca = avaliarPrazoDashboard({
    fim: prazo.fim,
    eapApproved: plano.data?.eapApproved === true,
    atividades,
  });

  // Coerência: só entra quando há item que IMPEDE execução e valor em risco.
  const alertaDeOrcamento: AlertaDoPainel | null = (() => {
    const analise = coerencia.data;
    if (!analise) return null;
    const impedem = (analise.issues ?? []).filter((i) => i.severity === "error");
    const emRisco = Number(analise.resumo?.valorEmRisco ?? 0);
    if (impedem.length === 0 || !(emRisco > 0)) return null;
    const participacao = valor.total > 0 ? emRisco / valor.total : 0;
    return {
      id: "orcamento-incoerente",
      nivel: "critico",
      titulo: `${impedem.length} item(ns) do orçamento impedem execução`,
      detalhe: `${brl(emRisco)} (${pct(participacao)} do orçamento) com composição incompatível com a atividade — o avanço planejado pode estar inflado por eles.`,
      aba: "financeiro",
      acao: "Ver no orçamento",
    };
  })();

  // Cobertura incompleta não invalida automaticamente o plano: há atividades
  // deliberadamente sem custo (por exemplo, licenças ou marcos). Mas, com um
  // orçamento aprovado, a ausência de vínculo precisa ficar visível para não
  // apresentar um controle financeiro parcial como se fosse integral.
  const alertaCoberturaOrcamentaria: AlertaDoPainel | null = (() => {
    if (!orcamento.data?.versions?.some((version) => version.status === "aprovado")) return null;
    const semItem = atividades.filter((atividade) => atividade.budgetItemId == null);
    if (semItem.length === 0) return null;
    return {
      id: "orcamento-cobertura-incompleta",
      nivel: "atencao",
      titulo: `${semItem.length} atividade(s) sem item de orçamento vinculado`,
      detalhe: "O orçamento aprovado não cobre todo o plano atual. Valide se são marcos sem custo ou se faltam quantitativos e preços antes de usar o avanço financeiro.",
      aba: "financeiro",
      acao: "Revisar cobertura",
    };
  })();

  const alertaOrcamentoDidatico: AlertaDoPainel | null = (() => {
    const itens = orcamento.data?.items ?? [];
    const aprovado = orcamento.data?.versions?.some((version) => version.status === "aprovado");
    if (!aprovado || itens.length === 0) return null;
    const didatico = itens.filter((item) => /didatic|rateio uniforme/i.test(String(item.source ?? "")));
    if (didatico.length === 0) return null;
    const cobertura = didatico.length === itens.length ? "Todos os itens" : `${didatico.length} de ${itens.length} itens`;
    return {
      id: "orcamento-didatico",
      nivel: "atencao",
      titulo: didatico.length === itens.length ? "Orçamento aprovado é apenas didático" : "Orçamento com itens didáticos",
      detalhe: `${cobertura} usam rateio ou fonte didática. Substitua-os por composições de catálogo oficial antes de controlar custo real ou valor agregado.`,
      aba: "financeiro",
      acao: "Revisar orçamento",
    };
  })();

  // CPM desatualizado: cpmCalculatedAt anterior a updatedAt ou nulo em atividades com cpmCalculatedAt.
  const alertaCpmDesatualizado: AlertaDoPainel | null = (() => {
    const comCpm = atividades.filter((a) => a.cpmCalculatedAt);
    if (comCpm.length === 0) return null;
    const desatualizadas = comCpm.filter(
      (a) => !a.updatedAt || new Date(a.cpmCalculatedAt!) < new Date(a.updatedAt)
    );
    if (desatualizadas.length === 0) return null;
    return {
      id: "cpm-desatualizado",
      nivel: "atencao",
      titulo: `${desatualizadas.length} atividade(s) com CPM desatualizado`,
      detalhe: "Recalcule o CPM antes de confiar nos prazos e no caminho crítico.",
      aba: "cpm",
      acao: "Recalcular CPM",
    };
  })();

  const alertasVisiveis = [...(alertaDeOrcamento ? [alertaDeOrcamento] : []), ...(alertaCoberturaOrcamentaria ? [alertaCoberturaOrcamentaria] : []), ...(alertaOrcamentoDidatico ? [alertaOrcamentoDidatico] : []), ...(alertaCpmDesatualizado ? [alertaCpmDesatualizado] : []), ...alertas].slice(0, 6);
  // Campos que chegam do backend, sem mutações. Zero só quando a fonte confirmou zero.
  const carregandoComplementos = plano.isPending || orcamento.isPending || producao.isPending || lookahead.isPending || baseline.isPending || coerencia.isPending;
  const erroComplementos = plano.isError || orcamento.isError || producao.isError || lookahead.isError || baseline.isError || coerencia.isError;

  return (
    <ControlTowerDashboard
      projetoId={projetoId}
      nomeObra={nomeObra ?? "Obra"}
      codigosExemplo={codigosExemplo}
      prontidao={integridade.prontidao}
      hoje={hoje}
      resumo={resumo}
      prazoConfianca={prazoConfianca}
      alertas={alertasVisiveis}
      valorSemDestino={valorSemDestino}
      semana={semana ? {
        numero: semana.numero,
        inicio: semana.inicio,
        fim: semana.fim,
        situacao: semana.situacao,
        bloqueadas: semana.bloqueadas,
        ppc: semana.ppc,
        pendentes: semana.pendentes,
        compromissos: semana.compromissos.length,
        atividades: semana.atividades.map(a => ({
          id: a.id, wbsCode: a.wbsCode, name: a.name,
          startIso: a.startIso, finishIso: a.finishIso,
          openConstraints: a.openConstraints,
        })),
      } : undefined}
      ultimos={ultimos.map(l => ({
        id: l.id,
        data: isoDoValor(l.productionDate),
        codigo: l.codigoEap ?? "—",
        atividade: l.atividadeNome ?? "Atividade fora do plano",
        quantidade: Number(l.quantity ?? 0),
        unidade: l.unidade ?? "",
        situacao: l.status === "confirmada"
          ? l.vinculo && l.vinculo !== "atual" ? "fora do plano" : "confirmada"
          : "rascunho",
      }))}
      ppc={semana?.ppc ?? null}
      bloqueadas={semana?.bloqueadas ?? null}
      compromissosPendentes={semana?.pendentes ?? null}
      carregandoComplementos={carregandoComplementos}
      erroComplementos={erroComplementos}
      orcamentoEstado={orcamento.isError ? "erro" : orcamento.isPending ? "pendente" : "ok"}
      producaoEstado={producao.isError ? "erro" : producao.isPending ? "pendente" : "ok"}
      semanaEstado={lookahead.isError ? "erro" : lookahead.isPending ? "pendente" : "ok"}
      abrirAba={abrirAba}
    />
  );
}

export default PainelDoCronograma;
