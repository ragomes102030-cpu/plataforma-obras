import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CalendarDays,
  ChartNoAxesCombined, CheckCircle2, ClipboardList, Clock3, Layers3,
  ListChecks, ShieldAlert, Wallet, X,
} from "lucide-react";
import type { AlertaDoPainel, ResumoDoPainel } from "@shared/painel-obra";
import { CurvaSControlTower } from "./CurvaSControlTower";
import "@/control-tower.css";

export type SemanaControl = {
  numero: number;
  inicio: string;
  fim: string;
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
  situacao: string;
};

type Props = {
  projetoId: number;
  nomeObra: string;
  codigosExemplo: ReadonlySet<string>;
  avancoEstado: "pendente" | "erro" | "indisponivel" | "ok";
  hoje: string;
  resumo: ResumoDoPainel;
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
  projetoId, nomeObra, codigosExemplo, avancoEstado, hoje, resumo, alertas, valorSemDestino,
  semana, ultimos, ppc, bloqueadas, compromissosPendentes,
  carregandoComplementos, erroComplementos, orcamentoEstado, producaoEstado, semanaEstado, abrirAba,
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
  const fisicoDisponivel = avancoEstado === "ok";
  const textoRealizado = fisicoDisponivel ? percentual(fisico.real) : "Indisponível";
  const textoPlanejado = fisicoDisponivel ? percentual(fisico.planejado) : "Indisponível";
  const textoDesvio = fisicoDisponivel ? ponto(fisico.pontos) : "Indisponível";
  const tituloStatus = avancoEstado === "pendente" ? "Validando a régua do orçamento."
    : avancoEstado === "erro" ? "Avanço físico indisponível."
    : avancoEstado === "indisponivel" ? "Sem orçamento ligado às atividades."
    : fisico.rotulo === "atrasada" ? "A execução está abaixo do planejado."
    : selo.tipo === "atrasada" ? "O planejamento exige correção."
    : selo.tipo === "sem_plano" ? "Planejamento ainda incompleto."
    : fisico.rotulo === "adiantada" ? "A execução supera o planejado."
    : "Acompanhe o desempenho da obra.";
  const corStatus = avancoEstado !== "ok" ? "atencao" : atrasadaFisico || selo.tipo === "atrasada" ? "atrasada"
    : selo.tipo === "atencao" || selo.tipo === "sem_plano" ? "atencao" : "em-dia";
  const statusTexto = avancoEstado === "pendente" ? "Validando orçamento"
    : avancoEstado === "erro" ? "Falha na consulta do orçamento"
    : avancoEstado === "indisponivel" ? "Avanço sem régua válida"
    : atrasadaFisico ? "Abaixo do planejado"
    : selo.tipo === "atrasada" ? "Atraso identificado" : selo.rotulo;
  const comprometidos = semana?.compromissos ?? null;
  const totalContado = status.concluidas + status.emAndamento + status.atrasadas + status.naoIniciadas;
  const statusConfere = totalContado === status.total;
  const detalhes: Record<Detalhe, { titulo: string; desc: string; itens: [string, string][]; acao: string }> = {
    fisico: { titulo: "Avanço físico", desc: "Avanço ponderado pelo orçamento ligado às atividades. A diferença não demonstra, sozinha, atraso na conclusão da obra.", itens: [
      ["Realizado", textoRealizado], ["Planejado", textoPlanejado], ["Desvio", textoDesvio],
    ], acao: "Investigar na Curva S" },
    prazo: { titulo: "Prazo e cronograma", desc: "Datas do planejamento atual. Atraso no término exige comparação com a baseline aprovada.", itens: [
      ["Início", dataBr(prazo.inicio)], ["Término previsto", dataBr(prazo.fim)], ["Dias restantes", prazo.diasRestantes === null ? "Sem plano" : prazo.diasRestantes >= 0 ? String(prazo.diasRestantes) : "Prazo vencido"], ["Prazo decorrido", percentual(prazo.fracaoDecorrida)],
    ], acao: "Ver no Gantt" },
    valor: { titulo: "Valor agregado (EV)", desc: "Valor orçado do trabalho executado, não faturamento nem desembolso. Parte sem atividade não entra na ponderação.", itens: [
      ["EV", orcamentoEstado !== "ok" ? "Não disponível" : valor.total > 0 ? dinheiro(valor.executado) : "Sem orçamento"], ["Orçamento ativo", orcamentoEstado !== "ok" ? "Não disponível" : dinheiro(valor.total)], ["Valor sem atividade", orcamentoEstado !== "ok" ? "Não disponível" : dinheiro(valorSemDestino)], ["Percentual do total", valor.pctExecutado == null ? "Indisponível" : percentual(valor.pctExecutado)],
    ], acao: "Ver orçamento e custos" },
    atividades: { titulo: "Situação das atividades", desc: "Contagem de atividades, não ponderada por valor. Os estados vêm do cronograma ativo.", itens: [
      ["Total", String(status.total)], ["Concluídas", String(status.concluidas)], ["Em andamento", String(status.emAndamento)], ["Atrasadas", String(status.atrasadas)], ["Não iniciadas", String(status.naoIniciadas)],
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

      {(carregandoComplementos || erroComplementos) && <div className="ct-data-note" role={erroComplementos ? "alert" : "status"}>
        <AlertTriangle size={17}/>{erroComplementos ? "Parte das consultas falhou. Os indicadores dependentes dessas fontes podem estar incompletos; não interprete ausência de dado como zero." : "Conferindo orçamento, produção e compromissos; informações complementares ainda estão sendo carregadas."}
      </div>}

      <section className={"ct-hero ct-hero-" + corStatus} aria-label="Resumo do desempenho">
        <div className="ct-hero-main">
          <span className="ct-status"><span className="ct-status-dot" aria-hidden="true"/>{statusTexto.toUpperCase()} · {dataBr(hoje)}</span>
          <h2>{tituloStatus}</h2>
          <p>{avancoEstado === "ok" ? "O avanço executado é comparado à meta acumulada na data de referência. Confira os serviços que explicam a diferença antes de revisar o plano." : avancoEstado === "pendente" ? "Os percentuais serão exibidos depois de carregar o orçamento e confirmar uma régua comparável." : avancoEstado === "erro" ? "O orçamento não foi consultado. O painel não substitui essa régua por uma média de quantidades." : "Associe itens do orçamento às atividades para habilitar um avanço físico ponderado."}</p>
          {avancoEstado === "ok" ? <div className="ct-hero-bottom"><strong className="ct-delta">{ponto(fisico.pontos)}</strong><span>Desvio de avanço<br/>realizado − planejado</span><button type="button" onClick={() => abrir("fisico")}>Entender o desvio <ArrowRight size={15}/></button></div>
            : <div className="ct-hero-bottom ct-fisico-indisponivel" role="status"><strong>{avancoEstado === "pendente" ? "Consultando…" : "Sem dado"}</strong><span>Avanço comparável<br/>indisponível</span><button type="button" onClick={() => abrir("valor")}>Ver orçamento <ArrowRight size={15}/></button></div>}
        </div>
        <div className="ct-hero-side">
          {avancoEstado === "ok" ? <div className="ct-gauge" role="img" aria-label={"Avanço realizado " + percentual(fisico.real)}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="41" fill="none" stroke="#304859" strokeWidth="11" pathLength="100"/><circle cx="50" cy="50" r="41" fill="none" stroke="#58cbd0" strokeWidth="11" strokeLinecap="round" strokeDasharray={reduzir(fisico.real * 100) + " 100"} pathLength="100" transform="rotate(-90 50 50)"/></svg>
            <div><strong>{percentual(fisico.real)}</strong><small>EXECUTADO</small></div>
          </div> : <div className="ct-gauge ct-gauge-indisponivel" role="status"><strong>{avancoEstado === "pendente" ? "…" : "—"}</strong><small>{avancoEstado === "pendente" ? "VALIDANDO" : "SEM DADO"}</small></div>}
          {avancoEstado === "ok" && <div className="ct-hero-compare">
            <span>Meta até hoje</span><strong>{percentual(fisico.planejado)}</strong>
            <div className="ct-compare-line"><span>Planejado</span><b>{percentual(fisico.planejado)}</b></div><div className="ct-progress"><span style={{ width: reduzir(fisico.planejado * 100) + "%" }}/></div>
            <div className="ct-compare-line"><span>Realizado</span><b>{percentual(fisico.real)}</b></div><div className="ct-progress"><span className="real" style={{ width: reduzir(fisico.real * 100) + "%" }}/></div>
          </div>}
        </div>
      </section>

      <section className="ct-kpis" aria-label="Indicadores essenciais">
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("prazo")}><span className="ct-kpi-head">TÉRMINO PREVISTO <CalendarDays size={18}/></span><strong>{dataBr(prazo.fim)}</strong><small>{prazo.diasRestantes == null ? "Sem prazo definido" : prazo.diasRestantes >= 0 ? prazo.diasRestantes + " dias restantes" : "Prazo vencido"} · {percentual(prazo.fracaoDecorrida)} transcorrido</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("valor")}><span className="ct-kpi-head">VALOR AGREGADO (EV) <Wallet size={18}/></span><strong>{orcamentoEstado === "pendente" ? "Consultando…" : orcamentoEstado === "erro" ? "Indisponível" : valor.total > 0 ? dinheiro(valor.executado) : "Sem orçamento"}</strong><small>{orcamentoEstado !== "ok" ? "Orçamento ainda não validado" : valor.total > 0 ? "Orçamento: " + dinheiro(valor.total) : "Conectar itens à EAP e ao plano"}</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("atividades")}><span className="ct-kpi-head">ATIVIDADES DO PLANO <ListChecks size={18}/></span><strong>{status.total} atividades</strong><small>{statusConfere ? status.atrasadas + " atrasadas · " + status.concluidas + " concluídas" : "Distribuição de status inconsistente"}</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
        <button className="ct-kpi ct-card" type="button" onClick={() => abrir("semana")}><span className="ct-kpi-head">COMPROMISSOS DA SEMANA <ClipboardList size={18}/></span><strong>{semanaEstado === "erro" ? "Indisponível" : semanaEstado === "pendente" ? "Consultando…" : comprometidos == null ? "Sem dados" : comprometidos === 0 ? "Sem registro" : comprometidos + " compromissos"}</strong><small>{ppc != null ? "PPC avaliado: " + numero.format(ppc) + "%" : "PPC não apurado"}{bloqueadas != null ? " · " + bloqueadas + " bloqueadas" : ""}</small><span className="ct-kpi-hint">Ver contexto <ArrowUpRight size={13}/></span></button>
      </section>

      <div className="ct-columns">
        <CurvaSControlTower projetoId={projetoId} codigosExemplo={codigosExemplo} hoje={hoje} abrirAba={abrirAba} painelReal={fisico.real} painelPlanejado={fisico.planejado}/>
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
          {semana ? <p>Semana {semana.numero}: {dataBr(semana.inicio)} a {dataBr(semana.fim)} · {semana.atividades.length} atividade(s) programada(s)</p> : <p>{semanaEstado === "pendente" ? "Consultando a programação semanal…" : semanaEstado === "erro" ? "Não foi possível consultar a programação semanal." : "Sem programação semanal disponível."}</p>}
          {semana?.atividades.length ? <ul className="ct-atividade-lista">{semana.atividades.slice(0, 4).map(a => <li key={a.id}><span>{a.wbsCode}</span><strong>{a.name}</strong><small>{a.openConstraints > 0 ? a.openConstraints + " restrição(ões) aberta(s)" : dataBr(a.finishIso)}</small></li>)}</ul> :
            <div className="ct-empty-row"><Clock3 size={18}/>Nenhuma atividade identificada para o período.</div>}
        </section>
        <section className="ct-card ct-lower-card" aria-labelledby="ct-producao"><div className="ct-lower-title"><div><span className="ct-overline">RASTREABILIDADE</span><h3 id="ct-producao">Últimos lançamentos</h3></div><button type="button" onClick={() => abrirAba("producao")}>Abrir produção <ArrowUpRight size={15}/></button></div>
          <p>Lançamentos do controle da produção. A leitura não altera medições.</p>
          {ultimos.length ? <ul className="ct-lanc-lista">{ultimos.slice(0, 4).map(a => <li key={a.id}><span>{dataBr(a.data)}</span><strong>{a.codigo} · {a.atividade}</strong><small>{numero.format(a.quantidade)} {a.unidade} · {a.situacao}</small></li>)}</ul> :
            <div className="ct-empty-row"><Activity size={18}/>{producaoEstado === "pendente" ? "Consultando lançamentos…" : producaoEstado === "erro" ? "Falha ao consultar lançamentos." : "Nenhum lançamento registrado no período."}</div>}
        </section>
      </div>
      <details className="ct-metodo"><summary>Fontes e critérios dos indicadores</summary><p>O avanço físico é ponderado pelo valor do orçamento associado às atividades na versão ativa. O valor agregado usa o trabalho executado associado a itens orçados. A Curva S emprega orçamento aprovado, dias úteis do calendário do CPM e produção confirmada. Contagens de atividades não são ponderadas. Diferenças entre versões e fontes devem ser investigadas; o painel nunca recalcula CPM nem altera dados.</p></details>

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
