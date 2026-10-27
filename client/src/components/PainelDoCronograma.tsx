import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { AgregadoDoCronograma, LinhaDoCronograma } from "@shared/cronograma-colunas";
import { diasEntre, montarResumo, type AlertaDoPainel } from "@shared/painel-obra";
import { calcularPesosDaCurva } from "@/lib/curva-s-pesos";
import { EstadoCarregando } from "@/components/EstadoCarregando";
import { ControlTowerDashboard } from "./ControlTowerDashboard";

/**
 * Painel da obra.
 *
 * Regra que vale para todo o painel: número sem régua é ruído. Avanço é
 * ponderado pelo valor do orçamento (a mesma régua da Curva S); valor executado
 * só conta o que tem atividade; contagem é por atividade. Cada um aparece com o
 * nome da sua régua e com o desvio assinado.
 */

type Props = {
  projetoId: number;
  agregado?: AgregadoDoCronograma | null;
  linhas?: LinhaDoCronograma[];
  carregandoGrade?: boolean;
  nomeObra?: string;
  hojeReferencia?: string;
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
    cpmCalculatedAt: a.cpmCalculatedAt ?? null,
    updatedAt: a.updatedAt ?? null,
  }));

  const dados = useMemo(() => {
    const custo = calcularPesosDaCurva(atividades, orcamento.data?.items ?? []);

    const pctPorCodigo = new Map<string, number>();
    const planejadoPorCodigo = new Map<string, number>();
    for (const linha of linhas ?? []) {
      if (linha.codigo) {
        pctPorCodigo.set(linha.codigo, linha.pctReal);
        planejadoPorCodigo.set(linha.codigo, linha.pctPlanejado);
      }
    }

    let executado = 0;
    let planejadoPorValor = 0;
    let pesoComOrcamento = 0;
    for (const atividade of atividades) {
      const valorDaAtividade = custo.custoPorAtividade.get(atividade.id) ?? 0;
      if (valorDaAtividade <= 0) continue;
      const avanco = pctPorCodigo.get(atividade.wbsCode ?? "") ?? 0;
      executado += valorDaAtividade * avanco;
      pesoComOrcamento += valorDaAtividade;
      planejadoPorValor += valorDaAtividade * (planejadoPorCodigo.get(atividade.wbsCode ?? "") ?? 0);
    }

    // Frações 0..1: `pctReal` e `pctPlanejado` já vêm assim da grade.
    const avancoPorValor = {
      real: pesoComOrcamento > 0 ? executado / pesoComOrcamento : 0,
      planejado: pesoComOrcamento > 0 ? planejadoPorValor / pesoComOrcamento : 0,
    };

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
      fisico: pesoComOrcamento > 0
        ? avancoPorValor
        : {
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

  // Coerência: só entra quando há item que IMPEDE execução e valor em risco.
  // Percentual é sempre sobre o valor do orçamento, a mesma régua do painel.
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

  const alertasVisiveis = [...(alertaDeOrcamento ? [alertaDeOrcamento] : []), ...(alertaCpmDesatualizado ? [alertaCpmDesatualizado] : []), ...alertas].slice(0, 6);
  // Campos que chegam do backend, sem mutações. Zero só quando a fonte confirmou zero.
  const carregandoComplementos = plano.isPending || orcamento.isPending || producao.isPending || lookahead.isPending || baseline.isPending || coerencia.isPending;
  const erroComplementos = plano.isError || orcamento.isError || producao.isError || lookahead.isError || baseline.isError || coerencia.isError;

  return (
    <ControlTowerDashboard
      projetoId={projetoId}
      nomeObra={nomeObra ?? "Obra"}
      hoje={hoje}
      resumo={resumo}
      alertas={alertasVisiveis}
      valorSemDestino={valorSemDestino}
      semana={semana ? {
        numero: semana.numero,
        inicio: semana.inicio,
        fim: semana.fim,
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
      ppc={lookahead.data?.ppcCorrente ?? null}
      bloqueadas={lookahead.data?.totalBloqueadas ?? null}
      compromissosPendentes={lookahead.data?.compromissosPendentes ?? null}
      carregandoComplementos={carregandoComplementos}
      erroComplementos={erroComplementos}
      abrirAba={abrirAba}
    />
  );
}

export default PainelDoCronograma;
