import React, { useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CalendarDays,
  ChartNoAxesCombined, CheckCircle2, ClipboardList, Clock3, Layers3,
  ListChecks, ShieldAlert, Wallet, X,
} from "lucide-react";
import type { AlertaDoPainel, ResumoDoPainel } from "@shared/painel-obra";
import type { ProntidaoDeAvanco } from "@shared/progress-readiness";
import type { ResultadoProducaoQa } from "@shared/qa-production-simulation";
import { CurvaSControlTower } from "./CurvaSControlTower";
import { RoteiroPlanejamentoServicos, type RoteiroPlanejamentoServicosProps } from "./RoteiroPlanejamentoServicos";
import { OrientacaoDeEtapa } from "./OrientacaoDeEtapa";
import { ReadinessGate } from "./ReadinessGate";
import "@/control-tower.css";

export type SemanaControl = {
  numero: number;
  inicio: string;
  fim: string;
  situacao: "encerrada" | "corrente" | "futura";
  bloqueadas: number;
  ppc: number | null;
  pendentes: number;
  atividades: { id: number; wbsCode: string; name: string; startIso: string; finishIso: string; openConstraints: number }[];
  compromissos: number;
};
export type LancamentoControl = {
  id: number;
  data: string;
  codigo: string;
  atividade: string;
  quantidade: number;
  unidade: string;
  unidadePlanejada?: string | null;
  unidadeCompativel?: boolean;
  situacao: string;
};

type Props = {
  projetoId: number;
  nomeObra: string;
  codigosExemplo: ReadonlySet<string>;
  prontidao: ProntidaoDeAvanco;
  simulacaoQa: ResultadoProducaoQa;
  prontidaoPesos?: {
    total: number;
    comQuantidade: number;
    comPeso: number;
    comEvidencia: number;
    aprovadas: number;
    somaPesos: number;
    semVinculoOrcamento: number;
    eapStatus: string | null;
    cenarioQa: boolean;
    foraDaLobQa: number;
  } | null;
  hoje: string;
  resumo: ResumoDoPainel;
  prazoConfianca: { confiavel: boolean; motivo: string };
  prazoOperacional: {
    fimPrevisto: string | null;
    motivo: string;
    variacaoBaseline: number | null;
    criticas: number;
    atrasadas: number | null;
    proximas: number | null;
    bloqueadas: number | null;
    emAndamento: number | null;
    concluidas: number | null;
    naoIniciadas: number | null;
    semAtualizacao: number | null;
    totalAtividades: number;
    dataUltimaPosicao: string | null;
  };
  alertas: AlertaDoPainel[];
  valorSemDestino: number;
  semana?: SemanaControl;
  ultimos: LancamentoControl[];
  ppc: number | null;
  bloqueadas: number | null;
  compromissosPendentes: number | null;
  carregandoComplementos: boolean;
  erroComplementos: boolean;
  orcamentoEstado: "pendente" | "erro" | "ok";
  producaoEstado: "pendente" | "erro" | "ok";
  semanaEstado: "pendente" | "erro" | "ok";
  abrirAba: (aba: string) => void;
  roteiroReadiness?: RoteiroPlanejamentoServicosProps["readiness"];
  roteiroForecast?: RoteiroPlanejamentoServicosProps["forecast"];
};

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dinheiro = (v: number) => reais.format(v);
const percentual = (frac: number) => numero.format(frac * 100) + "%";
const ponto = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + numero.format(Math.abs(v)) + " p.p.";
const dataBr = (v: string | null | undefined) => v ? v.slice(8, 10) + "/" + v.slice(5, 7) + "/" + v.slice(0, 4) : "Sem data";
const reduzir = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));

type Detalhe = "fisico" | "prazo" | "valor" | "atividades" | "semana" | "cpm";
const destinos: Record<Detalhe, string> = {
  fisico: "curva-s", prazo: "gantt", valor: "financeiro",
  atividades: "atividades", semana: "producao", cpm: "cpm",
};

export function ControlTowerDashboard({
  projetoId, nomeObra, codigosExemplo, prontidao, prontidaoPesos, simulacaoQa, hoje, resumo, prazoConfianca, prazoOperacional, alertas, valorSemDestino,
  semana, ultimos, ppc, bloqueadas, compromissosPendentes,
  carregandoComplementos, erroComplementos, orcamentoEstado, producaoEstado, semanaEstado, abrirAba,
  roteiroReadiness, roteiroForecast,
}: Props) {
  const { fisico, prazo, valor, status, selo } = resumo;
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const abrir = (id: Detalhe) => {
    anteriorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetalhe(id);
  };
  const fechar = () => { setDetalhe(null); anteriorRef.current?.focus(); };
  useEffect(() => {
    if (!detalhe) return;
    fecharRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); fechar(); }
      if (e.key !== "Tab") return;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(".ct-inspector button:not(:disabled)"));
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detalhe]);

  const atrasadaFisico = fisico.pontos < -0.5;
  const fisicoDisponivel = prontidao.fisico === "disponivel";
  const financeiroDisponivel = prontidao.financeiro === "disponivel";
  const cenarioQa = prontidaoPesos?.cenarioQa === true;
  const exibirEvQa = cenarioQa || simulacaoQa.lancamentosValidos > 0 || simulacaoQa.lancamentosUnidadeIncompativel > 0 || simulacaoQa.lancamentosForaDaVersao > 0;
  const textoEvQa = simulacaoQa.lancamentosValidos > 0 ? dinheiro(simulacaoQa.valorAgregado) : "Sem apontamento QA compatível";
  // A meta planejada continua sendo informativa quando os pesos existem,
  // mesmo que ainda não haja uma medição confirmada para o realizado.
  const planejadoDisponivel = fisicoDisponivel || prontidao.fisico === "sem_producao";
  const textoRealizado = fisicoDisponivel ? percentual(fisico.real) : "Sem dado";
  const textoPlanejado = planejadoDisponivel ? percentual(fisico.planejado) : "Indisponível";
  const textoDesvio = fisicoDisponivel ? ponto(fisico.pontos) : "Sem dado";
  const textoEv = prontidao.evDisponivel ? dinheiro(valor.executado)
    : prontidao.financeiro === "didatico" ? "Orçamento de teste"
    : prontidao.financeiro === "cobertura_incompleta" ? "Cobertura incompleta"
    : prontidao.financeiro === "sem_orcamento" ? "Sem orçamento aprovado"
    : prontidao.financeiro === "erro" ? "Indisponível"
    : prontidao.fisico === "sem_pesos" ? "Pesos físicos pendentes"
    : "Sem produção confirmada";
  const detalheEv = prontidao.financeiro === "didatico" ? "Valores de teste não habilitam controle financeiro"
    : prontidao.financeiro === "cobertura_incompleta" ? "Existem atividades operacionais sem custo válido"
    : !financeiroDisponivel ? "Exige orçamento aprovado, rastreável e com cobertura"
    : !prontidao.evDisponivel && prontidao.fisico === "sem_pesos" ? "Aguardando pesos físicos aprovados"
    : !prontidao.evDisponivel && prontidao.fisico === "sem_producao" ? "Aguardando produção confirmada"
    : !prontidao.evDisponivel && prontidao.fisico === "erro" ? "Falha na consulta do avanço físico"
    : !prontidao.evDisponivel ? "Aguardando dados do avanço físico"
    : "Orçamento: " + dinheiro(valor.total);
  const tituloStatus = cenarioQa ? "Cenário QA liberado com premissas sintéticas."
    : prontidao.fisico === "erro" ? "Avanço físico indisponível."
    : prontidao.fisico === "sem_pesos" ? "Avanço físico ainda sem pesos aprovados."
    : prontidao.fisico === "sem_producao" ? "Produção ainda não apurada."
    : fisico.rotulo === "atrasada" ? "A execução está abaixo do planejado."
    : selo.tipo === "atrasada" ? "O planejamento exige correção."
    : selo.tipo === "sem_plano" ? "Planejamento ainda incompleto."
    : fisico.rotulo === "adiantada" ? "A execução supera o planejado."
    : "Acompanhe o desempenho da obra.";
  const corStatus = !fisicoDisponivel ? "atencao" : atrasadaFisico || selo.tipo === "atrasada" ? "atrasada"
    : selo.tipo === "atencao" || selo.tipo === "sem_plano" ? "atencao" : "em-dia";
  const statusTexto = cenarioQa ? "Cenário QA liberado"
    : prontidao.fisico === "erro" ? "Falha na consulta do avanço físico"
    : prontidao.fisico === "sem_pesos" ? "Pesos físicos ainda não aprovados"
    : prontidao.fisico === "sem_producao" ? "Sem produção confirmada"
    : atrasadaFisico ? "Abaixo do planejado"
    : selo.tipo === "atrasada" ? "Atraso identificado" : selo.rotulo;
  const comprometidos = semana?.compromissos ?? null;
  const ppcDaSemana = semana ? semana.ppc : ppc;
  const bloqueadasDaSemana = semana ? semana.bloqueadas : bloqueadas;
  const pendentesDaSemana = semana ? semana.pendentes : compromissosPendentes;
  const detalhes: Record<Detalhe, { titulo: string; desc: string; itens: [string, string][]; acao: string }> = {
    fisico: { titulo: "Avanço físico", desc: "Avanço consolidado somente quando as atividades possuem pesos físicos explícitos e aprovados. Orçamento não substitui peso físico.", itens: [
      ["Realizado", textoRealizado], ["Planejado", textoPlanejado], ["Desvio", textoDesvio],
    ], acao: "Investigar na Curva S" },
    prazo: { titulo: "Prazo e cronograma", desc: prazoConfianca.confiavel ? "Data calculada no plano atual; atraso no término exige comparação com a baseline aprovada." : "A data exibida na grade é provisória. Ela não deve orientar decisões de prazo até a EAP e o CPM estarem válidos.", itens: [
      ["Início da grade", dataBr(prazo.inicio)], ["Término da grade", dataBr(prazo.fim)], ["Estado", prazoConfianca.motivo], ["Dias restantes", prazoConfianca.confiavel && prazo.diasRestantes !== null ? String(prazo.diasRestantes) : "Não validado"], ["Prazo decorrido", prazoConfianca.confiavel ? percentual(prazo.fracaoDecorrida) : "Não validado"],
    ], acao: "Ver no Gantt" },
    valor: { titulo: "Valor agregado (EV)", desc: cenarioQa ? "O EV real usa apenas produção real confirmada. A simulação QA fica em uma série separada e usa premissas sintéticas." : "Valor orçado do trabalho executado, não faturamento nem desembolso. Parte sem atividade não entra na ponderação.", itens: [
      ["EV real", textoEv], ["EV QA (simulação)", simulacaoQa.lancamentosValidos > 0 ? dinheiro(simulacaoQa.valorAgregado) : "Sem apontamento QA compatível"], ["Apontamentos QA válidos", String(simulacaoQa.lancamentosValidos)], ["Orçamento ativo", orcamentoEstado !== "ok" ? "Não disponível" : dinheiro(valor.total)], ["Valor sem atividade", orcamentoEstado !== "ok" ? "Não disponível" : dinheiro(valorSemDestino)], ["Percentual do total", !fisicoDisponivel || valor.pctExecutado == null ? "Indisponível" : percentual(valor.pctExecutado)],
    ], acao: "Ver orçamento e custos" },
    atividades: { titulo: "Situação das atividades", desc: "Contagem dos relatos temporais vigentes. Atividade sem atualização permanece desconhecida; o tempo decorrido não determina o estado.", itens: [
      ["Total", String(prazoOperacional.totalAtividades)], ["Concluídas", String(prazoOperacional.concluidas ?? "Sem consulta")], ["Em andamento", String(prazoOperacional.emAndamento ?? "Sem consulta")], ["Bloqueadas", String(prazoOperacional.bloqueadas ?? "Sem consulta")], ["Não iniciadas (relato)", String(prazoOperacional.naoIniciadas ?? "Sem consulta")], ["Sem atualização", String(prazoOperacional.semAtualizacao ?? "Sem consulta")], ["Previsão vencida", String(prazoOperacional.atrasadas ?? "Sem consulta")],
    ], acao: "Abrir atividades" },
    semana: { titulo: "Compromissos da semana", desc: "O PPC só deve aparecer quando compromissos tenham sido avaliados; sem registro não significa zero de produção.", itens: [
      ["Compromissos", comprometidos == null ? "Carregando" : String(comprometidos)], ["PPC", ppc == null ? "Não apurado" : numero.format(ppc) + "%"], ["Restrições abertas", bloqueadas == null ? "Sem dado" : String(bloqueadas)], ["Pendentes", compromissosPendentes == null ? "Sem dado" : String(compromissosPendentes)],
    ], acao: "Ver controle da produção" },
    cpm: { titulo: "Impacto no caminho crítico", desc: "Desvio físico não comprova mudança no fim da obra. Verifique precedências, calendário, folgas e baseline no módulo CPM.", itens: [
      ["Status do prazo", prazo.rotulo], ["Desvio de avanço", textoDesvio],
    ], acao: "Abrir CPM" },
  };

  return (
    <div className="ct" data-testid="arquimedes-control-tower">
      <header className="ct-heading">
        <div><span className="ct-overline">CENTRAL DE PLANEJAMENTO / VISÃO EXECUTIVA</span><h1>Visão geral da obra<span aria-hidden="true">.</span></h1><p>{nomeObra} · Posição em {dataBr(hoje)} · Painel somente de leitura</p></div>
        <button type="button" className="ct-button ct-button-primary" onClick={() => abrir("fisico")}>Investigar desempenho <ArrowUpRight size={16}/></button>
      </header>

      {roteiroReadiness && roteiroForecast && <RoteiroPlanejamentoServicos
        readiness={roteiroReadiness}
        forecast={roteiroForecast}
        onOpen={abrirAba}
      />}

      {(carregandoComplementos || erroComplementos) && <div className="ct-data-note" role={erroComplementos ? "alert" : "status"}>
        <AlertTriangle size={17}/>{erroComplementos ? "Parte das consultas falhou. Os indicadores dependentes dessas fontes podem estar incompletos; não interprete ausência de dado como zero." : "Conferindo orçamento, produção e compromissos; informações complementares ainda estão sendo carregadas."}
      </div>}

      {cenarioQa && <div className="ct-data-note ct-data-note-qa" role="note">
        <AlertTriangle size={17}/><span><strong>CENÁRIO QA:</strong> pesos uniformes e quantitativos são premissas para testar o sistema. Os valores exibidos não são medição real. {prontidaoPesos?.foraDaLobQa ?? 0} atividade(s) sem unidade exata estão classificadas fora da Linha de Balanço neste cenário.</span>
      </div>}

      {typeof window !== "undefined" && <ReadinessGate projetoId={projetoId} abrirAba={abrirAba} />}

      <section className="ct-prazo" aria-label="Acompanhamento de prazo">
        <div className="ct-prazo-topo"><div><span className="ct-overline">PLANEJAMENTO DE PRAZO</span><h2>Programação e andamento</h2><p>Atualizações por atividade são relatos temporais. O avanço físico e o financeiro usam seus próprios dados.</p></div><button type="button" className="ct-button ct-button-primary" onClick={() => abrirAba("gantt")}>Abrir cronograma <ArrowUpRight size={15}/></button></div>
        <div className="ct-prazo-kpis">
          <article><small>PLANO CALCULADO</small><strong>{prazoOperacional.fimPrevisto ? dataBr(prazoOperacional.fimPrevisto) : "Não calculado"}</strong><span>{prazoOperacional.fimPrevisto ? prazoConfianca.motivo : prazoOperacional.motivo}</span></article>
          <article><small>VARIAÇÃO DA BASELINE</small><strong>{prazoOperacional.variacaoBaseline == null ? "Sem comparação" : `${prazoOperacional.variacaoBaseline > 0 ? "+" : ""}${prazoOperacional.variacaoBaseline} dias`}</strong><span>{prazoOperacional.variacaoBaseline == null ? "Aprovar uma baseline de prazo após revisar a programação" : "Previsão atual comparada ao plano congelado"}</span></article>
          <article><small>REDE E PRAZO</small><strong>{prazoOperacional.criticas} críticas · {prazoOperacional.atrasadas == null ? "previsão vencida sem consulta" : `${prazoOperacional.atrasadas} previsões vencidas`}</strong><span>{prazoOperacional.proximas == null ? "Janela futura indisponível sem data inicial" : `${prazoOperacional.proximas} atividade(s) na próxima janela`}</span></article>
          <article><small>RELATOS DE CAMPO</small><strong>{prazoOperacional.semAtualizacao == null ? "Consulta indisponível" : `${prazoOperacional.totalAtividades - prazoOperacional.semAtualizacao}/${prazoOperacional.totalAtividades} atualizadas`}</strong><span>{prazoOperacional.dataUltimaPosicao ? `Última posição: ${dataBr(prazoOperacional.dataUltimaPosicao)}` : "Nenhuma atualização de prazo registrada"}</span></article>
        </div>
        <div className="ct-prazo-status" aria-label="Estado informado das atividades"><span><b>{prazoOperacional.emAndamento ?? "—"}</b> em andamento</span><span><b>{prazoOperacional.bloqueadas ?? "—"}</b> bloqueadas</span><span><b>{prazoOperacional.concluidas ?? "—"}</b> concluídas</span><span><b>{prazoOperacional.semAtualizacao ?? "—"}</b> sem atualização</span></div>
        {semana?.atividades.length ? <div className="ct-prazo-proximas"><strong>Próximas atividades</strong><ul>{semana.atividades.slice(0,4).map(atividade=><li key={atividade.id}><span>{atividade.wbsCode}</span>{atividade.name}<small>{dataBr(atividade.startIso)} – {dataBr(atividade.finishIso)}</small></li>)}</ul></div>:null}
      </section>

      <section className={"ct-hero ct-hero-" + corStatus} aria-label="Resumo do desempenho">
        <div className="ct-hero-main">
          <span className="ct-status"><span className="ct-status-dot" aria-hidden="true"/>{statusTexto.toUpperCase()} · {dataBr(hoje)}</span>
          <h2>{tituloStatus}</h2>
          <p>{cenarioQa
            ? `O painel está liberado para validar os indicadores da obra demonstrativa. Pesos e classificações sem unidade repetitiva são premissas QA; ${prontidaoPesos?.foraDaLobQa ?? 0} atividade(s) permanecem fora da Linha de Balanço sem local físico documentado.`
            : fisicoDisponivel
            ? "O avanço executado é comparado à meta física acumulada na data de referência. Confira os serviços que explicam a diferença antes de revisar o plano."
            : prontidao.fisico === "erro"
              ? "Uma fonte do acompanhamento físico não foi consultada. Atualize a leitura antes de interpretar o desempenho."
              : prontidao.fisico === "sem_producao"
                ? "Registre e confirme uma medição para apurar realizado e desvio. A ausência de lançamento não comprova execução zero."
                : prontidao.fisico === "sem_pesos" && prontidaoPesos
                  ? `O avanço consolidado está bloqueado: ${prontidaoPesos.aprovadas}/${prontidaoPesos.total} atividades têm peso aprovado. Quantidade: ${prontidaoPesos.comQuantidade}/${prontidaoPesos.total}; peso informado: ${prontidaoPesos.comPeso}/${prontidaoPesos.total}; evidência: ${prontidaoPesos.comEvidencia}/${prontidaoPesos.total}. Soma atual: ${numero.format(prontidaoPesos.somaPesos)}%.`
                  : "O painel acompanha as atividades individualmente, mas não soma unidades diferentes. Defina pesos físicos explícitos com evidência rastreável para publicar o percentual da obra."}</p>
          {fisicoDisponivel ? <div className="ct-hero-bottom"><strong className="ct-delta">{ponto(fisico.pontos)}</strong><span>Desvio de avanço<br/>realizado − planejado</span><button type="button" onClick={() => abrir("fisico")}>Entender o desvio <ArrowRight size={15}/></button></div>
            : prontidao.fisico === "sem_pesos" && prontidaoPesos
              ? <div className="ct-hero-bottom ct-fisico-indisponivel" role="status"><strong>{prontidaoPesos.semVinculoOrcamento} sem vínculo de orçamento</strong><span>EAP {prontidaoPesos.eapStatus ?? "sem versão"} · {prontidaoPesos.total - prontidaoPesos.comQuantidade} sem quantidade</span><button type="button" onClick={() => abrirAba("atividades")}>Ver atividades pendentes <ArrowRight size={15}/></button></div>
              : <div className="ct-hero-bottom ct-fisico-indisponivel" role="status"><strong>Sem dado agregado</strong><span>Atividades continuam<br/>visíveis individualmente</span><button type="button" onClick={() => abrirAba(prontidao.fisico === "sem_pesos" ? "atividades" : "producao")}>{prontidao.fisico === "sem_pesos" ? "Definir pesos físicos" : "Conferir produção"} <ArrowRight size={15}/></button></div>}
        </div>
        <div className="ct-hero-side">
          {fisicoDisponivel ? <div className="ct-gauge" role="img" aria-label={"Avanço realizado " + percentual(fisico.real)}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="41" fill="none" stroke="#304859" strokeWidth="11" pathLength="100"/><circle cx="50" cy="50" r="41" fill="none" stroke="#58cbd0" strokeWidth="11" strokeLinecap="round" strokeDasharray={reduzir(fisico.real * 100) + " 100"} pathLength="100" transform="rotate(-90 50 50)"/></svg>
            <div><strong>{percentual(fisico.real)}</strong><small>{cenarioQa ? "CENÁRIO QA" : "EXECUTADO"}</small></div>
          </div> : <div className="ct-gauge ct-gauge-indisponivel" role="status"><strong>—</strong><small>SEM AGREGADO</small></div>}
          {planejadoDisponivel && <div className="ct-hero-compare">
            <span>Meta física até hoje</span><strong>{percentual(fisico.planejado)}</strong>
            <div className="ct-compare-line"><span>Plano físico</span><b>{percentual(fisico.planejado)}</b></div><div className="ct-progress"><span style={{ width: reduzir(fisico.planejado * 100) + "%" }}/></div>
            <div className="ct-compare-line"><span>Realizado</span><b>{textoRealizado}</b></div>{fisicoDisponivel && <div className="ct-progress"><span className="real" style={{ width: reduzir(fisico.real * 100) + "%" }}/></div>}
          </div>}
        </div>
      </section>

      {prontidao.orientacoes.length > 0 && (
        <section className="ct-prontidao" aria-label="Como liberar os indicadores">
          {prontidao.orientacoes.map(orientacao => <OrientacaoDeEtapa key={orientacao.id} orientacao={orientacao} />)}
        </section>
      )}

      <section className="ct-kpis" aria-label="Indicadores essenciais">
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("prazo")}><span className="ct-kpi-head">{prazoConfianca.confiavel ? "TÉRMINO CALCULADO" : "PRAZO EM REVISÃO"} <CalendarDays size={18}/></span><strong>{prazoConfianca.confiavel ? dataBr(prazo.fim) : "Não validado"}</strong><small>{prazoConfianca.confiavel ? (prazo.diasRestantes == null ? "Sem prazo definido" : prazo.diasRestantes >= 0 ? prazo.diasRestantes + " dias restantes" : "Prazo vencido") + " · " + percentual(prazo.fracaoDecorrida) + " transcorrido" : prazoConfianca.motivo}</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("valor")}><span className="ct-kpi-head">VALOR AGREGADO (EV) <Wallet size={18}/></span><strong>{textoEv}</strong><small>{detalheEv}</small>{exibirEvQa && <small data-testid="ev-qa-simulation">EV QA (simulação): {textoEvQa} · {simulacaoQa.lancamentosValidos} lançamento(s) compatível(is){simulacaoQa.lancamentosUnidadeIncompativel > 0 ? ` · ${simulacaoQa.lancamentosUnidadeIncompativel} excluído(s) por unidade` : ""}{simulacaoQa.lancamentosForaDaVersao > 0 ? ` · ${simulacaoQa.lancamentosForaDaVersao} excluído(s) por vínculo de versão` : ""}</small>}<span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("atividades")}><span className="ct-kpi-head">ATIVIDADES DO PLANO <ListChecks size={18}/></span><strong>{prazoOperacional.totalAtividades} {prazoOperacional.totalAtividades===1?"atividade":"atividades"}</strong><small>{prazoOperacional.semAtualizacao == null ? "Relatos temporais indisponíveis" : `${prazoOperacional.semAtualizacao} sem atualização · ${prazoOperacional.concluidas ?? 0} concluídas por relato`}</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("semana")}><span className="ct-kpi-head">{semana?.situacao === "futura" ? "COMPROMISSOS DA PRÓXIMA SEMANA" : "COMPROMISSOS DA SEMANA"} <ClipboardList size={18}/></span><strong>{semanaEstado === "erro" ? "Indisponível" : semanaEstado === "pendente" ? "Consultando…" : comprometidos == null ? "Sem dados" : comprometidos === 0 ? "Nenhum compromisso" : comprometidos + " compromissos"}</strong><small>{ppcDaSemana != null ? "PPC avaliado: " + numero.format(ppcDaSemana) + "%" : "PPC não apurado"}{semana ? " · " + dataBr(semana.inicio) + " a " + dataBr(semana.fim) : ""}{bloqueadasDaSemana != null ? " · " + bloqueadasDaSemana + " bloqueadas" : ""}</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
      </section>

      <div className="ct-columns">
        <CurvaSControlTower projetoId={projetoId} codigosExemplo={codigosExemplo} hoje={hoje} abrirAba={abrirAba}/>
        <section className="ct-card ct-prioridades" aria-labelledby="ct-prioridades">
          <span className="ct-overline">RADAR DE DECISÕES</span><h3 id="ct-prioridades">Onde atuar primeiro</h3><p>A origem do alerta e o módulo indicado estão conectados aos dados da obra.</p>
          {alertas.length === 0 ? <div className="ct-nada"><CheckCircle2 size={22}/><strong>Sem alertas técnicos registrados</strong><span>Continue acompanhando avanço, prazo e lançamentos. Ausência de alerta não substitui conferência do planejamento.</span></div>
            : <ul className="ct-alertas">{alertas.slice(0, 5).map(a => <li key={a.id} className={"ct-alerta ct-alerta-" + a.nivel}>
              <div className="ct-alerta-icon"><ShieldAlert size={17}/></div>
              <div><strong>{a.titulo}</strong><p>{a.detalhe}</p>{a.aba && <button type="button" onClick={() => abrirAba(a.aba!)}>{a.acao ?? "Investigar no módulo"} <ArrowRight size={14}/></button>}</div>
            </li>)}</ul>}
          <button type="button" className="ct-button ct-button-outline" onClick={() => abrir("cpm")}>Conferir impacto no CPM <ArrowUpRight size={15}/></button>
        </section>
      </div>

      <div className="ct-lower">
        <section className="ct-card ct-lower-card" aria-labelledby="ct-semana"><div className="ct-lower-title"><div><span className="ct-overline">EXECUÇÃO E CONTROLE</span><h3 id="ct-semana">Semana de trabalho</h3></div><button type="button" onClick={() => abrirAba("producao")}>Abrir controle <ArrowUpRight size={15}/></button></div>
          {semana ? <p>{semana.situacao === "futura" ? "Próxima semana" : "Semana " + semana.numero}: {dataBr(semana.inicio)} a {dataBr(semana.fim)} · {semana.atividades.length} atividade(s) programada(s) · {pendentesDaSemana} compromisso(s) pendente(s)</p> : <p>{semanaEstado === "pendente" ? "Consultando a programação semanal…" : semanaEstado === "erro" ? "Não foi possível consultar a programação semanal." : "Sem programação semanal disponível."}</p>}
          {semana?.atividades.length ? <ul className="ct-atividade-lista">{semana.atividades.slice(0, 4).map(a => <li key={a.id}><span>{a.wbsCode}</span><strong>{a.name}</strong><small>{a.openConstraints > 0 ? a.openConstraints + " restrição(ões) aberta(s)" : dataBr(a.startIso) + " a " + dataBr(a.finishIso)}</small></li>)}</ul> :
            <div className="ct-empty-row"><Clock3 size={18}/>Nenhuma atividade identificada para o período.</div>}
        </section>
        <section className="ct-card ct-lower-card" aria-labelledby="ct-producao"><div className="ct-lower-title"><div><span className="ct-overline">RASTREABILIDADE</span><h3 id="ct-producao">Últimos lançamentos</h3></div><button type="button" onClick={() => abrirAba("producao")}>Abrir produção <ArrowUpRight size={15}/></button></div>
          <p>Lançamentos do controle da produção. A leitura não altera medições.</p>
          {ultimos.length ? <ul className="ct-lanc-lista">{ultimos.slice(0, 4).map(a => <li key={a.id}><span>{dataBr(a.data)}</span><strong>{a.codigo} · {a.atividade}</strong><small>{numero.format(a.quantidade)} {a.unidade} · {a.situacao}</small></li>)}</ul> :
            <div className="ct-empty-row"><Activity size={18}/>{producaoEstado === "pendente" ? "Consultando lançamentos…" : producaoEstado === "erro" ? "Falha ao consultar lançamentos." : "Nenhum lançamento registrado no período."}</div>}
        </section>
      </div>
      <details className="ct-metodo"><summary>Fontes e critérios dos indicadores</summary><p>O avanço físico agregado exige pesos físicos explícitos e aprovados; sem eles, o painel mantém a leitura por atividade. O valor agregado usa orçamento aprovado e trabalho executado confirmado. A Curva S financeira emprega orçamento aprovado, dias úteis do calendário do CPM e produção confirmada. Diferenças entre versões e fontes devem ser investigadas; o painel nunca recalcula CPM nem altera dados.</p></details>

      {detalhe && <div className="ct-dialog-root"><button type="button" className="ct-backdrop" aria-label="Fechar painel de investigação" onClick={fechar}/>
        <aside className="ct-inspector" role="dialog" aria-modal="true" aria-label={detalhes[detalhe].titulo}>
          <div className="ct-inspector-top"><div><span>ARQUIMEDES / INVESTIGAÇÃO</span><h2>{detalhes[detalhe].titulo}</h2></div><button type="button" ref={fecharRef} aria-label="Fechar investigação" onClick={fechar}><X size={19}/></button></div>
          <div className="ct-inspector-body"><p>{detalhes[detalhe].desc}</p><dl>{detalhes[detalhe].itens.map(([rotulo, val]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{val}</dd></div>)}</dl><div className="ct-inspector-next"><Layers3 size={17}/><p>Os valores são somente de leitura. Abra o módulo responsável para analisar as informações detalhadas.</p></div></div>
          <div className="ct-inspector-footer"><button type="button" className="ct-button ct-button-primary" onClick={() => {const aba=destinos[detalhe];setDetalhe(null);abrirAba(aba)}}>{detalhes[detalhe].acao} <ArrowUpRight size={15}/></button></div>
        </aside>
      </div>}
    </div>
  );
}

