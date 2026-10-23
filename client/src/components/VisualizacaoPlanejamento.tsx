import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronsDownUp, ChevronsUpDown, Crosshair, GitBranch, GanttChartSquare, Scan, ZoomIn, ZoomOut } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";
import { linhasVisiveis, montarArvore, type NoDoGantt } from "@shared/gantt-arvore";

type Props = {
  linhas: EntradaDaLinha[];
  inicioObra: IsoDate | null;
  hoje: IsoDate;
  projetoId: number;
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
}: Props & { view?: PlanejamentoView }) {
  const planejamento = trpc.planning.list.useQuery(
    { projectId: Number(projetoId) },
    { enabled: view === "gantt" && Number(projetoId) > 0 }
  );
  const atividades = planejamento.data?.activities ?? [];
  const atividadePorCodigo = useMemo(
    () => new Map(atividades.map(activity => [activity.wbsCode, activity])),
    [atividades]
  );
  const cpmCalculado = atividades.length > 0 && atividades.some(activity => activity.cpmCalculatedAt);

  const dados = useMemo(() => {
    if (!linhas.length) return null;
    const min = linhas.reduce((v, l) => Math.min(v, dateMs(l.inicio)), dateMs(linhas[0]!.inicio));
    const max = linhas.reduce(
      (v, l) => Math.max(v, dateMs(l.inicio) + Math.max(1, l.duracao - 1) * 86400000),
      min
    );
    const inicio = new Date(min);
    inicio.setUTCDate(1);
    const fim = new Date(max);
    fim.setUTCDate(1);
    fim.setUTCMonth(fim.getUTCMonth() + 1);
    const start = inicio.toISOString().slice(0, 10);
    const end = fim.toISOString().slice(0, 10);
    const total = Math.max(1, Math.round((dateMs(end) - dateMs(start)) / 86400000));
    return { start, end, total };
  }, [linhas]);

  if (!dados) {
    return (
      <div className="pl-visual-vazio">
        <h3>{view === "gantt" ? "Gantt" : "Linha de Balanço"}</h3>
        <p>Crie atividades no planejamento para visualizar esta ferramenta.</p>
      </div>
    );
  }

  return (
    <section className="pl-visual pl-visual-full">
      <header className="pl-visual-header">
        <div>
          <strong>{view === "gantt" ? "GANTT — PLANEJAMENTO DA OBRA" : "LINHA DE BALANÇO — FLUXO DA PRODUÇÃO"}</strong>
          <span>{view === "gantt" ? "Sequência, duração, avanço e caminho crítico" : "Tempo no eixo horizontal · locais no eixo vertical · ritmo das equipes"}</span>
        </div>
      </header>
      {view === "gantt" && !cpmCalculado && atividades.length > 0 && (
        <div className="pl-gantt-cpm-aviso">
          O Gantt está usando o início/duração informados. Calcule o CPM para destacar o caminho crítico do plano.
        </div>
      )}
      {view === "gantt" && planejamento.isError && (
        <div className="pl-gantt-cpm-aviso erro">
          Não foi possível carregar o estado do CPM: {planejamento.error.message}
        </div>
      )}
      {view === "gantt" ? (
        <Gantt linhas={linhas} atividades={atividadePorCodigo} dados={dados} hoje={hoje} inicioObra={inicioObra} />
      ) : (
        <LinhaDeBalanco linhas={linhas} dados={dados} hoje={hoje} />
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

function mesCurto(iso: string): string {
  const [ano, mes] = iso.split("-");
  return `${mes}/${ano.slice(2)}`;
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
  dados,
  hoje,
  inicioObra,
}: {
  linhas: EntradaDaLinha[];
  atividades: Map<string, { critical: number; totalFloat: number | null; cpmCalculatedAt: Date | string | null }>;
  dados: { start: string; end: string; total: number };
  hoje: IsoDate;
  inicioObra: IsoDate | null;
}) {
  const referencia = useRef<HTMLDivElement | null>(null);
  const [larguraVisivel, setLarguraVisivel] = useState(1200);
  // Abre na escala semanal (7px por dia), como o Project: uma obra de 820 dias
  // "ajustada" na tela vira 6px de barra e não comunica nada. O botão Ajustar
  // continua ali para quem quer a visão do todo.
  const [pxManual, setPxManual] = useState<number | null>(7);
  const estreita = useTelaEstreita();

  // Planilha do Gantt: no desktop, EAP+atividade, duração, início, fim e avanço;
  // no celular, atividade e avanço.
  const esquerda = estreita ? 168 : 470;
  const alturaLinha = estreita ? 46 : 30;
  const colunas = estreita ? "minmax(0,1fr) 40px" : "minmax(0,1fr) 46px 66px 66px 42px";

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
        const [ano] = ini.split("-");
        const viradaDeAno = ini.slice(5, 7) === "01" || lista.length === 0;
        lista.push({ iso: ini, x: inicioVisivel, largura: fimVisivel - inicioVisivel, rotulo: viradaDeAno ? `${mesCurto(ini)}/${ano}` : mesCurto(ini) });
      }
      cursor = proximo;
    }
    return lista;
  }, [dados.start, dados.end, px, larguraDoTempo]);

  const ticks = useMemo(() => {
    const passo = px >= 22 ? 1 : px >= 8 ? 7 : px >= 3.2 ? 14 : 30;
    const comRotulo = passo * px >= 38;
    const lista: { iso: string; x: number; rotulo: string | null }[] = [];
    for (let d = 0; d <= dados.total; d += passo) {
      const iso = addDays(dados.start, d);
      lista.push({ iso, x: d * px, rotulo: comRotulo ? fmtComAno(iso, false) : null });
    }
    return lista;
  }, [dados.start, dados.total, px]);

  const finsDeSemana = useMemo(() => {
    const faixas: { x: number; largura: number }[] = [];
    for (let d = 0; d < dados.total; d++) {
      const dia = new Date(`${addDays(dados.start, d)}T12:00:00Z`).getUTCDay();
      if (dia === 0 || dia === 6) faixas.push({ x: d * px, largura: px });
    }
    return faixas;
  }, [dados.start, dados.total, px]);

  const totalCriticas = Array.from(atividades.values()).filter(item => item.critical === 1).length;

  // Árvore da EAP (etapas recolhíveis, como no Project) e o que está visível.
  const codigosCriticos = useMemo(
    () =>
      new Set(
        Array.from(atividades.entries())
          .filter(([, item]) => item.critical === 1)
          .map(([codigo]) => codigo)
      ),
    [atividades]
  );
  const arvore = useMemo(() => montarArvore(linhas, codigosCriticos), [linhas, codigosCriticos]);
  const [colapsados, setColapsados] = useState<Set<string>>(() => new Set());
  const temEtapas = arvore.some(no => no.temFilhos);
  const visiveis = useMemo(() => linhasVisiveis(arvore, colapsados), [arvore, colapsados]);
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

  return (
    <div className="pg">
      <div className="pg-ferramentas">
        <div className="pg-escala">
          Escala: <strong>{unidadeDaEscala(px)}</strong>
          <span className="pg-escala-nota">
            {totalCriticas > 0 ? `${totalCriticas} atividades no caminho crítico` : "CPM não calculado"}
          </span>
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
        </div>
      </div>

      <div className="pg-rolagem" ref={referencia}>
        <div className="pg-conteudo" style={{ width: esquerda + larguraDoTempo }}>
          <div className="pg-cabecalho">
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
              </div>
            </div>
            <div className="pg-cab-tempo" style={{ width: larguraDoTempo }}>
              <div className="pg-faixa-meses">
                {meses.map(mes => (
                  <div key={mes.iso} className="pg-mes" style={{ left: mes.x, width: mes.largura }}>
                    <span>{mes.rotulo}</span>
                  </div>
                ))}
              </div>
              <div className="pg-faixa-ticks">
                {ticks.map(tick => (
                  <div key={tick.iso} className="pg-tick" style={{ left: tick.x }}>
                    {tick.rotulo && <span>{tick.rotulo}</span>}
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

            {visiveis.map((no, indice) => {
              const inicioBarra = Math.max(0, posicao(no.inicio));
              const larguraBarra = Math.max(6, Math.min(larguraDoTempo - inicioBarra, Math.max(1, no.duracao) * px));
              const resumo = no.temFilhos;
              const descricao = `${no.codigo} ${no.nome} · ${fmt(no.inicio)} a ${fmt(no.fim)} · ${no.duracao} dias · ${Math.round(no.progresso)}% executado${no.critica ? " · caminho crítico" : ""}${resumo ? ` · ${no.filhos.length} atividade(s) abaixo` : ""}`;
              return (
                <div
                  key={no.chave}
                  className={`pg-linha${indice % 2 ? " alternada" : ""}${resumo ? " resumo" : ""}`}
                  style={{ height: alturaLinha }}
                >
                  <div className="pg-esquerda" style={{ width: esquerda }}>
                    <div className="pg-celulas" style={{ gridTemplateColumns: colunas }}>
                      <span className="pg-celula-atividade">
                        {no.temFilhos ? (
                          <button
                            type="button"
                            className="pg-toggle"
                            onClick={() => alternar(no.chave)}
                            aria-expanded={!colapsados.has(no.chave)}
                            aria-label={`${colapsados.has(no.chave) ? "Abrir" : "Fechar"} etapa ${no.codigo}`}
                            title={colapsados.has(no.chave) ? "Abrir etapa" : "Fechar etapa"}
                            style={{ marginLeft: no.profundidade * 10 }}
                          >
                            {colapsados.has(no.chave) ? "+" : "−"}
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
                          <span className="pg-celula-num">{no.duracao}d</span>
                          <span className="pg-celula-num">{fmt(no.inicio)}</span>
                          <span className="pg-celula-num">{fmt(no.fim)}</span>
                        </>
                      )}
                      <span className="pg-celula-num pg-celula-pct">{Math.round(no.progresso)}%</span>
                    </div>
                  </div>
                  <div className="pg-trilho" style={{ width: larguraDoTempo }}>
                    {resumo ? (
                      <div className={`pg-resumo${no.critica ? " critica" : ""}`} style={{ left: inicioBarra, width: larguraBarra }} title={descricao}>
                        <i className="pg-resumo-avanco" style={{ width: `${no.progresso}%` }} />
                      </div>
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pg-legenda">
        <span><i className="pg-amostra normal" /> executada</span>
        <span><i className="pg-amostra critica" /> caminho crítico</span>
        <span><i className="pg-amostra hoje" /> hoje</span>
        <span><i className="pg-amostra semana" /> fim de semana</span>
        {inicioObra && <span>Início da obra: {fmtComAno(inicioObra, true)}</span>}
      </div>
    </div>
  );
}

function LinhaDeBalanco({
  linhas,
  dados,
  hoje,
}: {
  linhas: EntradaDaLinha[];
  dados: { start: string; end: string; total: number };
  hoje: IsoDate;
}) {
  // Modelo Prevision: tempo no eixo X, localizações no eixo Y.
  // Cada serviço repetitivo vira uma faixa colorida por localização e uma
  // linha de ritmo que conecta o início do serviço entre os pavimentos.
  const locations = Array.from(
    new Set(linhas.map(l => l.pavimento || l.frente).filter(Boolean))
  );
  const locationOrder = [...locations].sort((a, b) => {
    const na = Number(String(a).match(/-?\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
    const nb = Number(String(b).match(/-?\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  });

  const servicos = Array.from(
    new Map(
      linhas.map(l => {
        const key = l.atividade.trim().toLocaleLowerCase("pt-BR");
        return [key, l.atividade.trim()];
      })
    ).entries()
  ).map(([key, label]) => ({ key, label }));

  const rolagem = useRef<HTMLDivElement | null>(null);
  const [larguraVisivel, setLarguraVisivel] = useState(1100);
  const [pxManual, setPxManual] = useState<number | null>(4.5);

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) return;
    const medir = () => setLarguraVisivel(elemento.clientWidth || 1100);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const left = 172;
  const right = 56;
  const top = 82;
  const bottom = 46;
  const rowH = 44;
  // Escala de leitura padrão: 4,5px por dia (~135px por mês). "Ajustar" espreme a
  // obra inteira na tela; os botões de zoom vão de 0,6 a 48px por dia.
  const pxAjustado = Math.max(0.8, (larguraVisivel - left - right - 8) / Math.max(1, dados.total));
  const pxPerDay = pxManual ?? pxAjustado;
  const width = Math.round(left + right + dados.total * pxPerDay);
  const height = Math.max(420, top + Math.max(1, locationOrder.length) * rowH + bottom);
  const x = (iso: string) =>
    left + ((dateMs(iso) - dateMs(dados.start)) / 86400000) * pxPerDay;
  const yByLocation = new Map(locationOrder.map((location, i) => [location, top + i * rowH + rowH / 2]));

  const monthTicks: string[] = [];
  let cursor = new Date(`${dados.start}T12:00:00Z`);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= dateMs(dados.end)) {
    monthTicks.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const weekTicks: string[] = [];
  for (let d = 0; d <= dados.total; d += 7) weekTicks.push(addDays(dados.start, d));

  const fmtMes = (iso: string) => {
    const [y, m] = iso.split("-");
    return `${m}/${y.slice(2)}`;
  };

  const hojeX = Math.max(left, Math.min(width - right, x(hoje)));
  const irParaHoje = () => {
    const elemento = rolagem.current;
    if (!elemento) return;
    elemento.scrollTo({ left: Math.max(0, hojeX - elemento.clientWidth / 2), behavior: "smooth" });
  };

  return (
    <div className="pg">
      <div className="pg-ferramentas">
        <div className="pg-escala">
          Escala: <strong>{unidadeDaEscala(pxPerDay)}</strong>
          <span className="pg-escala-nota">
            {locationOrder.length} locais · {servicos.length} serviços
          </span>
        </div>
        <div className="pg-zoom" role="group" aria-label="Zoom da linha de balanço">
          <button type="button" onClick={() => setPxManual(Math.min(48, Math.max(0.6, pxPerDay / 1.6)))} aria-label="Diminuir zoom" title="Diminuir zoom">
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setPxManual(Math.min(48, Math.max(0.6, pxPerDay * 1.6)))} aria-label="Aumentar zoom" title="Aumentar zoom">
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setPxManual(pxAjustado)} aria-label="Ajustar a obra inteira à tela" title="Ajustar à tela">
            <Scan size={16} aria-hidden="true" />
            <span>Ajustar</span>
          </button>
          <button type="button" onClick={irParaHoje} aria-label="Ir para a data de hoje" title="Ir para hoje">
            <Crosshair size={16} aria-hidden="true" />
            <span>Hoje</span>
          </button>
        </div>
      </div>

      <div className="pg-rolagem" ref={rolagem}>
        <svg
          className="pl-lob pl-lob-prevision"
          style={{ width, maxWidth: "none" }}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Linha de balanço: tempo no eixo horizontal, localizações no eixo vertical"
        >
          <rect x="0" y="0" width={width} height={height} className="pl-lob-bg" />

          <text x="14" y="22" className="pl-gantt-title">LINHA DE BALANÇO</text>
          <text x="14" y="43" className="pl-lob-subtitle">
            RITMO DAS EQUIPES POR LOCAL
          </text>

        <rect x={left} y="28" width={width - left - right} height="28" className="pl-lob-header" />
        {monthTicks.map(month => {
          const xx = x(month);
          return (
            <g key={month}>
              <line x1={xx} x2={xx} y1="28" y2={height - bottom} className="pl-lob-month-grid" />
              <text x={xx + 6} y="45" className="pl-lob-month">{fmtMes(month)}</text>
            </g>
          );
        })}

        {weekTicks.filter(d => dateMs(d) <= dateMs(dados.end)).map(d => {
          const xx = x(d);
          return (
            <g key={d}>
              <line x1={xx} x2={xx} y1={56} y2={height - bottom} className="pl-lob-week-grid" />
              <text x={xx + 2} y="68" className="pl-lob-date">{fmt(d)}</text>
            </g>
          );
        })}

        <text x={left - 12} y="45" textAnchor="end" className="pl-lob-axis-title">
          FRENTE / LOCAL
        </text>

        {locationOrder.map((location, i) => {
          const yy = yByLocation.get(location)!;
          return (
            <g key={location}>
              <rect
                x="0"
                y={yy - rowH / 2}
                width={width}
                height={rowH}
                className={i % 2 ? "pl-lob-row alt" : "pl-lob-row"}
              />
              <line x1={left} x2={width - right} y1={yy + rowH / 2} y2={yy + rowH / 2} className="pl-lob-row-grid" />
              <text x={left - 12} y={yy + 4} textAnchor="end" className="pl-lob-location">
                {location}
              </text>
            </g>
          );
        })}

        {servicos.map((servico, serviceIndex) => {
          const pontos = linhas
            .filter(l => l.atividade.trim().toLocaleLowerCase("pt-BR") === servico.key)
            .filter(l => Boolean(l.pavimento || l.frente))
            .map(l => {
              const location = l.pavimento || l.frente;
              const yy = yByLocation.get(location);
              if (yy == null) return null;
              const startX = x(l.inicio);
              const endX = x(addDays(l.inicio, Math.max(1, l.duracao) - 1));
              return {
                location,
                x: startX,
                y: yy,
                width: Math.max(8, endX - startX),
                duracao: l.duracao,
                codigo: l.codigo,
              };
            })
            .filter(Boolean) as Array<{ location: string; x: number; y: number; width: number; duracao: number; codigo: string }>;

          if (!pontos.length) return null;

          const colorClass = `lob-service-${serviceIndex % 8}`;
          const linha = [...pontos].sort((a, b) => a.y - b.y);
          const polyline = linha.length > 1
            ? linha.map(p => `${p.x},${p.y}`).join(" ")
            : "";

          return (
            <g key={servico.key}>
              {polyline && (
                <polyline points={polyline} className={`pl-lob-rhythm ${colorClass}`} />
              )}
              {pontos.map(p => (
                <g key={`${servico.key}-${p.location}-${p.codigo}`}>
                  <title>{`${servico.label} · ${p.location} · ${p.duracao} dias · início ${fmt(pontos.length ? linhas.find(l => l.codigo === p.codigo)?.inicio || dados.start : dados.start)}`}</title>
                  <rect
                    x={p.x}
                    y={p.y - 10}
                    width={p.width}
                    height="20"
                    rx="2"
                    className={`pl-lob-service ${colorClass}`}
                  />
                  {p.width > 55 && (
                    <text x={p.x + 5} y={p.y + 4} className="pl-lob-service-label">
                      {servico.label.slice(0, 24)}
                    </text>
                  )}
                </g>
              ))}
              {linha.length > 1 && (
                <text
                  x={linha[linha.length - 1]!.x + linha[linha.length - 1]!.width + 8}
                  y={linha[linha.length - 1]!.y + 4}
                  className={`pl-lob-rhythm-label ${colorClass}`}
                >
                  {servico.label}
                </text>
              )}
            </g>
          );
        })}

        <line x1={left} x2={width - right} y1={56} y2={56} className="pl-lob-axis" />
        <line x1={left} x2={left} y1={56} y2={height - bottom} className="pl-lob-axis" />
        <line x1={hojeX} x2={hojeX} y1="28" y2={height - bottom} className="pg-hoje-linha" />
        <text x={hojeX + 4} y="22" className="pl-gantt-hoje-label">HOJE</text>
        <text x={width / 2} y={height - 12} textAnchor="middle" className="pl-lob-caption">
          TEMPO →
        </text>
        </svg>
      </div>

      <div className="pg-legenda">
        <span><i className="pg-amostra normal" /> serviço executado no local</span>
        <span><i className="pg-amostra" style={{ background: "#b3261e", width: 2, height: 12 }} /> hoje</span>
        <span>As linhas ligam o mesmo serviço entre locais: a inclinação é o ritmo da equipe.</span>
        <span>Eixo vertical: pavimento ou frente informada em cada atividade.</span>
      </div>
    </div>
  );
}
