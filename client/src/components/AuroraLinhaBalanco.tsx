import * as React from "react";
import { useMemo, useState } from "react";
import { Activity, CalendarDays, ChevronDown, ChevronRight, Eye, EyeOff, Layers3, ListTodo, Search } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";
import {
  prepararLinhaBalancoVertical, diaUtc, faixasDeTempo, ocupacaoNaFaixa, rotuloMes,
  type PontoLob,
} from "./linha-balanco-modelo";
import "./linha-balanco-profissional.css";

export { prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

type Props = {
  linhas: EntradaDaLinha[];
  finsCalculados: Record<string, string>;
  hoje: IsoDate;
  onAbrirAtividades: () => void;
};
type Visao = "ocupacao" | "ritmo";
type Escala = "mes" | "quinzena";
const DIA = 86400000;
const CORES_OCUPACAO = ["#f2f6f8", "#c8e3ed", "#89c2d6", "#4e94b0", "#256b87"];
function textoData(iso: string) {
  const [a,m,d] = iso.split("-");
  return d+"/"+m+"/"+a;
}
function legendaPonto(p: PontoLob) {
  const qtd = p.quantidade == null ? "sem quantitativo" :
    "previsto: "+p.quantidade+(p.unidade ? " "+p.unidade : "");
  return p.codigo+" · "+p.nome+" · "+p.local+" | "+textoData(p.inicio)+" a "+textoData(p.fim)+" | "+qtd;
}

/**
 * Datas são derivadas exclusivamente de planning.grade.
 * Uma série só é conectada quando possui UM registro por local e ao menos
 * dois locais: uma linha ligando registros ambíguos sugeriria produtividade
 * que o sistema não calculou.
 */
export function LinhaBalancoVertical({ linhas, finsCalculados, hoje, onAbrirAtividades }: Props) {
  const { locais, series, semLocal, descartadas } =
    useMemo(() => prepararLinhaBalancoVertical(linhas, finsCalculados), [linhas, finsCalculados]);

  const [visao, setVisao] = useState<Visao>("ritmo");
  const [escala, setEscala] = useState<Escala>("mes");
  const [recolhida, setRecolhida] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const repetidas = series.filter(s => s.repetitiva);
  const pesquisa = busca.trim().toLocaleLowerCase("pt-BR");
  const listadas = (visao === "ritmo" ? repetidas : series).filter(s => (s.nome+" "+s.pontos[0]?.codigo).toLocaleLowerCase("pt-BR").includes(pesquisa));
  const selecionadaSerie = series.find(s => s.chave === selecionada) ?? null;
  const serieRitmo = repetidas.find(s => s.chave === selecionada) ?? repetidas[0] ?? null;
  const seriesOcupacao = listadas.filter(s => !selecionadaSerie || s.chave === selecionadaSerie.chave);
  const pontosOcupacao = seriesOcupacao.flatMap(s => s.pontos);
  const pontosTodos = series.flatMap(s => s.pontos);
  const primeiro = pontosTodos.reduce((atual,p) => !atual || diaUtc(p.inicio)<diaUtc(atual) ? p.inicio : atual,"");
  const ultimo = pontosTodos.reduce((atual,p) => !atual || diaUtc(p.fim)>diaUtc(atual) ? p.fim : atual,"");
  const faixas = useMemo(() => primeiro && ultimo ? faixasDeTempo(primeiro, ultimo, escala) : [], [primeiro,ultimo,escala]);
  const inicioEixo = faixas[0]?.inicio ?? primeiro;
  const fimEixo = faixas[faixas.length-1]?.fimExclusivo ?? ultimo;
  const dias = inicioEixo && fimEixo ? Math.max(1, (diaUtc(fimEixo)-diaUtc(inicioEixo))/DIA) : 1;
  const larguraLocal = 122;
  const esquerda = 106;
  const topo = 65;
  const rodape = 36;
  const largura = Math.max(690, esquerda+locais.length*larguraLocal+35);
  const altura = Math.max(550, Math.min(1480,faixas.length*(escala==="mes"?49:28)+topo+rodape));
  const h = altura-topo-rodape;
  const xLocal = (local:string) => esquerda+locais.indexOf(local)*larguraLocal+larguraLocal/2;
  const yData = (iso:string) => topo+(diaUtc(iso)-diaUtc(inicioEixo))/dias*h;
  const mostrarHoje = Boolean(inicioEixo && fimEixo && diaUtc(hoje)>=diaUtc(inicioEixo) && diaUtc(hoje)<=diaUtc(fimEixo));
  const intervaloRotulos = Math.max(1,Math.ceil(faixas.length/28));

  function selecionar(chave:string) {
    const item=series.find(s=>s.chave===chave);
    if (visao==="ritmo" && item && !item.repetitiva) setVisao("ocupacao");
    setSelecionada(atual=>visao==="ocupacao" && atual===chave ? null : chave);
  }

  return (
    <section className="lob-pro" aria-label="Linha de Balanço — planejamento">
      <header className="lob-pro-cabecalho">
        <div>
          <span className="lob-pro-kicker"><Layers3 size={14}/> PLANEJAMENTO · RITMO E FRENTES</span>
          <h2>Linha de Balanço</h2>
          <p>Tempo na vertical e locais na horizontal. Dados reais do cronograma, sem estimativas artificiais.</p>
        </div>
        <button className="lob-pro-editar" type="button" onClick={onAbrirAtividades}><ListTodo size={16}/> Editar atividades</button>
      </header>

      <div className="lob-pro-indicadores" aria-label="Resumo da Linha de Balanço">
        <span><strong>{locais.length}</strong> categorias cadastradas</span>
        <span><strong>{pontosTodos.length}</strong> atividades localizadas</span>
        <span><strong>{repetidas.length}</strong> sequências repetitivas válidas</span>
        <span><strong>{semLocal}</strong> sem local</span>
      </div>

      {repetidas.length === 0 ? (
        <div className="lob-pro-prontidao" role="status" aria-label="Diagnóstico da Linha de Balanço">
          <div className="lob-pro-prontidao-marca"><Layers3 size={24}/></div>
          <div className="lob-pro-prontidao-conteudo">
            <span className="lob-pro-prontidao-kicker">DADOS INSUFICIENTES PARA LINHA DE BALANÇO</span>
            <h3>A obra ainda não tem serviços repetidos por unidade de execução.</h3>
            <p>Uma LOB precisa relacionar o mesmo serviço a duas ou mais unidades físicas,
              com início e término definidos. Nesta versão do cronograma, nenhuma série atende
              a esse requisito. Não é correto transformar disciplinas ou fases em pavimentos,
              nem desenhar linhas artificiais.</p>
            {locais.length > 0 && <div className="lob-pro-categorias">
              <strong>Valores atuais do campo pavimento/frente ({locais.length})</strong>
              <div>{locais.slice(0,12).map(local=><span key={local}>{local}</span>)}
                {locais.length>12&&<span>+ {locais.length-12} outros</span>}</div>
              <small>Verifique se esses valores são locais físicos ou disciplinas da obra.</small>
            </div>}
            <div className="lob-pro-prontidao-acoes">
              <button type="button" className="lob-pro-editar" onClick={onAbrirAtividades}><ListTodo size={16}/> Revisar atividades e locais</button>
              <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("abrir-aba",{detail:{aba:"gantt"}}))}>
                Ver cronograma no Gantt <ChevronRight size={16}/>
              </button>
            </div>
            <p className="lob-pro-prontidao-nota">A EAP, as atividades e as datas permanecem intactas. A visualização de LOB aparecerá quando houver registros repetitivos válidos.</p>
          </div>
        </div>
      ) : (<>
      <div className="lob-pro-controles">
        <div className="lob-pro-visoes" aria-label="Modo de leitura">
          <button type="button" aria-pressed={visao==="ocupacao"} className={visao==="ocupacao"?"ativo":""} onClick={()=>{setVisao("ocupacao");setSelecionada(null);}}>
            Mapa auxiliar de frentes
          </button>
          <button type="button" aria-pressed={visao==="ritmo"} className={visao==="ritmo"?"ativo":""} onClick={()=>{setVisao("ritmo");setSelecionada(null);}}>
            Linha de Balanço
          </button>
        </div>
        <label className="lob-pro-escala"><CalendarDays size={15}/> Período
          <select aria-label="Escala da Linha de Balanço" value={escala} onChange={e=>setEscala(e.target.value as Escala)}>
            <option value="mes">Mensal</option><option value="quinzena">Quinzenal</option>
          </select>
        </label>
      </div>

      {locais.length === 0 ? (
        <div className="lob-pro-vazio"><Activity size={27}/><h3>Não há atividades com local e datas válidos</h3>
          <p>Preencha os campos pavimento/frente, início e duração na aba Atividades. O gráfico não cria informações fictícias.</p>
          <button type="button" className="lob-pro-editar" onClick={onAbrirAtividades}>Abrir Atividades</button></div>
      ) : (
        <div className={"lob-pro-layout"+(recolhida?" lista-recolhida":"")}>
          <aside className="lob-pro-lista" aria-label="Serviços cadastrados">
            <button type="button" className="lob-pro-colapsar" aria-expanded={!recolhida} onClick={()=>setRecolhida(v=>!v)}>
              {recolhida?<ChevronRight size={18}/>:<ChevronDown size={18}/>}
              {!recolhida&&<><strong>{visao==="ritmo"?"Serviços repetidos":"Serviços"}</strong><span>{listadas.length}</span></>}
            </button>
            {!recolhida&&<>
              <label className="lob-pro-pesquisa"><Search size={15}/>
                <input type="search" aria-label="Pesquisar serviço da Linha de Balanço" value={busca} onChange={e=>{setBusca(e.target.value);setSelecionada(null);}} placeholder="Pesquisar por nome ou código"/>
              </label>
              <button type="button" className="lob-pro-mostrar-tudo" onClick={()=>{setBusca("");setSelecionada(null);}}>Mostrar todos os serviços</button>
              <div className="lob-pro-servicos">
                {listadas.map(s=><button type="button" key={s.chave} className={"lob-pro-servico"+((selecionadaSerie?.chave===s.chave || (visao==="ritmo"&&serieRitmo?.chave===s.chave))?" selecionado":"")}
                  onClick={()=>selecionar(s.chave)} aria-pressed={selecionadaSerie?.chave===s.chave || (visao==="ritmo" && serieRitmo?.chave===s.chave)}>
                    {s.repetitiva?<Eye size={14}/>:<EyeOff size={14}/>}
                    <span title={s.nome}>{s.nome}</span>
                    <small>{new Set(s.pontos.map(p=>p.local)).size} local(is)</small>
                  </button>)}
                {listadas.length===0&&<p className="lob-pro-lista-vazia">Nenhum serviço encontrado.</p>}
              </div>
              <div className="lob-pro-nota">Clique em um serviço para isolá-lo. <strong>Ritmo</strong> só conecta serviços repetidos em locais distintos.</div>
            </>}
          </aside>

          <div className="lob-pro-painel">
            <div className="lob-pro-faixa-titulo">
              <div><strong>{visao==="ocupacao"?"Ocupação planejada por local":"Sequência de serviço repetitivo"}</strong>
                <span>{visao==="ocupacao"?"Contagem de atividades com execução no intervalo; não é produtividade.":"Linha contínua = inícios; tracejada = términos planejados."}</span>
              </div>
              {selecionadaSerie&&visao==="ocupacao"&&<button type="button" onClick={()=>setSelecionada(null)}>Limpar filtro</button>}
            </div>

            {visao==="ritmo" && !serieRitmo ? (
              <div className="lob-pro-vazio lob-pro-vazio-tecnico"><Layers3 size={25}/>
                <h3>Sem sequência repetitiva identificável</h3>
                <p>Nesta obra, não foi encontrado um mesmo serviço com um registro inequívoco em pelo menos dois locais. Conectar atividades diferentes produziria uma linha de ritmo falsa.</p>
                <button type="button" onClick={()=>setVisao("ocupacao")}>Consultar ocupação das frentes</button>
                <button type="button" className="lob-pro-editar" onClick={onAbrirAtividades}>Organizar atividades manualmente</button>
              </div>
            ) : (
              <>
                <div className="lob-pro-scroll" role="region" tabIndex={0} aria-label="Diagrama com tempo vertical e locais horizontais">
                  <svg role="img" aria-label={visao==="ocupacao"?"Mapa de ocupação por local e período":"Linhas de início e conclusão de serviços repetitivos"} viewBox={"0 0 "+largura+" "+altura} width={largura} height={altura}>
                    <rect x={0} y={0} width={largura} height={altura} fill="#ffffff"/>
                    {locais.map((local,i)=><g key={local}>
                      <rect x={esquerda+i*larguraLocal} y={topo} width={larguraLocal} height={h} fill={i%2===0?"#f8fbfc":"#ffffff"}/>
                      <line x1={xLocal(local)} y1={topo} x2={xLocal(local)} y2={altura-rodape} stroke="#dce7eb" strokeWidth={1}/>
                      <text x={xLocal(local)} y={28} textAnchor="middle" fontSize={11} fill="#294755" fontWeight={650}>
                        {local.length>16?local.slice(0,14)+"…":local}
                        <title>{local}</title>
                      </text>
                    </g>)}
                    <text x={esquerda-14} y={28} textAnchor="end" fontSize={11} fill="#5c7481" fontWeight={700}>DATA</text>
                    {faixas.map((faixa,i)=>{
                      const yy=yData(faixa.inicio);
                      return <g key={faixa.inicio}>
                        <line x1={esquerda} x2={largura-30} y1={yy} y2={yy} stroke={i===0?"#acbec8":"#dfe8ec"} strokeWidth={i===0?1.5:1}/>
                        {i%intervaloRotulos===0&&<text x={esquerda-12} y={yy+13} textAnchor="end" fontSize={11} fill="#5a7280">{faixa.rotulo}</text>}
                      </g>;
                    })}
                    {visao==="ocupacao" ? faixas.flatMap(faixa=>locais.map(local=>{
                      const lista=ocupacaoNaFaixa(pontosOcupacao,local,faixa);
                      const n=lista.length;
                      if(n===0)return null;
                      const yi=yData(faixa.inicio);
                      const yfim=yData(faixa.fimExclusivo);
                      const cor=CORES_OCUPACAO[Math.min(n,4)];
                      return <g key={faixa.inicio+"-"+local}>
                        <rect x={xLocal(local)-36} y={yi+3} width={72} height={Math.max(3,yfim-yi-6)} rx={4} fill={cor} stroke="#fff" strokeWidth={1}/>
                        <text x={xLocal(local)} y={(yi+yfim)/2+4} textAnchor="middle" fontSize={11} fill={n>=4?"#fff":"#27556b"} fontWeight={750}>{n}</text>
                        <title>{local+" · "+faixa.rotulo+" · "+n+" atividade(s): "+lista.slice(0,8).map(p=>p.nome).join("; ")+(lista.length>8?"…":"")}</title>
                      </g>;
                    })) : serieRitmo && (() => {
                      const ordenados=[...serieRitmo.pontos].sort((a,b)=>locais.indexOf(a.local)-locais.indexOf(b.local));
                      return <g>
                        <polyline fill="none" stroke="#257e94" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
                          points={ordenados.map(p=>xLocal(p.local)+","+yData(p.inicio)).join(" ")}/>
                        <polyline fill="none" stroke="#c17b50" strokeWidth={2.5} strokeDasharray="7 5" strokeLinejoin="round"
                          points={ordenados.map(p=>xLocal(p.local)+","+yData(p.fim)).join(" ")}/>
                        {ordenados.map(p=><g key={p.codigo+"-"+p.local}>
                          <line x1={xLocal(p.local)} y1={yData(p.inicio)} x2={xLocal(p.local)} y2={yData(p.fim)} stroke="#6da9ba" strokeWidth={8} strokeLinecap="round" opacity={0.6}/>
                          <circle cx={xLocal(p.local)} cy={yData(p.inicio)} r={5} fill="#257e94"/>
                          <circle cx={xLocal(p.local)} cy={yData(p.fim)} r={5} fill="#c17b50"/>
                          <title>{legendaPonto(p)}</title>
                        </g>)}
                      </g>;
                    })()}
                    {mostrarHoje&&<g>
                      <line x1={esquerda} x2={largura-30} y1={yData(hoje)} y2={yData(hoje)} stroke="#be6855" strokeDasharray="5 5" strokeWidth={2}/>
                      <text x={largura-28} y={yData(hoje)-5} textAnchor="end" fontWeight={750} fontSize={10} fill="#a65442">HOJE</text>
                    </g>}
                    <line x1={esquerda} x2={largura-30} y1={altura-rodape} y2={altura-rodape} stroke="#acbec8"/>
                    <text x={esquerda+(locais.length*larguraLocal)/2} y={altura-11} textAnchor="middle" fontSize={11} fill="#627c89">LOCAIS DE EXECUÇÃO</text>
                  </svg>
                </div>
                {visao==="ocupacao"?
                  <div className="lob-pro-legenda">
                    <strong>Atividades no intervalo</strong>
                    {[1,2,3,4].map(n=><span key={n}><i style={{background:CORES_OCUPACAO[n]}}/>{n===4?"4 ou mais":String(n)}</span>)}
                    <small>Intervalos de calendário; não confundir ocupação com avanço físico.</small>
                  </div>
                  : <div className="lob-pro-legenda"><strong>{serieRitmo?.nome}</strong><span><i style={{background:"#257e94"}}/> Inícios</span><span><i style={{background:"#c17b50"}}/> Términos</span></div>}
              </>
            )}
            {descartadas>0&&<p className="lob-pro-aviso">{descartadas} registros sem datas válidas ou marcos não entram nesta leitura de duração.</p>}
            {semLocal>0&&<p className="lob-pro-aviso">{semLocal} atividades possuem datas, mas ainda não têm frente/pavimento cadastrado.</p>}
            <p className="lob-pro-rodape">A interpretação das linhas depende do cadastro correto das frentes. Para atualizar duração, quantitativo ou local, utilize a aba Atividades. Esta tela não calcula produtividade nem altera o cronograma.</p>
          </div>
        </div>
      )}
      </>)}
    </section>
  );
}
