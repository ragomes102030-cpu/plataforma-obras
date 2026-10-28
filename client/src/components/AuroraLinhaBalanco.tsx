import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { Activity, CalendarDays, ChevronDown, Download, ListTodo, Maximize2, Search, ZoomIn, ZoomOut } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";
import {
  dataValida, diaUtc, prepararLinhaBalancoVertical, atividadesForaDaEscadinhaLob, aplicarLocaisDaEapNaLob,
  type PontoLob, type SerieLob,
} from "./linha-balanco-modelo";
import { analisarFluxoLob } from "./lob-analise-fluxo";
import { calcularVinculosExibidos, resumoLob, taxaPlanejadaLob, type VínculoLob } from "./lob-indicadores";
import "./linha-balanco-profissional.css";

export { prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

type Props = {
  linhas: EntradaDaLinha[];
  finsCalculados: Record<string, string>;
  hoje: IsoDate;
  inicioObra?: IsoDate | null;
  codigosExemplo?: ReadonlySet<string>;
  nodosEap?: readonly {id:number;code:string;location:string|null}[];
  unidades?: readonly {id:number;code:string;name:string;unitType:string}[];
  editavel?: boolean;
  salvandoLocal?: boolean;
  erroLocal?: string|null;
  onDefinirLocal?: (nodeId:number,unitId:number|null)=>void;
  onCriarUnidade?: (code:string,name:string,unitType:string)=>void;
  onAbrirAtividades: () => void;
  dependencias?: VínculoLob[];
  estadoVinculos?: "pronto" | "carregando" | "erro";
};
type Escala = "dia" | "semana" | "quinzena" | "mes";
type Barra = { serie: SerieLob; ponto: PontoLob; cor: string; indice: number };
const DIA = 86400000;
const COLUNA = 168;
const STATUS_COLUNA = 112;
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
export function LinhaBalancoEscadinha({
  linhas,finsCalculados,hoje,inicioObra,codigosExemplo,nodosEap=[],unidades=[],
  editavel=false,salvandoLocal=false,erroLocal=null,onDefinirLocal,onCriarUnidade,
  onAbrirAtividades,dependencias=[],estadoVinculos="carregando"
}: Props) {
  // O cronograma pode conter serviços reais e atividades de QA em 2028.
  // O modo padrão prioriza o plano real e mantém a simulação isolada.
  const qtdQa = linhas.filter(l => codigosExemplo?.has(l.codigo)).length;
  const qtdReais = linhas.length - qtdQa;
  const possuiQaSeparada = qtdQa > 0 && qtdReais > 0;
  const [exibirQa, setExibirQa] = useState(false);
  const linhasDaVisualizacao = useMemo(
    () => possuiQaSeparada && !exibirQa
      ? linhas.filter(l => !codigosExemplo?.has(l.codigo)) : linhas,
    [linhas, codigosExemplo, possuiQaSeparada, exibirQa]
  );
  const locaisConfirmados = useMemo(
    ()=>aplicarLocaisDaEapNaLob(linhasDaVisualizacao,nodosEap,unidades),
    [linhasDaVisualizacao,nodosEap,unidades]
  );
  const dados = useMemo(
    () => prepararLinhaBalancoVertical(locaisConfirmados.linhas, finsCalculados, locaisConfirmados.codigosConfirmados),
    [locaisConfirmados, finsCalculados],
  );
  const repetitivas = useMemo(
    () => dados.series.filter(s => s.repetitiva || s.localizada),
    [dados.series]
  );
  // Trazer TODAS as atividades com início/fim oficial, inclusive as não
  // repetitivas do início da obra. Mantemos os patamares P01–P06 intocados.
  const atividadesGerais = useMemo(
    () => atividadesForaDaEscadinhaLob(locaisConfirmados.linhas, finsCalculados, repetitivas),
    [locaisConfirmados, finsCalculados, repetitivas]
  );
  const [busca, setBusca] = useState("");
  const [localSelecionado,setLocalSelecionado]=useState<Record<string,string>>({});
  const [novoLocalCodigo,setNovoLocalCodigo]=useState("");
  const [novoLocalNome,setNovoLocalNome]=useState("");
  const [novoLocalTipo,setNovoLocalTipo]=useState("setor");
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const [pavimento, setPavimento] = useState("todos");
  const [escala, setEscala] = useState<Escala>("semana");
  const [pxManual, setPxManual] = useState<number | null>(null);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  // A escadinha deve abrir no período de produção, sem anos vazios no gráfico.
  // O período completo da obra continua disponível sob demanda.
  // Com plano real + QA, o período inicial privilegia os serviços localizados
  // reais. "Período completo" continua disponível, sem deslocar nenhum prazo.
  const [incluirInicioObra, setIncluirInicioObra] = useState<boolean | null>(null);
  const [detalhe, setDetalhe] = useState<Barra | null>(null);
  const [mostrarVinculos, setMostrarVinculos] = useState(false);
  const [mostrarMarcos, setMostrarMarcos] = useState(true);
  const rolagem = useRef<HTMLDivElement | null>(null);

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const seriesVisiveis = repetitivas.filter(s =>
    !ocultas.has(s.chave) &&
    (s.nome + " " + s.pontos.map(p => p.codigo).join(" ")).toLocaleLowerCase("pt-BR").includes(termo)
  );
  // A lista de atividades gerais NÃO pertence ao eixo físico dos pavimentos.
  // Por isso não obedece ao filtro de pavimento e fica fora do gráfico.
  const geraisVisiveis = atividadesGerais.map(g => ({...g, pontos:g.pontos.filter(p =>
    !termo || `${p.nome} ${p.codigo} ${g.nome}`.toLocaleLowerCase("pt-BR").includes(termo))
  })).filter(g=>g.pontos.length>0);
  const totalGerais = geraisVisiveis.reduce((s,g)=>s+g.pontos.length,0);
  // Descarta categorias antigas usadas equivocadamente no campo pavimento:
  // apenas unidades de serviços repetitivos entram no eixo físico.
  const locaisValidos = Array.from(new Set(repetitivas.flatMap(s => s.pontos.map(p => p.local))))
    .sort((a, b) => b.localeCompare(a, "pt-BR", { numeric: true }));
  const locais = locaisValidos.filter(p => pavimento === "todos" || p === pavimento);
  const pontosVisiveis = seriesVisiveis.map(s => ({
    ...s, pontos: s.pontos.filter(p => locais.includes(p.local)),
  }));
  const periodoRepetitivo = selecionarPeriodoPelosServicos(pontosVisiveis);
  const periodoFoco = selecionarPeriodoPelosServicos(pontosVisiveis.filter(s=>s.repetitiva))??periodoRepetitivo;
  const periodoCompleto = incluirInicioObra ?? (possuiQaSeparada ? false : locaisConfirmados.codigosConfirmados.size > 0);
  const periodoAutomatico = selecionarPeriodoPelosServicos([
    ...pontosVisiveis,
    ...geraisVisiveis.map(g=>({...g,repetitiva:false})),
  ]);
  const baseInicio = periodoAutomatico?.primeiro ?? (dataValida(inicioObra)?inicioObra:"2026-01-01");
  const baseFim = periodoAutomatico?.ultimo ?? baseInicio;
  const obraComecaAntesDaLob = dataValida(inicioObra) &&
    periodoFoco !== null && diaUtc(inicioObra) < diaUtc(periodoFoco.primeiro);
  const exemplosNaLob = repetitivas.flatMap(serie => serie.pontos)
    .filter(ponto => codigosExemplo?.has(ponto.codigo)).length;
  const totalPontosRepetitivos = repetitivas.reduce((s, serie) => s + serie.pontos.length, 0);
  const todosServicosSaoQA = exemplosNaLob > 0 && exemplosNaLob === totalPontosRepetitivos;
  const inicioEscolhido = dataValida(dataInicial) ? dataInicial :
    periodoCompleto ? (dataValida(inicioObra) && inicioObra<baseInicio ? inicioObra : baseInicio)
      : (periodoFoco?.primeiro ?? baseInicio);
  const fimEscolhido = dataValida(dataFinal) ? dataFinal :
    periodoCompleto ? baseFim : (periodoFoco?.ultimo ?? baseFim);
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
  const resumo = resumoLob(seriesVisiveis,locais,hoje);
  const originais = new Map(linhas.map(l=>[l.codigo,l]));
  const ligacoes = estadoVinculos==="pronto" ? calcularVinculosExibidos(dependencias,resumo.pontos) : [];
  const coordenadas = new Map<string,{inicio:number;fim:number;y:number}>();
  locais.forEach((local, linhaIndex)=>{
    for (const barra of barrasPorLocal.get(local) ?? []) coordenadas.set(barra.ponto.codigo,{
      inicio:dataX(barra.ponto.inicio),
      fim:dataX(adicionarDias(barra.ponto.fim,1)),
      y:linhaIndex*alturaLinha+19+barra.indice*23,
    });
  });
  const setas = ligacoes.flatMap(v=>{
    const origem=coordenadas.get(v.de),destino=coordenadas.get(v.para);
    if(!origem||!destino)return [];
    const tipo=v.tipo.toUpperCase();
    const x1=tipo==="SS"||tipo==="SF"?origem.inicio:origem.fim;
    const x2=tipo==="FF"||tipo==="SF"?destino.fim:destino.inicio;
    return [{...v,x1,x2,y1:origem.y,y2:destino.y}];
  });
  const marcos = mostrarMarcos?linhas.filter(l=>l.marco && dataValida(l.inicio) && locais.includes(String(l.pavimento??"").trim())):[];
  // Leitura analítica derivada apenas dos serviços e locais exibidos.
  // Não interpreta coincidência temporal como colisão ou infração de predecessora.
  const analise = analisarFluxoLob(seriesVisiveis, locais);
  const taxaMedia = analise.ritmos.map(r=>r.diasPorTransferencia).filter((n):n is number=>n!==null);
  const ritmoMedio = taxaMedia.length?taxaMedia.reduce((a,b)=>a+b,0)/taxaMedia.length:null;
  const sobreposicoesPorLocal = new Map<string, number>();
  for (const alerta of analise.alertas) {
    if (alerta.tipo === "sobreposicao") {
      sobreposicoesPorLocal.set(alerta.local, (sobreposicoesPorLocal.get(alerta.local) ?? 0) + 1);
    }
  }

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
    const linhasCsv = [["Serviço", "EAP", "Local informado", "Início", "Término", "Quantidade", "Unidade", "Executado", "Classificação"]];
    seriesVisiveis.forEach(serie => {
      serie.pontos.filter(p => locais.includes(p.local)).forEach(p => {
        linhasCsv.push([serie.nome, p.codigo, p.local, p.inicio, p.fim, String(p.quantidade ?? ""), p.unidade ?? "", String(p.executado), "Escadinha por pavimento"]);
      });
    });
    geraisVisiveis.forEach(grupo=>grupo.pontos.forEach(p=>{
      linhasCsv.push([p.nome,p.codigo,p.local,p.inicio,p.fim,String(p.quantidade??""),p.unidade??"",String(p.executado),"Sem sequência repetitiva"]);
    }));
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
          <button type="button" onClick={exportarCsv} disabled={qtdBarras+totalGerais===0} title="Exportar escadinha e relação de atividades anteriores"><Download size={16}/> Exportar CSV</button>
        </div>
      </header>

      {repetitivas.length === 0 && atividadesGerais.length === 0 ? (
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
          {(obraComecaAntesDaLob || qtdQa > 0 || atividadesGerais.length > 0) && (
            <div className="lob-stairs-context" role="status" data-testid="lob-calendar-context">
              <div>
                <strong>Referência das datas</strong>
                {dataValida(inicioObra) && <span>Início cadastrado da obra: <b>{formatoCompleto(inicioObra)}</b></span>}
                {periodoRepetitivo && <span>{pontosVisiveis.some(s => s.repetitiva) ? "Primeira atividade repetitiva" : "Primeira atividade localizada"}: <b>{formatoCompleto(periodoRepetitivo.primeiro)}</b></span>}
                {atividadesGerais.length > 0 && <span data-testid="lob-general-count">{atividadesGerais.reduce((s,g)=>s+g.pontos.length,0)} atividades do cronograma fora das escadinhas</span>}
                {qtdQa > 0 && <span className="lob-stairs-qa">QA: {qtdQa} atividade(s) de demonstração {possuiQaSeparada && !exibirQa ? "— ocultas da visão principal" : "nas sequências repetitivas"}{todosServicosSaoQA ? " — não representam execução real" : ""}</span>}
                {possuiQaSeparada && <span data-testid="lob-real-status"><b>{qtdReais}</b> atividades do plano real · <b>{locaisConfirmados.codigosConfirmados.size}</b> localizadas · <b>{Math.max(0,qtdReais-locaisConfirmados.codigosConfirmados.size)}</b> pendentes de vínculo físico</span>}
                <small>Serviços com localização física confirmada no Dicionário da EAP entram no gráfico, inclusive quando aparecem em um único local. Os demais ficam pendentes de vínculo; datas e atividades não são alteradas.</small>
              </div>
              {possuiQaSeparada && <label className="lob-stairs-qa-toggle">
                <input type="checkbox" data-testid="lob-toggle-qa" checked={exibirQa} onChange={e=>{
                  setExibirQa(e.target.checked);
                  setIncluirInicioObra(e.target.checked ? false : true);
                  setDataInicial("");setDataFinal("");setPxManual(null);setPavimento("todos");setDetalhe(null);
                }}/>
                Exibir simulação QA ({qtdQa} atividades)
              </label>}
              {obraComecaAntesDaLob && <button type="button"
                data-testid="lob-toggle-obra-start"
                aria-pressed={periodoCompleto}
                onClick={() => {
                  setIncluirInicioObra(!periodoCompleto);
                  setDataInicial("");
                  setDataFinal("");
                  setPxManual(null);
                }}>
                {periodoCompleto ? "Focar nas escadinhas" : "Mostrar desde início da obra"}
              </button>}
            </div>
          )}
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
              <span>Locais</span>
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
            <span><strong>{locais.length}</strong> locais · <strong>{seriesVisiveis.length}</strong> serviços · <strong>{qtdBarras}</strong> atividades localizadas</span>
            <div>
              <button type="button" aria-label="Diminuir zoom" onClick={()=>setPxManual(Math.max(3,pxDia/1.25))}><ZoomOut size={15}/></button>
              <button type="button" aria-label="Aumentar zoom" onClick={()=>setPxManual(Math.min(36,pxDia*1.25))}><ZoomIn size={15}/></button>
              <button type="button" onClick={()=>setPxManual(Math.min(36, Math.max(3, ((rolagem.current?.clientWidth ?? 1100)-COLUNA-STATUS_COLUNA-12)/diasNoEixo)))}><Maximize2 size={15}/> Ajustar à tela</button>
              <button type="button" onClick={()=>{setIncluirInicioObra(true);setDataInicial("");setDataFinal("");setPxManual(null);}}>Período completo</button>
              {estadoVinculos==="pronto" && ligacoes.length>0 && <label className="lob-stairs-show-links"><input type="checkbox" checked={mostrarVinculos} onChange={e=>setMostrarVinculos(e.target.checked)}/> Mostrar vínculos ({ligacoes.length})</label>}
              {linhas.some(l=>l.marco&&dataValida(l.inicio)) && <label className="lob-stairs-show-links"><input type="checkbox" checked={mostrarMarcos} onChange={e=>setMostrarMarcos(e.target.checked)}/> Mostrar marcos</label>}
            </div>
          </div>

          <details className="lob-stairs-analysis" data-testid="lob-flow-analysis">
            <summary>
              <span className="lob-stairs-analysis-name"><Activity size={16}/> Análise de fluxo</span>
              <span>{analise.ritmos.length} ritmos · {analise.sobreposicoes} janelas simultâneas · {analise.intervalos} intervalos por local · {analise.transferencias} entre pavimentos</span>
              <ChevronDown size={15}/>
            </summary>
            <div className="lob-stairs-analysis-body">
              <div className="lob-stairs-analysis-rhythms">
                <strong>Cadência dos serviços</strong>
                <div className="lob-stairs-analysis-rhythm-grid">
                  {analise.ritmos.map(ritmo => (
                    <div className="lob-stairs-analysis-rhythm" key={ritmo.chave}>
                      <strong>{ritmo.nome}</strong>
                      <span>{ritmo.diasPorTransferencia === null
                        ? "Sem duas unidades visíveis para medir intervalo"
                        : `${ritmo.diasPorTransferencia.toLocaleString("pt-BR")} dia(s) entre inícios consecutivos (média)`}
                      </span>
                      <small>{ritmo.variavel
                        ? `Varia de ${ritmo.menorIntervalo} a ${ritmo.maiorIntervalo} dias`
                        : ritmo.invertido ? "Sequência de pavimentos em ordem temporal invertida"
                          : "Intervalos de início uniformes nos locais exibidos"}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lob-stairs-analysis-observations">
                <strong>Janelas e intervalos para conferir</strong>
                {analise.alertas.length === 0 ? <p>Nenhuma sobreposição ou intervalo entre os serviços selecionados.</p>
                : <ul>
                  {analise.alertas.slice(0, 12).map((alerta, indice) => (
                    <li key={alerta.tipo+"-"+alerta.local+"-"+alerta.codigos.join("-")+"-"+indice} data-testid="lob-flow-alert">
                      <strong>{alerta.tipo === "sobreposicao" ? "Janelas simultâneas" :
                        alerta.tipo === "transferencia" ? "Intervalo entre pavimentos" : "Intervalo neste pavimento"}</strong>
                      <span>{alerta.local} · {alerta.servicos} · {alerta.dias} dia(s)</span>
                      <small>{alerta.descricao} · EAP {alerta.codigos.join(" / ")}</small>
                    </li>
                  ))}
                  {analise.alertas.length > 12 && <li>Mais {analise.alertas.length - 12} observações nos filtros atuais.</li>}
                </ul>}
              </div>
              <p className="lob-stairs-analysis-note">Indicadores de calendário, não medições reais nem conflitos confirmados. Sem dados de equipe, restrições de frente e verificação das dependências, uma sobreposição NÃO prova interferência. Intervalos não comprovam ociosidade. Tudo é somente leitura.</p>
            </div>
          </details>

          {periodoInvalido ? <p className="lob-stairs-error" role="alert">A data final deve ser igual ou posterior à inicial.</p>
          : qtdBarras === 0 ? <div className="lob-stairs-empty"><h3>Sem escadinha neste filtro</h3><p>Verifique os serviços e pavimentos selecionados. As demais atividades da obra estão na relação cronológica abaixo.</p></div>
          : <div className="lob-stairs-scroller" ref={rolagem} role="region" tabIndex={0} aria-label="Escadinha: datas horizontais e pavimentos verticais">
              <div className="lob-stairs-board" role="table" aria-label="Cronograma de serviços por pavimento" style={{width: COLUNA+STATUS_COLUNA+larguraTempo}}>
                <div className="lob-stairs-months" role="row">
                  <div className="lob-stairs-sticky-head" role="columnheader">Local físico</div>
                  <div className="lob-stairs-status-head" role="columnheader">Status</div>
                  <div className="lob-stairs-time" role="presentation" style={{ width: larguraTempo }}>
                    {meses.map(m=><span key={m.inicio} className="lob-stairs-month" style={{left:m.x,width:m.largura}}>{m.texto}</span>)}
                  </div>
                </div>
                <div className="lob-stairs-weeks" role="row">
                  <div className="lob-stairs-sticky-week" role="columnheader">Local de execução</div>
                  <div className="lob-stairs-status-head lob-stairs-status-week" role="columnheader">Execução registrada</div>
                  <div className="lob-stairs-time" role="presentation" style={{width:larguraTempo}}>
                    {semanas.map(s=><span key={s.inicio} className="lob-stairs-week" style={{left:s.x,width:Math.min(pxDia*7,larguraTempo-s.x)}}>{formatoCurto(s.inicio)}</span>)}
                    {dataValida(hoje)&&diaUtc(hoje)>=diaUtc(eixoInicio)&&diaUtc(hoje)<diaUtc(eixoFimExclusivo)&&<span className="lob-stairs-today-label" style={{left:dataX(hoje)}}>Hoje</span>}
                  </div>
                </div>
                {locais.map((local, row) => (
                  <div key={local} className={"lob-stairs-row"+(row%2?" lob-stairs-row-alt":"")} role="row" style={{height:alturaLinha}}>
                    <div className="lob-stairs-local" role="rowheader">{local}
                      {(sobreposicoesPorLocal.get(local) ?? 0) > 0 &&
                        <span className="lob-stairs-location-note" title="Janelas de serviços simultâneas neste local; verifique compatibilidade">!</span>}
                    </div>
                    <div className="lob-stairs-status-cell" role="cell"><span className={"lob-stairs-status-tag "+(resumo.estados.find(x=>x.local===local)?.status??"sem-medicao")}>{({concluido:"Concluído",parcial:"Parcial",prazo:"Prazo decorrido",planejado:"Planejado","sem-medicao":"Sem medição"} as const)[resumo.estados.find(x=>x.local===local)?.status??"sem-medicao"]}</span></div>
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
                          {b.ponto.quantidade!==null&&b.ponto.quantidade>0&&b.ponto.executado>0&&<i aria-hidden="true" className="lob-stairs-bar-progress" style={{width:Math.min(100,Math.max(0,b.ponto.executado/b.ponto.quantidade*100))+"%"}}/>}
                          <span>{largura >= 62 ? nomeCurto : ""}</span>
                        </button>;
                      })}
                      {marcos.filter(m=>m.pavimento===local).map(m=><span key={m.codigo} className="lob-stairs-milestone" style={{left:dataX(m.inicio)}} title={m.atividade+" · "+m.codigo+" · "+formatoCompleto(m.inicio)}>◆</span>)}
                      {dataValida(hoje) && diaUtc(hoje)>=diaUtc(eixoInicio) && diaUtc(hoje)<diaUtc(eixoFimExclusivo)
                        && <span className="lob-stairs-today" title={"Hoje: "+formatoCompleto(hoje)} style={{left:dataX(hoje)}}/>}
                    </div>
                  </div>
                ))}
                {mostrarVinculos && setas.length>0 && <svg className="lob-stairs-links" width={larguraTempo} height={locais.length*alturaLinha} viewBox={`0 0 ${larguraTempo} ${locais.length*alturaLinha}`} style={{left:COLUNA+STATUS_COLUNA,top:71}} role="img" aria-label="Vínculos cadastrados entre atividades visíveis">
                  <defs><marker id="lob-link-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M 0 0 L 5 2.5 L 0 5 z" fill="#758b9b"/></marker></defs>
                  {setas.map((v,i)=><path key={v.de+"-"+v.para+"-"+i} d={`M ${v.x1} ${v.y1} L ${v.x1+5} ${v.y1} L ${v.x1+5} ${v.y2} L ${v.x2} ${v.y2}`} fill="none" stroke="#758b9b" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#lob-link-arrow)"><title>{v.de+" → "+v.para+" · "+v.tipo+" · lag "+v.lag}</title></path>)}
                </svg>}
              </div>
            </div>}

          <div className="lob-stairs-legend">
            {seriesVisiveis.map(serie=><span key={serie.chave}><i style={{background:CORES[repetitivas.findIndex(s=>s.chave===serie.chave)%CORES.length]}}/>{serie.nome}</span>)}
            <span className="lob-stairs-legend-note">Barras = períodos planejados · status = execução registrada · vínculos = somente cadastrados</span>
          </div>
          {totalGerais>0 && (
            <details className="lob-stairs-mapping" data-testid="lob-location-mapping">
              <summary><strong>Vincular serviços aos locais físicos</strong>
                <span>{totalGerais} atividades sem sequência localizada · dados da EAP</span><ChevronDown size={15}/></summary>
              <div className="lob-stairs-mapping-body">
                <p>Selecione uma unidade física cadastrada e confirme o local de execução do pacote da EAP. O vínculo salva SOMENTE o campo de localização no Dicionário da EAP da versão de trabalho; não altera prazos, CPM, quantidades ou baseline. Um pacote que abrange vários locais deve ser decomposto antes de associar um único local.</p>
                {!editavel && <p role="status">Edição indisponível nesta versão. Abra uma versão de trabalho para localizar atividades.</p>}
                {erroLocal && <p role="alert">{erroLocal}</p>}
                <div className="lob-stairs-mapping-create">
                  <label>Nome do local<input aria-label="Nome do novo local" value={novoLocalNome} maxLength={180}
                    onChange={e=>setNovoLocalNome(e.target.value)} placeholder="Ex.: Canteiro de obras"/></label>
                  <label>Código<input aria-label="Código do novo local" value={novoLocalCodigo} maxLength={32}
                    onChange={e=>setNovoLocalCodigo(e.target.value)} placeholder="Ex.: CANTEIRO"/></label>
                  <label>Tipo<select aria-label="Tipo de unidade" value={novoLocalTipo} onChange={e=>setNovoLocalTipo(e.target.value)}>
                    <option value="setor">Setor</option><option value="pavimento">Pavimento</option><option value="area">Área</option>
                  </select></label>
                  <button type="button" disabled={!editavel||!onCriarUnidade||novoLocalNome.trim().length<2||!novoLocalCodigo.trim()}
                    onClick={()=>{onCriarUnidade?.(novoLocalCodigo.trim(),novoLocalNome.trim(),novoLocalTipo);setNovoLocalNome("");setNovoLocalCodigo("");}}>
                    Cadastrar local
                  </button>
                </div>
                <table><thead><tr><th>Atividade / EAP</th><th>Início oficial</th><th>Local confirmado</th><th>Ação</th></tr></thead>
                  <tbody>{geraisVisiveis.flatMap(g=>g.pontos).map(p=>{
                    const node=nodosEap.find(n=>n.code===p.codigo);
                    const valor=localSelecionado[p.codigo]??"";
                    return <tr key={p.codigo}><td><strong>{p.codigo}</strong> {p.nome}</td>
                      <td>{formatoCompleto(p.inicio)}</td>
                      <td><select aria-label={"Selecionar local físico de "+p.codigo} value={valor}
                        onChange={e=>setLocalSelecionado(v=>({...v,[p.codigo]:e.target.value}))}>
                        <option value="">Selecionar local</option>
                        {unidades.map(u=><option key={u.id} value={String(u.id)}>{u.name} ({u.code})</option>)}
                      </select></td>
                      <td><button type="button" disabled={!editavel||!node||!valor||salvandoLocal||!onDefinirLocal}
                        onClick={()=>{if(node&&valor)onDefinirLocal?.(node.id,Number(valor));}}>
                        {salvandoLocal?"Salvando…":"Vincular"}</button></td>
                    </tr>;
                  })}</tbody>
                </table>
                <small>As sugestões baseadas apenas no nome da disciplina não são aplicadas automaticamente. Pacotes multi-local precisam ser decompostos no planejamento antes da distribuição.</small>
              </div>
            </details>
          )}
          {totalGerais>0 && (
            <details className="lob-stairs-previous-activities" data-testid="lob-previous-activities">
              <summary>
                <strong>Demais atividades do cronograma</strong>
                <span>{totalGerais} atividades com datas cadastradas · consultar desde o início da obra</span>
                <ChevronDown size={15} aria-hidden="true"/>
              </summary>
              <div className="lob-stairs-previous-body">
                <p>Relação cronológica por frente ou disciplina cadastrada. Estas atividades não têm sequência física repetitiva validada e não são transformadas em pavimentos da escadinha.</p>
                {geraisVisiveis.map(grupo=>(
                  <section key={grupo.chave} className="lob-stairs-previous-group">
                    <h4>{grupo.nome} <small>({grupo.pontos.length})</small></h4>
                    <table>
                      <thead><tr><th scope="col">EAP</th><th scope="col">Atividade</th><th scope="col">Início</th><th scope="col">Término</th></tr></thead>
                      <tbody>{grupo.pontos.map(p=>(
                        <tr key={p.codigo}>
                          <td>{p.codigo}</td>
                          <td>{p.nome}</td>
                          <td>{formatoCompleto(p.inicio)}</td>
                          <td>{formatoCompleto(p.fim)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </section>
                ))}
                <p>As datas vêm da mesma grade do cronograma. Para posicionar esses serviços por pavimento na escadinha, é necessário cadastrar ou validar a localização física real.</p>
              </div>
            </details>
          )}
          <div className="lob-stairs-dashboard" aria-label="Painel técnico da Linha de Balanço">
            <section className="lob-stairs-dashboard-card" aria-label="Resumo do planejamento">
              <h3>Resumo do planejamento</h3>
              <dl>
                <div><dt>Período das atividades visíveis</dt><dd>{periodoAutomatico?formatoCompleto(periodoAutomatico.primeiro)+" – "+formatoCompleto(periodoAutomatico.ultimo):"Sem período"}</dd></div>
                <div><dt>Pavimentos selecionados</dt><dd>{locais.length}</dd></div>
                <div><dt>Serviços selecionados</dt><dd>{seriesVisiveis.length}</dd></div>
                <div><dt>Atividades na escadinha</dt><dd>{qtdBarras}</dd></div>
                <div><dt>Janela total de calendário</dt><dd>{resumo.diasCalendario===null?"—":resumo.diasCalendario+" dias"}</dd></div>
                <div><dt>Cadência média de inícios</dt><dd>{ritmoMedio===null?"—":ritmoMedio.toLocaleString("pt-BR",{maximumFractionDigits:1})+" dias/pavimento"}</dd></div>
              </dl>
            </section>
            <section className="lob-stairs-dashboard-card lob-stairs-dashboard-flow" aria-label="Análise de fluxo resumida">
              <h3>Análise de fluxo</h3>
              <div className="lob-stairs-kpis">
                <div><strong>{ritmoMedio===null?"—":ritmoMedio.toLocaleString("pt-BR",{maximumFractionDigits:1})}</strong><span>dias por pavimento (média de inícios)</span></div>
                <div><strong>{analise.intervalos+analise.transferencias}</strong><span>intervalos a conferir</span></div>
                <div><strong>{analise.sobreposicoes}</strong><span>janelas simultâneas</span></div>
              </div>
              <div className="lob-stairs-flow-list">
                {analise.ritmos.map(r=><div key={r.chave}><strong>{r.nome}</strong><span>{r.diasPorTransferencia===null?"Sem ritmo mensurável":r.diasPorTransferencia.toLocaleString("pt-BR")+" dias entre inícios"}</span><small>{r.variavel?"Ritmo variável":"Cadência uniforme"}</small></div>)}
              </div>
              <p>Os intervalos não provam ociosidade; simultaneidade não confirma conflito físico.</p>
            </section>
            <section className="lob-stairs-dashboard-card lob-stairs-dashboard-detail" aria-label="Detalhes da atividade selecionada">
              <h3>Detalhes da atividade</h3>
              {!detalhe?<p className="lob-stairs-detail-hint">Selecione uma barra na escadinha para consultar o vínculo EAP, o período e os quantitativos.</p>:
                <dl data-testid="lob-activity-detail">
                  <div><dt>Serviço</dt><dd>{detalhe.serie.nome}</dd></div>
                  <div><dt>Código EAP</dt><dd>{detalhe.ponto.codigo}</dd></div>
                  <div><dt>{detalhe.serie.repetitiva||detalhe.serie.localizada?"Local físico":"Local informado (não validado)"}</dt><dd>{detalhe.ponto.local||"Não informado"}</dd></div>
                  <div><dt>Início planejado</dt><dd>{formatoCompleto(detalhe.ponto.inicio)}</dd></div>
                  <div><dt>Término planejado</dt><dd>{formatoCompleto(detalhe.ponto.fim)}</dd></div>
                  <div><dt>Duração cadastrada</dt><dd>{originais.get(detalhe.ponto.codigo)?.duracao??"—"} dias</dd></div>
                  <div><dt>Quantidade prevista</dt><dd>{detalhe.ponto.quantidade===null?"Não informada":detalhe.ponto.quantidade.toLocaleString("pt-BR")+" "+(detalhe.ponto.unidade??"")}</dd></div>
                  <div><dt>Execução registrada</dt><dd>{detalhe.ponto.executado>0?detalhe.ponto.executado.toLocaleString("pt-BR")+" "+(detalhe.ponto.unidade??""):"Sem quantidade executada registrada"}</dd></div>
                  <div><dt>Taxa planejada por dia de duração</dt><dd>{taxaPlanejadaLob(detalhe.ponto,originais.get(detalhe.ponto.codigo)?.duracao??null)?.toLocaleString("pt-BR")??"Não calculável"} {detalhe.ponto.quantidade!==null&&detalhe.ponto.quantidade>0?((detalhe.ponto.unidade??"unid.")+"/dia"):""}</dd></div>
                  <div><dt>Predecessoras cadastradas</dt><dd>{estadoVinculos!=="pronto"?"Indisponíveis":dependencias.filter(v=>v.para===detalhe.ponto.codigo).map(v=>v.de+" ("+v.tipo+")").join(", ")||"Nenhuma"}</dd></div>
                  <div><dt>Sucessoras cadastradas</dt><dd>{estadoVinculos!=="pronto"?"Indisponíveis":dependencias.filter(v=>v.de===detalhe.ponto.codigo).map(v=>v.para+" ("+v.tipo+")").join(", ")||"Nenhuma"}</dd></div>
                </dl>}
              {detalhe&&<button type="button" className="lob-stairs-detail-close" onClick={()=>setDetalhe(null)}>Limpar seleção</button>}
            </section>
          </div>
          {(dados.semLocal>0||dados.descartadas>0)&&<p className="lob-stairs-footnote">{dados.semLocal} atividades sem local físico · {dados.descartadas} marcos ou registros sem duração válida. Não são inventados pavimentos ou prazos.</p>}
        </>
      )}
    </section>
  );
}
