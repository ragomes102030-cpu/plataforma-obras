import { useMemo, useState } from "react";
import { Activity, CalendarDays, ChevronDown, ChevronRight, Eye, EyeOff, Layers3, ListTodo } from "lucide-react";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import type { IsoDate } from "@shared/work-calendar";

/**
 * Visualização vertical comum a todas as obras, baseada nos dados de planejamento.grade.
 * Não sintetiza pavimentos, atividades, durações, produtividades ou datas.
 * Nenhuma mutação, chamada ao agente ou cálculo de CPM ocorre aqui.
 */
type Props = { linhas: EntradaDaLinha[]; finsCalculados: Record<string, string>; hoje: IsoDate; onAbrirAtividades: () => void };
type Ponto = { codigo: string; nome: string; local: string; inicio: string; fim: string; executado: number; quantidade: number | null; unidade: string | null };
type Serie = { nome: string; chave: string; pontos: Ponto[]; cor: string };
const DIA = 86400000;
const CORES = ["#286d86", "#b7764d", "#407d6f", "#8168a6", "#987c2b", "#9a5b71", "#5177a3", "#5f8c48"];
function ms(iso: string) { return new Date(iso + "T12:00:00Z").getTime(); }
function somar(iso: string, dias: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function dataBr(iso: string) { const [a,m,d] = iso.split("-"); return d + "/" + m + "/" + a; }
function ehData(iso: string) { return /^\d{4}-\d\d-\d\d$/.test(iso) && Number.isFinite(ms(iso)); }
function obterLocais(linhas: EntradaDaLinha[]): string[] {
  return Array.from(new Set(linhas.map(l => String(l.pavimento || l.frente || "").trim()).filter(Boolean)))
    .sort((a,b) => a.localeCompare(b, "pt-BR", {numeric:true}));
}
export function prepararLinhaBalancoAurora(linhas: EntradaDaLinha[], finsCalculados: Record<string,string>) {
  const validas = linhas.filter(l => !l.marco && ehData(l.inicio) && ehData(finsCalculados[l.codigo] ?? "") && Number.isFinite(l.duracao) && l.duracao >= 1);
  const locais = obterLocais(validas);
  const servicos = new Map<string, Serie>();
  validas.forEach(l => {
    const local = String(l.pavimento || l.frente || "").trim();
    if (!local) return;
    const nome = l.atividade.trim();
    const chave = nome.toLocaleLowerCase("pt-BR");
    if (!chave) return;
    if (!servicos.has(chave)) servicos.set(chave, {nome, chave, pontos: [], cor:CORES[servicos.size % CORES.length]});
    servicos.get(chave)!.pontos.push({
      codigo:l.codigo, nome, local,
      inicio:l.inicio, fim:finsCalculados[l.codigo],
      executado:l.executado, quantidade:l.quantidade, unidade:l.unidade
    });
  });
  return { locais, series:Array.from(servicos.values()), semLocal:validas.filter(l => !(l.pavimento || l.frente)).length };
}

export function LinhaBalancoVertical({linhas,finsCalculados,hoje,onAbrirAtividades}:Props) {
  const {locais,series,semLocal} = useMemo(()=>prepararLinhaBalancoAurora(linhas,finsCalculados),[linhas,finsCalculados]);
  const [ocultas,setOcultas]=useState<Set<string>>(()=>new Set());
  const [recolhido,setRecolhido]=useState(false);
  const [busca,setBusca]=useState("");
  const [escala,setEscala]=useState<"quinzena"|"mes">("mes");
  const [selecionada,setSelecionada]=useState<string|null>(null);
  const filtradas=series.filter(s => s.nome.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR")));
  const ativas=filtradas.filter(s=>!ocultas.has(s.chave));
  const pontos=series.flatMap(s=>s.pontos);
  const primeira=pontos.reduce((min,p)=>!min||ms(p.inicio)<ms(min)?p.inicio:min,"");
  const ultima=pontos.reduce((max,p)=>!max||ms(p.fim)>ms(max)?p.fim:max,"");
  const inicio=primeira || hoje;
  const fim=ultima || hoje;
  const dias=Math.max(28,Math.round((ms(fim)-ms(inicio))/DIA)+14);
  const altura=Math.max(520,Math.min(1250,dias*2.5));
  const largura=Math.max(740,105+locais.length*110+80);
  const topo=52, rodape=65, direita=52, esquerda=106;
  const h=altura-topo-rodape;
  const x=(local:string)=>esquerda+locais.indexOf(local)*110+55;
  const y=(iso:string)=>topo+((ms(iso)-ms(inicio))/DIA)/dias*h;
  const tics:string[]=[];
  let cursor=inicio;
  let guard=0;
  while(ms(cursor)<=ms(somar(fim,14))&&guard++<70) {
    tics.push(cursor);
    cursor=somar(cursor,escala==="mes"?30:15);
  }
  const temRepeticoes=series.some(s=>new Set(s.pontos.map(p=>p.local)).size>1);
  const selecionadaSerie=series.find(s=>s.chave===selecionada);
  function toggle(key:string) { setOcultas(current=>{const next=new Set(current);next.has(key)?next.delete(key):next.add(key);return next;}); }
  return (
    <section className="aurora-lob" aria-label="Linha de Balanço vertical — planejamento da obra">
      <header className="aurora-lob-cabecalho">
        <div>
          <span className="aurora-piloto-eyebrow"><Layers3 size={14}/> PILOTO LINHA DE BALANÇO · PLANEJAMENTO</span>
          <h2>Ritmo de produção — dados do planejamento</h2>
          <p>Tempo na vertical · locais na horizontal · frentes recolhíveis. Visualização de leitura.</p>
        </div>
        <button type="button" className="aurora-manual-action" onClick={onAbrirAtividades}><ListTodo size={16}/> Editar atividades manualmente</button>
      </header>
      <div className="aurora-lob-resumo">
        <span><strong>{locais.length}</strong> locais informados</span>
        <span><strong>{series.length}</strong> serviços</span>
        <span><strong>{pontos.length}</strong> registros</span>
        <span><strong>{series.filter(s=>new Set(s.pontos.map(p=>p.local)).size>1).length}</strong> séries repetitivas</span>
      </div>
      {locais.length===0 ? (
        <div className="aurora-lob-vazio"><Activity size={28}/><h3>Nenhuma frente com local cadastrado</h3><p>Preencha manualmente o campo <strong>pavimento</strong> ou <strong>frente</strong> das atividades. O gráfico não cria unidades repetitivas fictícias.</p><button type="button" className="aurora-manual-action" onClick={onAbrirAtividades}>Abrir atividades</button></div>
      ) : (
        <div className="aurora-lob-area">
          <aside className="aurora-lob-lista">
            <div className="aurora-lob-lista-top">
              <button type="button" onClick={()=>setRecolhido(v=>!v)} aria-expanded={!recolhido} className="aurora-lob-dobra">{recolhido?<ChevronRight size={16}/>:<ChevronDown size={16}/>} <strong>Frentes / serviços</strong><span>{filtradas.length}</span></button>
              {!recolhido&&<><label className="aurora-lob-busca"><span>⌕</span><input aria-label="Pesquisar serviços da Linha de Balanço" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Pesquisar serviço"/></label><div className="aurora-lob-atalhos"><button type="button" onClick={()=>setOcultas(new Set())}>Exibir todos</button><button type="button" onClick={()=>setOcultas(new Set(series.map(s=>s.chave)))}>Ocultar todos</button></div></>}
            </div>
            {!recolhido&&<div className="aurora-lob-itens">
              {filtradas.map(s=><div key={s.chave} className={"aurora-lob-item"+(selecionada===s.chave?" ativo":"")}>
                <button type="button" className="aurora-lob-visibilidade" aria-label={(ocultas.has(s.chave)?"Mostrar ":"Ocultar ")+s.nome} onClick={()=>toggle(s.chave)}>{ocultas.has(s.chave)?<EyeOff size={15}/>:<Eye size={15}/>}</button>
                <button type="button" className="aurora-lob-nome" onClick={()=>setSelecionada(s.chave)}><i style={{background:s.cor}}/><span title={s.nome}>{s.nome}</span><small>{new Set(s.pontos.map(p=>p.local)).size} locais</small></button>
              </div>)}
            </div>}
            {semLocal>0&&<p className="aurora-lob-aviso">{semLocal} atividade(s) sem local cadastrado não aparecem no gráfico.</p>}
            {selecionadaSerie&&<div className="aurora-lob-detalhe"><strong>{selecionadaSerie.nome}</strong><span>{selecionadaSerie.pontos.length} registro(s) · início {dataBr(selecionadaSerie.pontos[0]!.inicio)}</span><button type="button" onClick={onAbrirAtividades}>Ir às atividades para editar <ChevronRight size={14}/></button></div>}
          </aside>
          <div className="aurora-lob-visual">
            <div className="aurora-lob-top">
              <span><CalendarDays size={15}/> Datas ↓ &nbsp; Locais →</span>
              <label>Intervalo de leitura <select aria-label="Intervalo das datas" value={escala} onChange={e=>setEscala(e.target.value as "quinzena"|"mes")}><option value="mes">Mensal</option><option value="quinzena">Quinzenal</option></select></label>
            </div>
            <div className="aurora-lob-scroll">
              <svg role="img" aria-label="Linha de Balanço com datas no eixo vertical" width={largura} height={altura} viewBox={"0 0 "+largura+" "+altura}>
                <rect x="0" y="0" width={largura} height={altura} fill="#fff"/>
                {tics.map(d=><g key={d}><line x1={esquerda} x2={largura-direita} y1={y(d)} y2={y(d)} stroke="#e3eaf0" strokeWidth="1"/><text x={esquerda-12} y={y(d)+4} fill="#62717b" textAnchor="end" fontSize="11">{dataBr(d).slice(0,5)}</text></g>)}
                {locais.map(l=><g key={l}><line x1={x(l)} x2={x(l)} y1={topo} y2={altura-rodape} stroke="#e3eaf0" strokeWidth="1"/><text x={x(l)} y="27" fontSize="12" textAnchor="middle" fill="#334853" fontWeight="600">{l.length>15?l.slice(0,13)+"…":l}</text></g>)}
                {ativas.map(s=>{
                  const ordenados=[...s.pontos].sort((a,b)=>x(a.local)-x(b.local));
                  const unicos=new Set(ordenados.map(p=>p.local)).size;
                  return <g key={s.chave} opacity={selecionada&&selecionada!==s.chave?.43:1}>
                    {unicos>1&&<polyline points={ordenados.map(p=>x(p.local)+","+y(p.inicio)).join(" ")} stroke={s.cor} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fill="none"/>}
                    {ordenados.map(p=><g key={p.codigo+"-"+p.local}>
                      <line x1={x(p.local)} y1={y(p.inicio)} x2={x(p.local)} y2={y(p.fim)} stroke={s.cor} strokeWidth="7" strokeLinecap="round" opacity=".62"/>
                      <circle cx={x(p.local)} cy={y(p.inicio)} r="5" fill={s.cor}><title>{s.nome+" · "+p.local+" · "+dataBr(p.inicio)+" até "+dataBr(p.fim)+" · "+p.executado+(p.unidade ? " "+p.unidade : "")}</title></circle>
                    </g>)}
                  </g>;
                })}
                {ms(hoje)>=ms(inicio)&&ms(hoje)<=ms(somar(fim,14))&&<g><line x1={esquerda} x2={largura-direita} y1={y(hoje)} y2={y(hoje)} stroke="#c7664a" strokeDasharray="5 4" strokeWidth="1.5"/><text x={largura-direita+6} y={y(hoje)+3} fill="#a45037" fontWeight="700" fontSize="10">HOJE</text></g>}
                <text x={largura/2} y={altura-17} textAnchor="middle" fontSize="12" fill="#546d79">PAVIMENTOS / FRENTES</text>
              </svg>
            </div>
            {!temRepeticoes&&<p className="aurora-lob-avisotecnico">Os locais atuais não formam séries repetitivas do mesmo serviço. Para visualizar linhas de ritmo entre pavimentos, cadastre atividades equivalentes por pavimento.</p>}
            <p className="aurora-lob-rodape">As linhas ligam inícios informados para o mesmo serviço em locais diferentes; não são produtividade calculada. Alterações são realizadas na aba Atividades.</p>
          </div>
        </div>
      )}
    </section>
  );
}
