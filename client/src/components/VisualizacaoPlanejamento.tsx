import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Crosshair, Download, GitBranch, GanttChartSquare, Maximize2, Minimize2, Printer, Scan, Search, Tags, TrendingUp, ZoomIn, ZoomOut } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate, WorkCalendar } from "@shared/work-calendar";
import { prepararBarrasBaselineGantt, resumirBaselineNoGantt, type BarraBaselineGantt } from "@shared/gantt-baseline-visual";
import { linhasVisiveis, linhasCriticasVisiveisGantt, montarArvore, type NoDoGantt } from "@shared/gantt-arvore";
import { gerarSetasVisiveisGantt } from "@shared/gantt-dependencias-visuais";
import { gerarSvgGantt } from "@shared/gantt-export-svg";
import { avaliarCpmGantt } from "@shared/gantt-cpm-validade";
import { LinhaBalancoEscadinha } from "./AuroraLinhaBalanco";
import "./aurora-piloto.css";

type Props = {
  linhas: EntradaDaLinha[];
  inicioObra: IsoDate | null;
  hoje: IsoDate;
  projetoId: number;
  /** Cabeçalho impresso: nome, código e local da obra. */
  titulo?: string;
  codigoObra?: string | null;
  localObra?: string | null;
  /** Compatibilidade com o Gantt; a aplicação usa a interface clássica. */
  layoutProfissional?: boolean;
  finsCalculados?: Record<string,string>;
};

type View = "gantt" | "lob";

function dateMs(s: string): number {
  return new Date(`${s}T12:00:00Z`).getTime();
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}${y !== undefined ? "" : ""}`;
}

/** Marca o ano no primeiro rótulo e em toda virada de ano — sem isso, numa obra
 *  de 27 meses todas as datas parecem do mesmo ano. */
function fmtComAno(iso: string, comAno: boolean): string {
  const [ano, mes, dia] = iso.split("-");
  return comAno ? `${dia}/${mes}/${ano}` : `${dia}/${mes}`;
}

export type PlanejamentoView = "gantt" | "lob";

export function VisualizacaoPlanejamento({
  linhas,
  inicioObra,
  hoje,
  projetoId,
  view = "gantt",
  titulo,
  codigoObra,
  localObra,
  layoutProfissional = true,
  finsCalculados = {},
}: Props & { view?: PlanejamentoView }) {
  const planejamento = trpc.planning.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: Number(projetoId) > 0 }
  );
  const atividades = planejamento.data?.activities ?? [];
  const atividadePorCodigo = useMemo(
    () => new Map(atividades.map(activity => [activity.wbsCode, activity])),
    [atividades]
  );
  // A baseline vigente é a única referência automática. Nunca utilizar
  // silenciosamente uma fotografia histórica quando não houver vigente.
  const [compararBaseline, setCompararBaseline] = useState(false);
  const baselinesVigentes = (planejamento.data?.baselines ?? []).filter(b => b.status === "ativa");
  const baselineVigente = baselinesVigentes.length === 1 ? baselinesVigentes[0] : null;
  const anoObra = Number(inicioObra?.slice(0,4) ?? 0);
  const anoValido = Number.isInteger(anoObra) && anoObra >= 2000 && anoObra <= 2100;
  const consultarBaseline = view === "gantt" && compararBaseline && baselineVigente !== null;
  const comparacaoBaseline = trpc.planning.compararComBaseline.useQuery(
    { projectId: Number(projetoId), baselineId: baselineVigente?.id },
    { enabled: consultarBaseline && Number(projetoId) > 0 }
  );
  const calendarioBaseline = trpc.planning.getCalendarForCurve.useQuery(
    { projectId: Number(projetoId), startYear: anoValido ? anoObra : 2000 },
    { enabled: consultarBaseline && anoValido && Number(projetoId) > 0 }
  );
  const barrasBaseline = useMemo(() =>
    compararBaseline && inicioObra && comparacaoBaseline.data?.linhas && calendarioBaseline.data
      ? prepararBarrasBaselineGantt(
          comparacaoBaseline.data.linhas,
          inicioObra,
          calendarioBaseline.data as WorkCalendar,
        )
      : new Map<string, BarraBaselineGantt>(),
    [compararBaseline, inicioObra, comparacaoBaseline.data, calendarioBaseline.data]
  );
  const baselinePronta = compararBaseline && comparacaoBaseline.isSuccess &&
    calendarioBaseline.isSuccess && Boolean(comparacaoBaseline.data);
  const resumoBaseline = baselinePronta && comparacaoBaseline.data
    ? resumirBaselineNoGantt(comparacaoBaseline.data.resumo)
    : null;
  const estadoCpm = avaliarCpmGantt(atividades);
  const cpmValido = !planejamento.isPending && !planejamento.isError && estadoCpm.valido;

  // Dependências do cronograma traduzidas para os códigos da EAP, que é o que a
  // planilha do Gantt usa como chave de linha. Sem isso o gráfico mostra barras
  // soltas — e o Project/Primavera mostram a sequência entre elas.
  const dependencias = useMemo(() => {
    const codigoPorAtividade = new Map(atividades.map(activity => [activity.id, activity.wbsCode]));
    return (planejamento.data?.dependencies ?? []).flatMap(dependencia => {
      const de = codigoPorAtividade.get(dependencia.predecessorId);
      const para = codigoPorAtividade.get(dependencia.successorId);
      return de && para ? [{ de, para, tipo: String(dependencia.type ?? "FS"), lag: Number(dependencia.lag ?? 0) }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planejamento.data]);

  const dados = useMemo(() => {
    if (!linhas.length) return null;
    const baselineExibida = baselinePronta ? Array.from(barrasBaseline.values()) : [];
    const minAtual = linhas.reduce((v,l) => Math.min(v,dateMs(l.inicio)),dateMs(linhas[0]!.inicio));
    const min = baselineExibida.reduce((v,b)=>Math.min(v,dateMs(b.inicio)),minAtual);
    const max = linhas.reduce((v,l)=>{
      const fim = finsCalculados[l.codigo];
      const dataValida = typeof fim === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(fim) &&
        Number.isFinite(dateMs(fim)) && fim >= l.inicio;
      return Math.max(v, dataValida ? dateMs(fim!) :
        dateMs(l.inicio) + Math.max(0,l.duracao-1) * 86400000);
    }, min);
    const maxComBaseline = baselineExibida.reduce((v,b)=>Math.max(v,dateMs(b.fim)),max);
    const inicio = new Date(min);
    inicio.setUTCDate(1);
    const fim = new Date(maxComBaseline);
    fim.setUTCDate(1);
    fim.setUTCMonth(fim.getUTCMonth() + 1);
    const start = inicio.toISOString().slice(0, 10);
    const end = fim.toISOString().slice(0, 10);
    const total = Math.max(1, Math.round((dateMs(end) - dateMs(start)) / 86400000));
    return { start, end, total };
  }, [linhas, finsCalculados, barrasBaseline, baselinePronta]);

  if (!dados) {
    return (
      <div className="pl-visual-vazio">
        <h3>{view === "gantt" ? "Gantt" : "Linha de Balanço"}</h3>
        <p>Crie atividades no planejamento para visualizar esta ferramenta.</p>
      </div>
    );
  }

  return (
    <section className={`pl-visual pl-visual-full${layoutProfissional ? " planejamento-profissional" : ""}`}>
      <header className="pl-visual-header">
        <div>
          <strong>{view === "gantt" ? "GANTT — PLANEJAMENTO DA OBRA" : "LINHA DE BALANÇO — FLUXO DA PRODUÇÃO"}</strong>
          <span>{view === "gantt" ? (layoutProfissional ? "EAP recolhível · tarefas, datas, vínculos e progresso" : "Sequência, duração, avanço e caminho crítico") : "Datas na horizontal · pavimentos na vertical · status e análise de fluxo"}</span>
        </div>
      </header>
      <nav className="planejamento-layout-atalhos" aria-label="Edição manual do planejamento">
        <span>Editar no sistema, sem agente:</span>
        {([["atividades","Atividades e durações"],["dependencias","Predecessoras"],["cpm","Calcular CPM"],["eap","Estrutura EAP"]] as const).map(([aba,rotulo]) =>
          <button key={aba} type="button" onClick={() => window.dispatchEvent(new CustomEvent("abrir-aba",{detail:{aba}}))}>{rotulo}</button>
        )}
      </nav>
      {view === "gantt" && !cpmValido && !planejamento.isPending && !planejamento.isError && atividades.length > 0 && (
        <div className="pl-gantt-cpm-aviso">
          CPM ausente, incompleto ou desatualizado em alguma atividade. O caminho crítico e as folgas não serão considerados válidos até recalcular a rede.
        </div>
      )}
      {view === "gantt" && planejamento.isError && (
        <div className="pl-gantt-cpm-aviso erro">
          Não foi possível carregar o estado do CPM: {planejamento.error.message}
        </div>
      )}
      {view === "gantt" && compararBaseline && !baselinePronta && (
        <div className="pl-gantt-cpm-aviso" role="status">
          {!baselineVigente ? "Não há baseline vigente única para comparar. Consulte a aba Baseline." :
           !anoValido ? "A obra não possui data de início válida para converter os dias úteis da baseline." :
           comparacaoBaseline.isError ? "Erro ao carregar comparação: "+comparacaoBaseline.error.message :
           calendarioBaseline.isError ? "Erro ao carregar calendário: "+calendarioBaseline.error.message :
           "Carregando baseline vigente e calendário da obra…"}
        </div>
      )}
      {view === "gantt" ? (
        <Gantt linhas={linhas} atividades={atividadePorCodigo} dependencias={dependencias} dados={dados} hoje={hoje} inicioObra={inicioObra} titulo={titulo} codigoObra={codigoObra} localObra={localObra} layoutProfissional={layoutProfissional} finsCalculados={finsCalculados} cpmValido={cpmValido}
          compararBaseline={compararBaseline} onAlternarBaseline={() => setCompararBaseline(v=>!v)}
          baselineDisponivel={baselineVigente !== null && anoValido}
          baselinePronta={baselinePronta} barrasBaseline={barrasBaseline}
          nomeBaseline={comparacaoBaseline.data?.baseline.name ?? baselineVigente?.name ?? null}
          resumoBaseline={resumoBaseline} />
      ) : (
        <LinhaBalancoEscadinha linhas={linhas} finsCalculados={finsCalculados} hoje={hoje} dependencias={dependencias} estadoVinculos={planejamento.isError ? "erro" : planejamento.isLoading ? "carregando" : "pronto"} onAbrirAtividades={() => window.dispatchEvent(new CustomEvent("abrir-aba",{detail:{aba:"atividades"}}))} />
      )}
    </section>
  );
}

/** Unidade da escala, como no Primavera/Project: o rótulo diz o que cada coluna
 *  significa, não "4 px". */
function unidadeDaEscala(px: number): string {
  if (px >= 18) return "dia";
  if (px >= 7) return "semana";
  if (px >= 3.2) return "quinzena";
  return "mês";
}

const NOMES_DO_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo de mês por extenso curto: "out" e, na virada do ano, "jan/27". */
function rotuloDeMes(iso: string, comAno: boolean): string {
  const [ano, mes] = iso.split("-");
  const nome = NOMES_DO_MES[Number(mes) - 1] ?? mes;
  return comAno ? `${nome}/${ano.slice(2)}` : nome;
}

/** 760px é o mesmo corte do resto do layout de campo. */
function useTelaEstreita(): boolean {
  const [estreita, setEstreita] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
  );
  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 760px)");
    const ouvir = () => setEstreita(consulta.matches);
    ouvir();
    consulta.addEventListener("change", ouvir);
    return () => consulta.removeEventListener("change", ouvir);
  }, []);
  return estreita;
}

function Gantt({
  linhas,
  atividades,
  dependencias,
  dados,
  hoje,
  inicioObra,
  titulo,
  codigoObra,
  localObra,
  layoutProfissional = true,
  finsCalculados,
  cpmValido,
  compararBaseline,
  onAlternarBaseline,
  baselineDisponivel,
  baselinePronta,
  barrasBaseline,
  nomeBaseline,
  resumoBaseline,
}: {
  linhas: EntradaDaLinha[];
  atividades: Map<
    string,
    {
      id: number;
      projectId: number;
      isMilestone: boolean;
      critical: number;
      totalFloat: number | null;
      cpmCalculatedAt: Date | string | null;
    }
  >;
  dependencias: { de: string; para: string; tipo: string }[];
  dados: { start: string; end: string; total: number };
  hoje: IsoDate;
  inicioObra: IsoDate | null;
  layoutProfissional?: boolean;
  finsCalculados: Readonly<Record<string, string>>;
  cpmValido: boolean;
  compararBaseline: boolean;
  onAlternarBaseline: () => void;
  baselineDisponivel: boolean;
  baselinePronta: boolean;
  barrasBaseline: ReadonlyMap<string, BarraBaselineGantt>;
  nomeBaseline: string | null;
  resumoBaseline: ReturnType<typeof resumirBaselineNoGantt> | null;
  /** Cabeçalho da impressão: nome, código e local da obra. */
  titulo?: string;
  codigoObra?: string | null;
  localObra?: string | null;
}) {
  const referencia = useRef<HTMLDivElement | null>(null);
  const [larguraVisivel, setLarguraVisivel] = useState(1200);
  const utils = trpc.useUtils();
  const [alternandoMarco, setAlternandoMarco] = useState(false);
  const [larguraEsquerda, setLarguraEsquerda] = useState(() => {
    try {
      const salvo = Number(window.localStorage.getItem(layoutProfissional ? "plataforma-obras:gantt-esquerda-profissional" : "plataforma-obras:gantt-esquerda"));
      return Number.isFinite(salvo) && salvo >= 300 && salvo <= 760 ? salvo : (layoutProfissional ? 610 : 470);
    } catch {
      return layoutProfissional ? 610 : 470;
    }
  });
  const [ajustandoColuna, setAjustandoColuna] = useState(false);
  const inicioArraste = useRef<{ x: number; largura: number } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(layoutProfissional ? "plataforma-obras:gantt-esquerda-profissional" : "plataforma-obras:gantt-esquerda", String(larguraEsquerda));
    } catch {
      // modo privado: segue sem guardar
    }
  }, [larguraEsquerda, layoutProfissional]);

  useEffect(() => {
    if (!ajustandoColuna) return;
    const mover = (evento: PointerEvent) => {
      const base = inicioArraste.current;
      if (!base) return;
      setLarguraEsquerda(Math.min(760, Math.max(300, base.largura + evento.clientX - base.x)));
    };
    const soltar = () => {
      inicioArraste.current = null;
      setAjustandoColuna(false);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [ajustandoColuna]);
  const marcarMarco = trpc.planning.atualizarAtividade.useMutation({
    // Sem `await`: se o refetch demorar, o painel não fica preso em "salvando…"
    // (a mutation só termina quando o onSuccess resolve). `utils.invalidate()`
    // pega a grade e a lista com os inputs que as telas já usam.
    onSuccess: () => {
      void utils.invalidate();
    },
  });
  // Abre na escala semanal (7px por dia), como o Project: uma obra de 820 dias
  // "ajustada" na tela vira 6px de barra e não comunica nada. O botão Ajustar
  // continua ali para quem quer a visão do todo.
  const [pxManual, setPxManual] = useState<number | null>(7);
  const estreita = useTelaEstreita();

  // Planilha do Gantt: no desktop, EAP+atividade, duração, início, fim e avanço;
  // no celular, atividade e avanço. No desktop a largura é arrastável (divisória
  // entre a planilha e o gráfico) e fica guardada no navegador.
  const esquerda = estreita ? 168 : larguraEsquerda;
  const alturaLinha = estreita ? 46 : layoutProfissional ? 38 : 30;
  const colunasBase = estreita ? "minmax(0,1fr) 40px" :
    layoutProfissional ? "minmax(0,1fr) 52px 82px 82px 52px" :
      "minmax(0,1fr) 46px 66px 66px 42px";
  const colunas = baselinePronta && !estreita ? colunasBase + " 44px" : colunasBase;

  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;
    const medir = () => setLarguraVisivel(elemento.clientWidth || 1200);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  // "Ajustar" é o padrão: a obra inteira cabe na tela. Quem quiser detalhe usa
  // os botões de zoom; o valor manual vale até clicar em Ajustar de novo.
  const pxAjustado = Math.max(0.8, (larguraVisivel - esquerda - 14) / Math.max(1, dados.total));
  const px = pxManual ?? pxAjustado;
  const larguraDoTempo = Math.max(1, Math.round(dados.total * px));

  const posicao = (iso: string) => ((dateMs(iso) - dateMs(dados.start)) / 86400000) * px;
  const hojeX = Math.max(0, Math.min(larguraDoTempo, posicao(hoje)));
  const inicioX = inicioObra ? posicao(inicioObra) : null;

  const meses = useMemo(() => {
    const lista: { iso: string; x: number; largura: number; rotulo: string }[] = [];
    let cursor = new Date(`${dados.start}T12:00:00Z`);
    cursor.setUTCDate(1);
    while (cursor.getTime() <= dateMs(dados.end)) {
      const ini = cursor.toISOString().slice(0, 10);
      const proximo = new Date(cursor);
      proximo.setUTCMonth(proximo.getUTCMonth() + 1);
      const x0 = ((dateMs(ini) - dateMs(dados.start)) / 86400000) * px;
      const x1 = ((dateMs(proximo.toISOString().slice(0, 10)) - dateMs(dados.start)) / 86400000) * px;
      const inicioVisivel = Math.max(0, x0);
      const fimVisivel = Math.min(larguraDoTempo, x1);
      if (fimVisivel > inicioVisivel) {
        const viradaDeAno = ini.slice(5, 7) === "01" || lista.length === 0;
        lista.push({ iso: ini, x: inicioVisivel, largura: fimVisivel - inicioVisivel, rotulo: rotuloDeMes(ini, viradaDeAno) });
      }
      cursor = proximo;
    }
    return lista;
  }, [dados.start, dados.end, px, larguraDoTempo]);

  // Datas na vertical: com pouco espaço por dia, o rótulo girado cabe onde o
  // horizontal não cabe — é o mesmo recurso do Project quando a escala aperta.
  const datasNaVertical = px < 12;
  const ticks = useMemo(() => {
    const degraus = [1, 2, 3, 7, 14, 28];
    const passo = datasNaVertical
      ? (degraus.find(degrau => degrau * px >= 13) ?? 28)
      : Math.max(1, Math.ceil(34 / px));
    const lista: { iso: string; x: number; rotulo: string | null }[] = [];
    for (let d = 0; d <= dados.total; d += passo) {
      const iso = addDays(dados.start, d);
      lista.push({ iso, x: d * px, rotulo: passo * px >= 10 ? fmtComAno(iso, false) : null });
    }
    return lista;
  }, [dados.start, dados.total, px, datasNaVertical]);

  const finsDeSemana = useMemo(() => {
    const faixas: { x: number; largura: number }[] = [];
    for (let d = 0; d < dados.total; d++) {
      const dia = new Date(`${addDays(dados.start, d)}T12:00:00Z`).getUTCDay();
      if (dia === 0 || dia === 6) faixas.push({ x: d * px, largura: px });
    }
    return faixas;
  }, [dados.start, dados.total, px]);

  const totalCriticas = cpmValido ? Array.from(atividades.values()).filter(item => item.critical === 1).length : 0;

  // Árvore da EAP (etapas recolhíveis, como no Project) e o que está visível.
  const codigosCriticos = useMemo(
    () =>
      new Set(
        Array.from(atividades.entries())
          .filter(([, item]) => cpmValido && item.critical === 1)
          .map(([codigo]) => codigo)
      ),
    [atividades, cpmValido]
  );
  const arvore = useMemo(() => montarArvore(linhas, codigosCriticos, finsCalculados), [linhas, codigosCriticos, finsCalculados]);
  const [colapsados, setColapsados] = useState<Set<string>>(() => new Set());
  const temEtapas = arvore.some(no => no.temFilhos);
  const visiveis = useMemo(() => linhasVisiveis(arvore, colapsados), [arvore, colapsados]);

  const resumoDoPlano = useMemo(() => {
    let total = 0;
    let atividades = 0;
    let peso = 0;
    let ponderado = 0;
    let primeiro = "";
    let ultimo = "";
    const andar = (nos: typeof arvore) => {
      for (const no of nos) {
        if (!primeiro || dateMs(no.inicio) < dateMs(primeiro)) primeiro = no.inicio;
        if (!ultimo || dateMs(no.fim) > dateMs(ultimo)) ultimo = no.fim;
        total += 1;
        if (no.filhos.length) {
          andar(no.filhos);
          continue;
        }
        atividades += 1;
        const dias = Math.max(1, no.duracao);
        peso += dias;
        ponderado += no.progresso * dias;
      }
    };
    andar(arvore);
    return {
      atividades,
      etapas: total - atividades,
      executado: peso === 0 ? 0 : ponderado / peso,
      inicio: primeiro || dados.start,
      fim: ultimo || dados.end,
    };
  }, [arvore, dados.start, dados.end]);

  // Filtro de visão (não de edição): esconde linhas, nunca altera o plano.
  const [busca, setBusca] = useState("");
  const [soCritico, setSoCritico] = useState(false);
  // Um cálculo parcial/desatualizado não pode apagar as linhas da obra.
  const podeFiltrarCritico = cpmValido && totalCriticas > 0;
  const soCriticoAtivo = soCritico && podeFiltrarCritico;
  useEffect(() => {
    if (!podeFiltrarCritico) setSoCritico(false);
  }, [podeFiltrarCritico]);
  const [mostrarSetas, setMostrarSetas] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [rotulos, setRotulos] = useState(true);
  const [mostrarAvanco, setMostrarAvanco] = useState(true);
  const [telaCheia, setTelaCheia] = useState(false);
  // A visão geral é lembrada entre visitas: quem trabalha no campo recolhe uma
  // vez e o gráfico abre com a altura toda nas próximas vezes.
  const [visaoAberta, setVisaoAberta] = useState(() => {
    try {
      return window.localStorage.getItem("plataforma-obras:gantt-visao") !== "fechada";
    } catch {
      return true;
    }
  });
  const alternarVisao = () => {
    setVisaoAberta(aberta => {
      try {
        window.localStorage.setItem("plataforma-obras:gantt-visao", aberta ? "fechada" : "aberta");
      } catch {
        /* navegador sem armazenamento local: segue só na sessão */
      }
      return !aberta;
    });
  };
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = useMemo(
    () => (soCriticoAtivo ? linhasCriticasVisiveisGantt(arvore) : visiveis)
      .filter(no => !termo || `${no.codigo} ${no.nome}`.toLocaleLowerCase("pt-BR").includes(termo)),
    [arvore, visiveis, soCriticoAtivo, termo]
  );

  // ---- Impressão / PDF -----------------------------------------------------
  // A tabela de impressão mede o tempo em porcentagem (não em pixel), então cabe
  // na largura da folha em qualquer escala. Ela é um portal no <body> e só existe
  // na impressão: o CSS esconde o app e mostra esta tabela, com <thead> repetido
  // a cada página, como o Primavera faz.
  const impressao = useMemo(() => {
    const total = Math.max(1, larguraDoTempo);
    const pct = (valor: number) => Math.max(0, Math.min(100, (valor / total) * 100));
    const doDia = (iso: string) => ((dateMs(iso) - dateMs(dados.start)) / 86400000) * px;
    return {
      hoje: pct(Math.max(0, doDia(hoje))),
      meses: meses.map(mes => ({
        rotulo: mes.rotulo,
        esquerda: pct(mes.x),
        largura: pct(mes.largura),
        // No papel cabem poucos rótulos: só a virada de ano recebe texto, o resto
        // vira linha fina de mês.
        virada: mes.rotulo.includes("/"),
      })),
      linhas: filtradas.map(no => {
        const inicio = Math.max(0, doDia(no.inicio));
        const largura = Math.max(6, Math.min(larguraDoTempo - inicio, (Math.round((dateMs(no.fim)-dateMs(no.inicio))/86400000)+1) * px));
        return { no, esquerda: pct(inicio), largura: pct(largura) };
      }),
    };
  }, [filtradas, larguraDoTempo, meses, px, dados.start, hoje]);

  // Geometria de cada linha filtrada, em coordenadas do trilho de tempo. É o que
  // permite desenhar as setas de dependência como no Project.
  const geometria = useMemo(() => {
    const mapa = new Map<string, { x0: number; x1: number; y: number }>();
    filtradas.forEach((no, indice) => {
      const x0 = Math.max(0, ((dateMs(no.inicio) - dateMs(dados.start)) / 86400000) * px);
      const x1 = x0 + Math.max(6, Math.min(larguraDoTempo - x0, (Math.round((dateMs(no.fim)-dateMs(no.inicio))/86400000)+1) * px));
      mapa.set(no.chave, { x0, x1, y: indice * alturaLinha + alturaLinha / 2 });
    });
    return mapa;
  }, [filtradas, px, dados.start, larguraDoTempo, alturaLinha]);

  const setas = useMemo(
    () => mostrarSetas
      ? gerarSetasVisiveisGantt(dependencias, geometria, codigosCriticos)
      : [],
    [dependencias, geometria, mostrarSetas, codigosCriticos]
  );

  // Linha de avanço: passa pelo ponto em que cada atividade realmente está.
  // Trecho sem lançamento quebra a linha em vez de voltar ao início do gráfico.
  const avancos = useMemo(() => {
    const pontos = new Map<string, number>();
    const trechos: string[] = [];
    if (!mostrarAvanco) return { pontos, trechos };
    let atual: string[] = [];
    for (const no of filtradas) {
      const geo = geometria.get(no.chave);
      const progresso = Math.max(0, Math.min(100, no.progresso));
      if (!geo || no.temFilhos || progresso <= 0) {
        if (atual.length > 1) trechos.push(atual.join(" "));
        atual = [];
        continue;
      }
      const x = geo.x0 + (geo.x1 - geo.x0) * (progresso / 100);
      pontos.set(no.chave, x);
      atual.push(`${x},${geo.y}`);
    }
    if (atual.length > 1) trechos.push(atual.join(" "));
    return { pontos, trechos };
  }, [filtradas, geometria, mostrarAvanco]);

  // Faixa de detalhe da linha escolhida: datas, folga e ligações. É o que o
  // engenheiro consulta no campo sem abrir a planilha inteira.
  const detalhe = useMemo(() => {
    const no = filtradas.find(linha => linha.chave === selecionada);
    if (!no) return null;
    const atividade = atividades.get(no.codigo);
    const listaPred = dependencias.filter(dependencia => dependencia.para === no.codigo);
    const listaSuces = dependencias.filter(dependencia => dependencia.de === no.codigo);
    const resumo = (lista: { de: string; para: string; tipo: string }[], chave: "de" | "para") =>
      lista.length === 0
        ? "nenhuma"
        : lista.map(dependencia => `${dependencia.tipo.toUpperCase()} ${dependencia[chave]}`).join(" · ");
    return {
      no,
      atividadeId: atividade?.id ?? null,
      projetoId: atividade?.projectId ?? null,
      folga: cpmValido && typeof atividade?.totalFloat === "number" ? atividade.totalFloat : null,
      predecessoras: resumo(listaPred, "de"),
      sucessoras: resumo(listaSuces, "para"),
    };
  }, [selecionada, filtradas, atividades, dependencias, cpmValido]);
  const alternar = (chave: string) =>
    setColapsados(antes => {
      const proximo = new Set(antes);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  const zoom = (fator: number) => setPxManual(Math.min(48, Math.max(0.6, px * fator)));
  const irParaHoje = () => {
    const elemento = referencia.current;
    if (!elemento) return;
    elemento.scrollTo({ left: Math.max(0, posicao(hoje) - elemento.clientWidth / 2), behavior: "smooth" });
  };

  const exportarSvg = () => {
    const conteudo = gerarSvgGantt({
      titulo: titulo || "Cronograma da obra",
      inicio: dados.start, totalDias: dados.total, pxDia: px, hoje,
      linhas: filtradas.map(no => ({
        codigo:no.codigo,nome:no.nome,inicio:no.inicio,fim:no.fim,
        duracao:no.duracao,progresso:no.progresso,critica:no.critica,
        marco:no.marco,resumo:no.temFilhos,profundidade:no.profundidade,
      })),
      vinculos: mostrarSetas ? dependencias : [],
      baseline: baselinePronta ? filtradas.flatMap(no=>{
        const b=barrasBaseline.get(no.codigo);
        return b && !no.temFilhos ? [{codigo:no.codigo,inicio:b.inicio,fim:b.fim}] : [];
      }) : [],
    });
    const url = URL.createObjectURL(new Blob([conteudo],{type:"image/svg+xml;charset=utf-8"}));
    const link=document.createElement("a");
    link.href=url;
    link.download="cronograma-"+new Date().toISOString().slice(0,10)+".svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`pg${telaCheia ? " tela-cheia" : ""}${visaoAberta ? "" : " pg-visao-fechada"}${baselinePronta ? " pg-comparando-baseline" : ""}`}>
      <section className={`pg-visao${visaoAberta ? "" : " recolhida"}`} aria-label="Visão geral do cronograma">
        <button type="button" className="pg-visao-cabeca" onClick={alternarVisao} aria-expanded={visaoAberta} aria-controls="pg-visao-kpis">
          <span className={`pg-visao-seta${visaoAberta ? "" : " girada"}`} aria-hidden="true">
            <ChevronDown size={14} />
          </span>
          <span className="pg-visao-titulo">Visão geral</span>
          <span className="pg-visao-resumo">
            <span>{resumoDoPlano.atividades} atividades</span>
            <span>{resumoDoPlano.etapas} etapas</span>
            <span>término {fmtComAno(resumoDoPlano.fim, true)}</span>
            <span className="pg-visao-destaque">{Math.round(resumoDoPlano.executado)}% executado</span>
          </span>
        </button>
        {visaoAberta && (
          <dl className="pg-visao-kpis" id="pg-visao-kpis">
            <div>
              <dt>Período do plano</dt>
              <dd>
                {fmt(resumoDoPlano.inicio)} a {fmt(resumoDoPlano.fim)}
              </dd>
            </div>
            <div>
              <dt>Caminho crítico</dt>
              <dd>
                {totalCriticas} atividades
              </dd>
            </div>
            <div>
              <dt>Executado</dt>
              <dd>{Math.round(resumoDoPlano.executado)}%</dd>
            </div>
            <div>
              <dt>Escala atual</dt>
              <dd>{unidadeDaEscala(px)}</dd>
            </div>
          </dl>
        )}
      </section>

      <div className="pg-ferramentas">
        <div className="pg-escala">
          Escala: <strong>{unidadeDaEscala(px)}</strong>
          <span className="pg-escala-nota">
            {cpmValido ? `${totalCriticas} atividades no caminho crítico` : "CPM pendente ou desatualizado"}
          </span>
        </div>
        <div className="pg-filtros">
          <button type="button" className={`pg-chip${compararBaseline ? " ativo" : ""}`}
            disabled={!baselineDisponivel && !compararBaseline}
            aria-pressed={compararBaseline}
            aria-label="Comparar Gantt com baseline vigente"
            title={baselineDisponivel ? "Sobrepor cronograma atual à baseline vigente" : "Sem baseline vigente única ou data de obra válida"}
            onClick={onAlternarBaseline}>
            <GitBranch size={14} aria-hidden="true" />
            Baseline
          </button>
          <label className="pg-busca">
            <Search size={14} aria-hidden="true" />
            <input
              value={busca}
              onChange={evento => setBusca(evento.target.value)}
              placeholder="Buscar atividade ou EAP"
              aria-label="Buscar atividade no Gantt"
            />
          </label>
          <button
            type="button"
            className={`pg-chip${soCriticoAtivo ? " ativo" : ""}`}
            onClick={() => setSoCritico(valor => podeFiltrarCritico ? !valor : false)}
            disabled={!podeFiltrarCritico}
            aria-pressed={soCriticoAtivo}
            title={podeFiltrarCritico ? "Mostrar atividades críticas e suas etapas, inclusive recolhidas" :
              "Filtro indisponível: recalcule o CPM da versão atual antes de visualizar o caminho crítico"}
          >
            Só crítico
          </button>
          <button
            type="button"
            className={`pg-chip${mostrarSetas ? " ativo" : ""}`}
            onClick={() => setMostrarSetas(valor => !valor)}
            aria-pressed={mostrarSetas}
            title="Mostrar as ligações de dependência no gráfico"
          >
            <GitBranch size={14} aria-hidden="true" />
            Dependências
          </button>
          <button
            type="button"
            className={`pg-chip${mostrarAvanco ? " ativo" : ""}`}
            onClick={() => setMostrarAvanco(valor => !valor)}
            aria-pressed={mostrarAvanco}
            title="Mostrar a linha de avanço (onde cada atividade está de fato)"
          >
            <TrendingUp size={14} aria-hidden="true" />
            Avanço
          </button>
          <button
            type="button"
            className={`pg-chip${rotulos ? " ativo" : ""}`}
            onClick={() => setRotulos(valor => !valor)}
            aria-pressed={rotulos}
            title="Mostrar nome, código e datas junto das barras"
          >
            <Tags size={14} aria-hidden="true" />
            Rótulos
          </button>
        </div>
        <div className="pg-zoom" role="group" aria-label="Zoom do gráfico de Gantt">
          {temEtapas && (
            <>
              <button type="button" onClick={() => setColapsados(new Set())} aria-label="Expandir todas as etapas" title="Expandir todas as etapas">
                <ChevronsUpDown size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setColapsados(new Set(arvore.filter(no => no.temFilhos).map(no => no.chave)))}
                aria-label="Recolher todas as etapas"
                title="Recolher todas as etapas"
              >
                <ChevronsDownUp size={16} aria-hidden="true" />
              </button>
            </>
          )}
          <button type="button" onClick={() => zoom(1 / 1.6)} aria-label="Diminuir zoom" title="Diminuir zoom">
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoom(1.6)} aria-label="Aumentar zoom" title="Aumentar zoom">
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setPxManual(null)} aria-label="Ajustar a obra inteira à tela" title="Ajustar à tela">
            <Scan size={16} aria-hidden="true" />
            <span>Ajustar</span>
          </button>
          <button type="button" onClick={irParaHoje} aria-label="Ir para a data de hoje" title="Ir para hoje">
            <Crosshair size={16} aria-hidden="true" />
            <span>Hoje</span>
          </button>
          <button
            type="button"
            className={telaCheia ? "ativo" : undefined}
            onClick={() => setTelaCheia(valor => !valor)}
            aria-pressed={telaCheia}
            aria-label={telaCheia ? "Sair da tela cheia" : "Ver o Gantt em tela cheia"}
            title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          >
            {telaCheia ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
            <span>{telaCheia ? "Sair" : "Tela cheia"}</span>
          </button>
          <button type="button" onClick={() => window.print()} aria-label="Imprimir ou salvar o cronograma em PDF" title="Imprimir / PDF (paisagem)">
            <Printer size={16} aria-hidden="true" />
            <span>Imprimir / PDF</span>
          </button>
          <button type="button" onClick={exportarSvg} aria-label="Exportar o cronograma como arquivo SVG" title="Exportar Gantt completo em SVG (grade, barras, datas e ligações)">
            <Download size={16} aria-hidden="true" />
            <span>Exportar SVG</span>
          </button>
        </div>
      </div>

      <div className="pg-rolagem" ref={referencia}>
        <div className="pg-conteudo" style={{ width: esquerda + larguraDoTempo }}>
          <div className={`pg-cabecalho${datasNaVertical ? " vertical" : ""}`}>
            <div className="pg-cab-esquerda" style={{ width: esquerda }}>
              <div className="pg-cab-celulas" style={{ gridTemplateColumns: colunas }}>
                <span className="pg-cab-titulo">{estreita ? "Atividade" : "EAP · Atividade"}</span>
                {!estreita && (
                  <>
                    <span className="pg-cab-titulo pg-cab-num">Dur.</span>
                    <span className="pg-cab-titulo pg-cab-num">Início</span>
                    <span className="pg-cab-titulo pg-cab-num">Fim</span>
                  </>
                )}
                <span className="pg-cab-titulo pg-cab-num">%</span>
                {baselinePronta && !estreita && <span className="pg-cab-titulo pg-cab-num" title="Diferença de término em dias úteis da baseline">Δ fim</span>}
              </div>
              {!estreita && (
                <div
                  className={`pg-col-divisor${ajustandoColuna ? " ativo" : ""}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Ajustar a largura da coluna EAP e atividade"
                  aria-valuenow={larguraEsquerda}
                  aria-valuemin={300}
                  aria-valuemax={760}
                  tabIndex={0}
                  title="Arraste para alargar a planilha; duplo clique volta ao padrão"
                  onPointerDown={evento => {
                    evento.preventDefault();
                    inicioArraste.current = { x: evento.clientX, largura: esquerda };
                    setAjustandoColuna(true);
                  }}
                  onDoubleClick={() => setLarguraEsquerda(470)}
                  onKeyDown={evento => {
                    if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
                    evento.preventDefault();
                    setLarguraEsquerda(atual => Math.min(760, Math.max(300, atual + (evento.key === "ArrowRight" ? 12 : -12))));
                  }}
                />
              )}
            </div>
            <div className="pg-cab-tempo" style={{ width: larguraDoTempo }}>
              <div className="pg-faixa-meses">
                {meses.map(mes => (
                  <div key={mes.iso} className="pg-mes" style={{ left: mes.x, width: mes.largura }}>
                    {mes.largura >= 34 && <span>{mes.rotulo}</span>}
                  </div>
                ))}
              </div>
              <div className="pg-faixa-ticks">
                {ticks.map(tick => (
                  <div key={tick.iso} className="pg-tick" style={{ left: tick.x }}>
                    {tick.rotulo && <span className={datasNaVertical ? "vertical" : undefined}>{tick.rotulo}</span>}
                  </div>
                ))}
              </div>
              <div className="pg-hoje-rotulo" style={{ left: hojeX }}>
                hoje
              </div>
            </div>
          </div>

          <div className="pg-corpo">
            <div className="pg-fundo" style={{ left: esquerda, width: larguraDoTempo }} aria-hidden="true">
              {finsDeSemana.map(faixa => (
                <div key={faixa.x} className="pg-fim-de-semana" style={{ left: faixa.x, width: faixa.largura }} />
              ))}
              {meses.map(mes => (
                <div key={mes.iso} className="pg-mes-linha" style={{ left: mes.x }} />
              ))}
              <div className="pg-hoje-linha" style={{ left: hojeX }} />
              {inicioX != null && <div className="pg-inicio-obra" style={{ left: inicioX }} title="Início da obra" />}
            </div>

            {mostrarSetas && setas.length > 0 && (
              <svg
                className="pg-setas"
                width={larguraDoTempo}
                height={Math.max(1, filtradas.length * alturaLinha)}
                style={{ left: esquerda }}
                aria-hidden="true"
                data-export="gantt-svg"
                data-testid="gantt-dependency-layer"
              >
                <defs>
                  <marker id="pg-seta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" className="pg-seta-ponta" />
                  </marker>
                  <marker id="pg-seta-critica" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 z" className="pg-seta-ponta critica" />
                  </marker>
                </defs>
                {setas.map(seta => (
                  <path
                    key={seta.chave}
                    d={seta.d}
                    data-testid="gantt-dependency-path"
                    className={`pg-seta${seta.critica ? " critica" : ""}`}
                    markerEnd={`url(#${seta.critica ? "pg-seta-critica" : "pg-seta"})`}
                  />
                ))}
              </svg>
            )}

            {mostrarAvanco && avancos.trechos.length > 0 && (
              <svg
                className="pg-setas pg-avancos"
                width={larguraDoTempo}
                height={Math.max(1, filtradas.length * alturaLinha)}
                style={{ left: esquerda }}
                aria-hidden="true"
                data-export="gantt-svg"
              >
                {avancos.trechos.map((pontos, indice) => (
                  <polyline key={indice} points={pontos} className="pg-avanco-linha" />
                ))}
              </svg>
            )}

            {filtradas.length === 0 && (
              <div className="pg-vazio-filtro">
                {soCriticoAtivo
                  ? "Nenhuma atividade crítica corresponde à busca. Limpe a busca ou desligue “Só crítico”."
                  : "Nenhuma atividade corresponde à busca. Limpe o texto para mostrar a EAP."}
              </div>
            )}

            {filtradas.map((no, indice) => {
              const inicioBarra = Math.max(0, posicao(no.inicio));
              const larguraBarra = Math.max(6, Math.min(larguraDoTempo - inicioBarra, (Math.round((dateMs(no.fim)-dateMs(no.inicio))/86400000)+1) * px));
              const resumo = no.temFilhos;
              // Marco não tem barra: é um losango na data. O rótulo e o ponto de
              // avanço passam a nascer do losango, não do fim de uma barra.
              const marco = !resumo && no.marco;
              const fimVisual = marco ? inicioBarra : inicioBarra + larguraBarra;
              const descricao = marco
                ? `${no.codigo} ${no.nome} · marco em ${fmt(no.inicio)} · ${no.progresso >= 100 ? "concluído" : "não concluído"}${no.critica ? " · caminho crítico" : ""}`
                : `${no.codigo} ${no.nome} · ${fmt(no.inicio)} a ${fmt(no.fim)} · ${no.duracao} dias · ${Math.round(no.progresso)}% executado${no.critica ? " · caminho crítico" : ""}${resumo ? ` · ${no.filhos.length} atividade(s) abaixo` : ""}`;
              return (
                <div
                  key={no.chave}
                  className={`pg-linha${indice % 2 ? " alternada" : ""}${resumo ? " resumo" : ""}${selecionada === no.chave ? " selecionada" : ""}`}
                  style={{ height: alturaLinha }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selecionada === no.chave}
                  aria-label={`Detalhes de ${no.codigo} ${no.nome}`}
                  onClick={() => setSelecionada(no.chave)}
                  onKeyDown={evento => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      setSelecionada(no.chave);
                    }
                  }}
                >
                  <div className="pg-esquerda" style={{ width: esquerda }}>
                    <div className="pg-celulas" style={{ gridTemplateColumns: colunas }}>
                      <span className="pg-celula-atividade">
                        {no.temFilhos ? (
                          <button
                            type="button"
                            className="pg-toggle"
                            onClick={evento => {
                              evento.stopPropagation();
                              if (!soCriticoAtivo) alternar(no.chave);
                            }}
                            aria-expanded={soCriticoAtivo || !colapsados.has(no.chave)}
                            aria-label={`${colapsados.has(no.chave) && !soCriticoAtivo ? "Abrir" : "Fechar"} etapa ${no.codigo}`}
                            title={soCriticoAtivo ? "Filtro crítico: hierarquia expandida temporariamente" : colapsados.has(no.chave) ? "Abrir etapa" : "Fechar etapa"}
                            disabled={soCriticoAtivo}
                            style={{ marginLeft: no.profundidade * 10 }}
                          >
                            {soCriticoAtivo || !colapsados.has(no.chave) ? "−" : "+"}
                          </button>
                        ) : (
                          <span className="pg-toggle-vazio" style={{ marginLeft: no.profundidade * 10 }} aria-hidden="true" />
                        )}
                        {no.critica && !resumo && <i className="pg-ponto-critico" title="Caminho crítico" aria-hidden="true" />}
                        <span className="pg-codigo">{no.codigo}</span>
                        <span className="pg-nome" title={no.nome}>{no.nome}</span>
                      </span>
                      {!estreita && (
                        <>
                          <span className="pg-celula-num">{no.marco ? "marco" : `${no.duracao}d`}</span>
                          <span className="pg-celula-num">{fmt(no.inicio)}</span>
                          <span className="pg-celula-num">{fmt(no.fim)}</span>
                        </>
                      )}
                      <span className="pg-celula-num pg-celula-pct">{Math.round(no.progresso)}%</span>
                      {baselinePronta && !estreita && <span className={`pg-celula-num pg-delta-fim${(barrasBaseline.get(no.codigo)?.deltaFim??0)>0 ? " atraso" : (barrasBaseline.get(no.codigo)?.deltaFim??0)<0 ? " adiantada" : ""}`}
                        title="Variação do término em dias úteis do CPM, em comparação à baseline vigente">
                        {no.temFilhos ? "—" : barrasBaseline.get(no.codigo)?.deltaFim != null
                          ? `${barrasBaseline.get(no.codigo)!.deltaFim!>0?"+":""}${barrasBaseline.get(no.codigo)!.deltaFim}d`
                          : "—"}
                      </span>}
                    </div>
                  </div>
                  <div className="pg-trilho" style={{ width: larguraDoTempo }}>
                    {baselinePronta && !resumo && barrasBaseline.has(no.codigo) && (()=>{
                      const base=barrasBaseline.get(no.codigo)!;
                      const x=Math.max(0,posicao(base.inicio));
                      const dias=Math.round((dateMs(base.fim)-dateMs(base.inicio))/86400000)+1;
                      const w=Math.max(5,Math.min(larguraDoTempo-x,dias*px));
                      return <span className="pg-baseline-barra" data-testid="gantt-baseline-bar"
                        style={{left:x,width:w}} title={`Baseline ${base.inicio} a ${base.fim} · desvio de término ${base.deltaFim??"indisponível"} dias úteis`}/>;
                    })()}
                    {resumo ? (
                      <div className={`pg-resumo${no.critica ? " critica" : ""}`} style={{ left: inicioBarra, width: larguraBarra }} title={descricao}>
                        <i className="pg-resumo-avanco" style={{ width: `${no.progresso}%` }} />
                      </div>
                    ) : marco ? (
                      <span
                        className={`pg-marco${no.critica ? " critica" : ""}${no.progresso >= 100 ? " concluido" : ""}`}
                        style={{ left: inicioBarra }}
                        title={descricao}
                        aria-label={descricao}
                      />
                    ) : (
                      <>
                        <div
                          className={`pg-barra${no.critica ? " critica" : ""}${no.progresso >= 100 ? " concluida" : ""}`}
                          style={{ left: inicioBarra, width: larguraBarra }}
                          title={descricao}
                        >
                          {no.progresso > 0 && <i className="pg-barra-avanco" style={{ width: `${no.progresso}%` }} />}
                          {larguraBarra >= 52 && <span className="pg-barra-texto">{Math.round(no.progresso)}%</span>}
                        </div>
                        {larguraBarra < 18 && (
                          <span className="pg-barra-dias" style={{ left: inicioBarra + larguraBarra + 4 }}>{no.duracao}d</span>
                        )}
                      </>
                    )}
                    {rotulos &&
                      (() => {
                        // Rótulo fora da barra só entra se houver espaço; se não
                        // couber o nome inteiro, encurta o código ou some — do
                        // mesmo jeito que o Project evita sobreposição.
                        const sobra = larguraDoTempo - fimVisual - 8;
                        if (sobra < 30) return null;
                        const curto = sobra < 96;
                        const comDatas = sobra >= 240 && !resumo && !marco;
                        return (
                          <span
                            className={`pg-rotulo-barra${resumo ? " resumo" : ""}${no.critica ? " critica" : ""}`}
                            style={{ left: fimVisual + (marco ? 10 : 6), maxWidth: sobra }}
                          >
                            {curto ? no.codigo : `${no.codigo} ${no.nome}`}
                            {comDatas && (
                              <em>
                                {" "}
                                {fmt(no.inicio)} – {fmt(no.fim)}
                              </em>
                            )}
                            {marco && <em> {fmt(no.inicio)}</em>}
                          </span>
                        );
                      })()}
                    {mostrarAvanco && avancos.pontos.has(no.chave) && (
                      <span
                        className="pg-avanco-ponto"
                        style={{ left: avancos.pontos.get(no.chave) }}
                        title={`Avanço: ${Math.round(no.progresso)}%`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {baselinePronta && resumoBaseline && <section className="pg-baseline-resumo" aria-label="Resumo comparativo da baseline vigente">
        <strong>Comparação com a baseline</strong>
        <span title={nomeBaseline??""}>{nomeBaseline??"Vigente"}</span>
        <span><b>{resumoBaseline.atrasadas}</b> atrasadas</span>
        <span><b>{resumoBaseline.adiantadas}</b> adiantadas</span>
        <span><b>{resumoBaseline.novas}</b> novas</span>
        <span><b>{resumoBaseline.removidas}</b> removidas</span>
        <small>Δ fim em dias úteis CPM · datas civis convertidas com o calendário atual da obra · escopo removido consultável na aba Baseline</small>
      </section>}
      {detalhe && (
        <div className="pg-detalhe" role="status" aria-live="polite">
          <div className="pg-detalhe-topo">
            <strong>
              {detalhe.no.codigo} · {detalhe.no.nome}
            </strong>
            <button type="button" onClick={() => setSelecionada(null)} aria-label="Fechar detalhes da atividade">
              ×
            </button>
          </div>
          <dl>
            <div>
              <dt>Início</dt>
              <dd>{fmtComAno(detalhe.no.inicio, true)}</dd>
            </div>
            <div>
              <dt>Término</dt>
              <dd>{fmtComAno(detalhe.no.fim, true)}</dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>{detalhe.no.marco ? "marco (data única)" : `${detalhe.no.duracao} dias`}</dd>
            </div>
            <div>
              <dt>Executado</dt>
              <dd>{Math.round(detalhe.no.progresso)}%</dd>
            </div>
            <div>
              <dt>Folga total</dt>
              <dd>
                {detalhe.folga == null
                  ? "sem cálculo"
                  : detalhe.no.critica
                    ? "zero (crítica)"
                    : `${detalhe.folga} dia${detalhe.folga === 1 ? "" : "s"}`}
              </dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{detalhe.no.temFilhos ? "etapa (resumo)" : detalhe.no.marco ? "marco" : detalhe.no.critica ? "caminho crítico" : "com folga"}</dd>
            </div>
            {!detalhe.no.temFilhos && detalhe.atividadeId != null && detalhe.projetoId != null && (
              <div className="pg-detalhe-larga">
                <dt>Marco</dt>
                <dd>
                  <button
                    type="button"
                    className={`pg-detalhe-marco${detalhe.no.marco ? " ativo" : ""}`}
                    disabled={marcarMarco.isPending}
                    onClick={async () => {
                      if (detalhe.atividadeId == null || detalhe.projetoId == null) return;
                      setAlternandoMarco(true);
                      try {
                        await marcarMarco.mutateAsync({
                          projectId: detalhe.projetoId,
                          atividadeId: detalhe.atividadeId,
                          campo: "marco",
                          valor: detalhe.no.marco ? "0" : "1",
                        });
                      } finally {
                        setAlternandoMarco(false);
                      }
                    }}
                  >
                    {marcarMarco.isPending || alternandoMarco
                      ? "salvando…"
                      : detalhe.no.marco
                        ? "Voltar a ser atividade normal"
                        : "Transformar em marco (data única)"}
                  </button>
                </dd>
              </div>
            )}
            {baselinePronta && !detalhe.no.temFilhos && <div>
              <dt>Baseline vigente</dt>
              <dd>{barrasBaseline.has(detalhe.no.codigo)
                ? `${fmtComAno(barrasBaseline.get(detalhe.no.codigo)!.inicio,true)} a ${fmtComAno(barrasBaseline.get(detalhe.no.codigo)!.fim,true)} · Δ término ${barrasBaseline.get(detalhe.no.codigo)!.deltaFim??"—"} d úteis`
                : "Sem correspondência nesta baseline"}</dd>
            </div>}
            <div className="pg-detalhe-larga">
              <dt>Predecessoras</dt>
              <dd>{detalhe.predecessoras}</dd>
            </div>
            <div className="pg-detalhe-larga">
              <dt>Sucessoras</dt>
              <dd>{detalhe.sucessoras}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="pg-legenda">
        <span><i className="pg-amostra normal" /> executada</span>
        {baselinePronta && <span><i className="pg-amostra pg-amostra-baseline" /> baseline vigente</span>}
        <span><i className="pg-amostra critica" /> caminho crítico</span>
        <span><i className="pg-amostra marco" /> marco</span>
        <span><i className="pg-amostra hoje" /> hoje</span>
        <span><i className="pg-amostra semana" /> fim de semana</span>
        {mostrarSetas && <span><i className="pg-amostra ligacao" /> dependência</span>}
        {mostrarAvanco && <span><i className="pg-amostra avanco" /> avanço real</span>}
        <span>Clique numa linha para ver datas, folga e ligações.</span>
        {inicioObra && <span>Início da obra: {fmtComAno(inicioObra, true)}</span>}
      </div>

      {/* Impressão / PDF: portal no body, escondido na tela e visível só no papel. */}
      {createPortal(
        <div className="pg-impressao">
          <table className="pgp">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "21%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "51%" }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={6} className="pgp-titulo">
                  <strong>{titulo || "Cronograma"}</strong>
                  <span className="pgp-sub">
                    {[codigoObra, localObra].filter(Boolean).join(" · ")}
                    {[codigoObra, localObra].filter(Boolean).length ?  " · " : ""}
                    Planejamento · emitido em {fmtComAno(hoje, true)}
                  </span>
                </th>
                <th className="pgp-titulo pgp-titulo-tempo">
                  <span className="pgp-escala">
                    Escala {unidadeDaEscala(px)} · {fmtComAno(dados.start, true)} a {fmtComAno(dados.end, true)}
                  </span>
                  <span className="pgp-sub">
                    {impressao.linhas.length} linha{impressao.linhas.length === 1 ? "" : "s"}
                    {termo ? ` · busca “${termo}”` : ""}
                    {soCriticoAtivo ? " · só caminho crítico" : ""}
                  </span>
                </th>
              </tr>
              <tr className="pgp-cab">
                <th className="pgp-cod">EAP</th>
                <th className="pgp-nome">Atividade</th>
                <th className="pgp-num">Dur.</th>
                <th className="pgp-num">Início</th>
                <th className="pgp-num">Fim</th>
                <th className="pgp-num">%</th>
                <th className="pgp-tempo">
                  <span className="pgp-meses">
                    {impressao.meses.map(mes => (
                      <span key={`${mes.rotulo}-${mes.esquerda}`} style={{ left: `${mes.esquerda}%`, width: `${mes.largura}%` }}>
                        {mes.virada ? mes.rotulo : ""}
                      </span>
                    ))}
                    <i className="pgp-hoje" style={{ left: `${impressao.hoje}%` }} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {impressao.linhas.map(({ no, esquerda, largura }) => (
                <tr key={no.chave} className={no.temFilhos ? "pgp-etapa" : undefined}>
                  <td className="pgp-cod">{no.codigo}</td>
                  <td className="pgp-nome" style={{ paddingLeft: 3 + (no.codigo.split(".").length - 1) * 9 }}>{no.nome}</td>
                  <td className="pgp-num">{no.marco ? "marco" : `${no.duracao}d`}</td>
                  <td className="pgp-num">{fmt(no.inicio)}</td>
                  <td className="pgp-num">{no.marco ? fmt(no.inicio) : fmt(no.fim)}</td>
                  <td className="pgp-num">{Math.round(no.progresso)}%</td>
                  <td className="pgp-trilho" style={{ ["--pgp-hoje" as string]: `${impressao.hoje}%` } as React.CSSProperties}>
                    {no.temFilhos ? (
                      <span className="pgp-resumo" style={{ left: `${esquerda}%`, width: `${largura}%` }} />
                    ) : no.marco ? (
                      <span className={`pgp-losango${no.critica ? " critica" : ""}`} style={{ left: `${esquerda}%` }} />
                    ) : (
                      <span className={`pgp-barra${no.critica ? " critica" : ""}`} style={{ left: `${esquerda}%`, width: `${largura}%` }}>
                        <b style={{ width: `${Math.max(0, Math.min(100, no.progresso))}%` }} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="pgp-pe">
                  <span><i className="pgp-amostra barra" /> atividade</span>
                  <span><i className="pgp-amostra resumo" /> etapa</span>
                  <span><i className="pgp-amostra critica" /> caminho crítico</span>
                  <span><i className="pgp-amostra losango" /> marco</span>
                  <span><i className="pgp-amostra hoje" /> hoje</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>,
        document.body
      )}
    </div>
  );
}

