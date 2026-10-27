import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Download, ListTodo, Maximize2, Search, ZoomIn, ZoomOut } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";
import {
  dataValida, diaUtc, prepararLinhaBalancoVertical,
  type PontoLob, type SerieLob,
} from "./linha-balanco-modelo";
import "./linha-balanco-profissional.css";

export { prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

type Props = {
  linhas: EntradaDaLinha[];
  finsCalculados: Record<string, string>;
  hoje: IsoDate;
  onAbrirAtividades: () => void;
};
type Escala = "dia" | "semana" | "quinzena" | "mes";
type Barra = { serie: SerieLob; ponto: PontoLob; cor: string; indice: number };
const DIA = 86400000;
const COLUNA = 168;
const CORES = ["#176fc0", "#d2792e", "#268148", "#8259b5", "#b54a62", "#258599", "#a47b21"];
const ESCALAS: Record<Escala, number> = { dia: 28, semana: 19, quinzena: 10, mes: 5 };

const adicionarDias = (iso: string, dias: number) =>
  new Date(diaUtc(iso) + dias * DIA).toISOString().slice(0, 10);
const formatoCurto = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const formatoCompleto = (iso: string) => formatoCurto(iso) + "/" + iso.slice(0, 4);
function segundaDaSemana(iso: string): string {
  const dia = new Date(diaUtc(iso)).getUTCDay();
  return adicionarDias(iso, -((dia + 6) % 7));
}
function normalizarCelulaCsv(valor: string | number | null): string {
  const texto = String(valor ?? "");
  // Evita execução acidental de fórmula ao abrir CSV no Excel.
  const seguro = /^[\s]*[=+\-@]/.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replace(/"/g, '""') + '"';
}

function selecionarPeriodoPelosServicos(series: SerieLob[]): { primeiro: string; ultimo: string } | null {
  const pontos = series.flatMap(s => s.pontos);
  if (!pontos.length) return null;
  return {
    primeiro: pontos.reduce((min, p) => p.inicio < min ? p.inicio : min, pontos[0]!.inicio),
    ultimo: pontos.reduce((max, p) => p.fim > max ? p.fim : max, pontos[0]!.fim),
  };
}

/**
 * Cronograma de produção em escadinha, integrado à interface CLÁSSICA.
 * Calendário no eixo horizontal, pavimentos no vertical; cada barra usa
 * exclusivamente datas da planning.grade, sem inventar produtividade ou execução.
 * Não cria nem altera versões do plano. Filtros e exportação são somente leitura.
 */
export function LinhaBalancoEscadinha({ linhas, finsCalculados, hoje, onAbrirAtividades }: Props) {
  const dados = useMemo(
    () => prepararLinhaBalancoVertical(linhas, finsCalculados),
    [linhas, finsCalculados],
  );
  const repetitivas = useMemo(() => dados.series.filter(s => s.repetitiva), [dados.series]);
  const [busca, setBusca] = useState("");
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const [pavimento, setPavimento] = useState("todos");
  const [escala, setEscala] = useState<Escala>("semana");
  const [pxManual, setPxManual] = useState<number | null>(null);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [detalhe, setDetalhe] = useState<Barra | null>(null);
  const rolagem = useRef<HTMLDivElement | null>(null);

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const seriesVisiveis = repetitivas.filter(s =>
    !ocultas.has(s.chave) &&
    (s.nome + " " + s.pontos.map(p => p.codigo).join(" ")).toLocaleLowerCase("pt-BR").includes(termo)
  );
  // Descarta categorias antigas usadas equivocadamente no campo pavimento:
  // apenas unidades de serviços repetitivos entram no eixo físico.
  const locaisValidos = Array.from(new Set(repetitivas.flatMap(s => s.pontos.map(p => p.local))))
    .sort((a, b) => b.localeCompare(a, "pt-BR", { numeric: true }));
  const locais = locaisValidos.filter(p => pavimento === "todos" || p === pavimento);
  const pontosVisiveis = seriesVisiveis.map(s => ({
    ...s, pontos: s.pontos.filter(p => locais.includes(p.local)),
  }));
  const periodoAutomatico = selecionarPeriodoPelosServicos(pontosVisiveis);
  const baseInicio = periodoAutomatico?.primeiro ?? "2026-01-01";
  const baseFim = periodoAutomatico?.ultimo ?? baseInicio;
  const inicioEscolhido = dataValida(dataInicial) ? dataInicial : baseInicio;
  const fimEscolhido = dataValida(dataFinal) ? dataFinal : baseFim;
  const periodoInvalido = diaUtc(fimEscolhido) < diaUtc(inicioEscolhido);
  const eixoInicio = segundaDaSemana(adicionarDias(inicioEscolhido, -7));
  const eixoFim = segundaDaSemana(adicionarDias(fimEscolhido, 14));
  const eixoFimExclusivo = adicionarDias(eixoFim, 7);
  const diasNoEixo = Math.max(1, Math.round((diaUtc(eixoFimExclusivo) - diaUtc(eixoInicio)) / DIA));
  const pxDia = pxManual ?? ESCALAS[escala];
  const larguraTempo = Math.max(1, diasNoEixo * pxDia);
  const alturaLinha = Math.max(64, 14 + seriesVisiveis.length * 23);
  const dataX = (iso: string) => ((diaUtc(iso) - diaUtc(eixoInicio)) / DIA) * pxDia;

  // Cabeçalhos com meses civis verdadeiros e semanas começando na segunda.
  const meses: { inicio: string; texto: string; x: number; largura: number }[] = [];
  if (!periodoInvalido) {
    const cursor = new Date(diaUtc(eixoInicio));
    cursor.setUTCDate(1);
    for (let i = 0; i < 120 && cursor.getTime() < diaUtc(eixoFimExclusivo); i++) {
      const inicio = cursor.toISOString().slice(0, 10);
      const proximo = new Date(cursor);
      proximo.setUTCMonth(proximo.getUTCMonth() + 1);
      const fim = proximo.toISOString().slice(0, 10);
      const a = Math.max(0, dataX(inicio));
      const b = Math.min(larguraTempo, dataX(fim));
      if (b > a) {
        const titulo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor);
        meses.push({ inicio, texto: titulo, x: a, largura: b - a });
      }
      cursor.setTime(proximo.getTime());
    }
  }

  const semanas: { inicio: string; x: number }[] = [];
  for (let i = 0; i < diasNoEixo && i < 3650 && !periodoInvalido; i += 7) {
    const inicio = adicionarDias(eixoInicio, i);
    semanas.push({ inicio, x: i * pxDia });
  }

  const barrasPorLocal = new Map<string, Barra[]>();
  for (const local of locais) {
    const barras: Barra[] = [];
    seriesVisiveis.forEach((serie, indice) => {
      const ponto = serie.pontos.find(p => p.local === local);
      if (ponto) barras.push({ serie, ponto, cor: CORES[repetitivas.findIndex(s => s.chave === serie.chave) % CORES.length]!, indice });
    });
    barrasPorLocal.set(local, barras);
  }

  const qtdBarras = Array.from(barrasPorLocal.values()).reduce((s, b) => s + b.length, 0);

  function alterarSerie(chave: string, visivel: boolean) {
    setOcultas(anterior => {
      const proximo = new Set(anterior);
      if (visivel) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
    setDetalhe(null);
    setPxManual(null);
  }

  function exportarCsv() {
    const linhasCsv = [["Serviço", "EAP", "Pavimento", "Início", "Término", "Quantidade", "Unidade", "Executado"]];
    seriesVisiveis.forEach(serie => {
      serie.pontos.filter(p => locais.includes(p.local)).forEach(p => {
        linhasCsv.push([serie.nome, p.codigo, p.local, p.inicio, p.fim, String(p.quantidade ?? ""), p.unidade ?? "", String(p.executado)]);
      });
    });
    const conteudo = "\uFEFF" + linhasCsv.map(celulas => celulas.map(normalizarCelulaCsv).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "arquimedes-linha-de-balanco.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="lob-stairs" aria-label="Linha de Balanço — escadinha do cronograma">
      <header className="lob-stairs-heading">
        <div>
          <div className="lob-stairs-eyebrow">ARQUIMEDES · CRONOGRAMA DA OBRA</div>
          <h2>Linha de Balanço</h2>
          <p>Planejamento por pavimentos e frentes de serviço · datas reais da grade do cronograma</p>
        </div>
        <div className="lob-stairs-heading-actions">
          <button type="button" onClick={onAbrirAtividades}><ListTodo size={16}/> Editar atividades</button>
          <button type="button" onClick={exportarCsv} disabled={!qtdBarras} title="Exportar apenas serviços e pavimentos visíveis"><Download size={16}/> Exportar CSV</button>
        </div>
      </header>

      {repetitivas.length === 0 ? (
        <div className="lob-stairs-empty" role="status">
          <h3>LINHA DE RITMO AINDA NÃO DISPONÍVEL</h3>
          <p>O cronograma ainda não contém o mesmo serviço em dois ou mais pavimentos físicos distintos. A escadinha não une atividades diferentes ou disciplinas como se fossem pavimentos.</p>
          <p>{dados.semLocal} atividade(s) sem local · {dados.descartadas} sem período válido ou marcos.</p>
          <div className="lob-stairs-empty-actions">
            <button type="button" onClick={onAbrirAtividades}>Revisar atividades e locais</button>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("abrir-aba", { detail: { aba: "gantt" } }))}>Ver cronograma no Gantt</button>
          </div>
        </div>
      ) : (
        <>
          <div className="lob-stairs-toolbar">
            <label className="lob-stairs-field lob-stairs-period">
              <span><CalendarDays size={13}/> Período inicial</span>
              <input aria-label="Início do período da Linha de Balanço" type="date" value={inicioEscolhido}
                onChange={e => { setDataInicial(e.target.value); setPxManual(null); }} />
            </label>
            <label className="lob-stairs-field lob-stairs-period">
              <span>Período final</span>
              <input aria-label="Fim do período da Linha de Balanço" type="date" value={fimEscolhido}
                onChange={e => { setDataFinal(e.target.value); setPxManual(null); }} />
            </label>
            <label className="lob-stairs-field">
              <span>Zoom</span>
              <select aria-label="Zoom do calendário" value={escala}
                onChange={e => { setEscala(e.target.value as Escala); setPxManual(null); }}>
                <option value="dia">Dias</option>
                <option value="semana">Semanas</option>
                <option value="quinzena">Quinzenas</option>
                <option value="mes">Meses</option>
              </select>
            </label>
            <div className="lob-stairs-field lob-stairs-dropdown">
              <span>Serviços</span>
              <details>
                <summary>{seriesVisiveis.length} de {repetitivas.length} selecionados <ChevronDown size={14}/></summary>
                <div className="lob-stairs-options">
                  {repetitivas.map(serie => (
                    <label key={serie.chave}>
                      <input type="checkbox" checked={!ocultas.has(serie.chave)}
                        onChange={e => alterarSerie(serie.chave, e.target.checked)} />
                      <i style={{ background: CORES[repetitivas.indexOf(serie) % CORES.length] }}/>
                      <span>{serie.nome}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
            <label className="lob-stairs-field">
              <span>Pavimentos</span>
              <select aria-label="Filtrar pavimento" value={pavimento}
                onChange={e => { setPavimento(e.target.value); setDetalhe(null); setPxManual(null); }}>
                <option value="todos">Todos</option>
                {locaisValidos.map(local => <option key={local} value={local}>{local}</option>)}
              </select>
            </label>
            <label className="lob-stairs-field lob-stairs-search">
              <span>Pesquisar</span>
              <span className="lob-stairs-search-input"><Search size={14}/>
                <input type="search" aria-label="Buscar serviço na Linha de Balanço" value={busca} placeholder="Serviço ou EAP" onChange={e=>{setBusca(e.target.value);setDetalhe(null);setPxManual(null);}}/>
              </span>
            </label>
          </div>

          <div className="lob-stairs-zoom-actions" aria-label="Ajustes do gráfico">
            <span><strong>{locais.length}</strong> pavimentos · <strong>{seriesVisiveis.length}</strong> serviços · <strong>{qtdBarras}</strong> atividades</span>
            <div>
              <button type="button" aria-label="Diminuir zoom" onClick={()=>setPxManual(Math.max(3,pxDia/1.25))}><ZoomOut size={15}/></button>
              <button type="button" aria-label="Aumentar zoom" onClick={()=>setPxManual(Math.min(36,pxDia*1.25))}><ZoomIn size={15}/></button>
              <button type="button" onClick={()=>setPxManual(Math.min(36, Math.max(3, ((rolagem.current?.clientWidth ?? 1100)-COLUNA-12)/diasNoEixo)))}><Maximize2 size={15}/> Ajustar à tela</button>
              <button type="button" onClick={()=>{setDataInicial("");setDataFinal("");setPxManual(null);}}>Período dos serviços</button>
            </div>
          </div>

          {periodoInvalido ? <p className="lob-stairs-error" role="alert">A data final deve ser igual ou posterior à inicial.</p>
          : qtdBarras === 0 ? <div className="lob-stairs-empty"><h3>Nenhum serviço neste filtro</h3><p>Selecione pelo menos um serviço e um pavimento com atividade cadastrada.</p></div>
          : <div className="lob-stairs-scroller" ref={rolagem} role="region" tabIndex={0} aria-label="Escadinha: datas horizontais e pavimentos verticais">
              <div className="lob-stairs-board" role="table" aria-label="Cronograma de serviços por pavimento" style={{width: COLUNA+larguraTempo}}>
                <div className="lob-stairs-months" role="row">
                  <div className="lob-stairs-sticky-head" role="columnheader">Pavimento</div>
                  <div className="lob-stairs-time" role="presentation" style={{ width: larguraTempo }}>
                    {meses.map(m=><span key={m.inicio} className="lob-stairs-month" style={{left:m.x,width:m.largura}}>{m.texto}</span>)}
                  </div>
                </div>
                <div className="lob-stairs-weeks" role="row">
                  <div className="lob-stairs-sticky-week" role="columnheader">Local de execução</div>
                  <div className="lob-stairs-time" role="presentation" style={{width:larguraTempo}}>
                    {semanas.map(s=><span key={s.inicio} className="lob-stairs-week" style={{left:s.x,width:Math.min(pxDia*7,larguraTempo-s.x)}}>{formatoCurto(s.inicio)}</span>)}
                  </div>
                </div>
                {locais.map((local, row) => (
                  <div key={local} className={"lob-stairs-row"+(row%2?" lob-stairs-row-alt":"")} role="row" style={{height:alturaLinha}}>
                    <div className="lob-stairs-local" role="rowheader">{local}</div>
                    <div className="lob-stairs-track" role="cell" style={{width:larguraTempo}}>
                      {semanas.map(s=><span key={s.inicio} className="lob-stairs-gridline" style={{left:s.x}}/>)}
                      {barrasPorLocal.get(local)?.map(b=>{
                        const inicioCortado = Math.max(diaUtc(b.ponto.inicio), diaUtc(eixoInicio));
                        const fimCortado = Math.min(diaUtc(b.ponto.fim), diaUtc(eixoFimExclusivo)-DIA);
                        if(fimCortado < inicioCortado) return null;
                        const largura = Math.max(5, ((fimCortado-inicioCortado)/DIA+1)*pxDia-2);
                        const x = ((inicioCortado-diaUtc(eixoInicio))/DIA)*pxDia;
                        const nomeCurto = b.serie.nome.split(" ")[0] ?? b.serie.nome;
                        return <button type="button" key={b.ponto.codigo} data-testid="lob-step-bar"
                          className="lob-stairs-bar" style={{left:x,top:10+b.indice*23,width:largura,backgroundColor:b.cor}}
                          aria-label={b.serie.nome+" · "+local+" · "+formatoCompleto(b.ponto.inicio)+" a "+formatoCompleto(b.ponto.fim)}
                          title={b.serie.nome+" | "+local+" | "+formatoCompleto(b.ponto.inicio)+" a "+formatoCompleto(b.ponto.fim)+" | EAP "+b.ponto.codigo}
                          onClick={()=>setDetalhe(b)}>
                          <span>{largura >= 62 ? nomeCurto : ""}</span>
                        </button>;
                      })}
                      {dataValida(hoje) && diaUtc(hoje)>=diaUtc(eixoInicio) && diaUtc(hoje)<diaUtc(eixoFimExclusivo)
                        && <span className="lob-stairs-today" title={"Hoje: "+formatoCompleto(hoje)} style={{left:dataX(hoje)}}/>}
                    </div>
                  </div>
                ))}
              </div>
            </div>}

          <div className="lob-stairs-legend">
            {seriesVisiveis.map(serie=><span key={serie.chave}><i style={{background:CORES[repetitivas.findIndex(s=>s.chave===serie.chave)%CORES.length]}}/>{serie.nome}</span>)}
            <span className="lob-stairs-legend-note">Barras = períodos planejados · eixo horizontal = tempo · eixo vertical = pavimentos</span>
          </div>
          {detalhe && <div className="lob-stairs-detail" role="status">
            <div><strong>{detalhe.serie.nome} · {detalhe.ponto.local}</strong><span>EAP {detalhe.ponto.codigo}</span></div>
            <span>Início: {formatoCompleto(detalhe.ponto.inicio)} · Término: {formatoCompleto(detalhe.ponto.fim)}</span>
            <span>Quantidade prevista: {detalhe.ponto.quantidade == null ? "não informada" : detalhe.ponto.quantidade+" "+(detalhe.ponto.unidade??"")}</span>
            <button type="button" onClick={()=>setDetalhe(null)}>Fechar</button>
          </div>}
          {(dados.semLocal>0||dados.descartadas>0)&&<p className="lob-stairs-footnote">{dados.semLocal} atividades sem local físico · {dados.descartadas} marcos ou registros sem duração válida. Não são inventados pavimentos ou prazos.</p>}
        </>
      )}
    </section>
  );
}
