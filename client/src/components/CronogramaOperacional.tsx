import {useCallback,useEffect,useMemo,useState} from "react";
import {Activity,GitBranch,GanttChartSquare,MapPin,Search} from "lucide-react";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import type {IsoDate} from "@shared/work-calendar";
import {trpc} from "@/lib/trpc";
import {estadoCronogramaDaQuery,estadoCronogramaNaQuery,selecionarLinhasOperacionais,type EstadoCronogramaOperacional,type LinhaCronogramaOperacional} from "@/lib/cronograma-operacional";
import {VisualizacaoPlanejamento} from "./VisualizacaoPlanejamento";
import {AbaDependencias} from "./AbaDependencias";
import {InspetorAtividade} from "./InspetorAtividade";
import {ReadinessGate} from "./ReadinessGate";

type Props={projetoId:number;linhas:EntradaDaLinha[];inicioObra:IsoDate|null;hoje:IsoDate;titulo?:string;codigoObra?:string|null;localObra?:string|null;finsCalculados:Record<string,string>;codigosExemplo?:ReadonlySet<string>;layoutProfissional?:boolean};
const modos = ["cronograma","fluxo","rede"] as const;
const rotuloModo={cronograma:"Cronograma",fluxo:"Fluxo",rede:"Rede"};
const filtros=[
  ["todas","Todas"],["criticas","Críticas"],["atrasadas","Atrasadas"],["bloqueadas","Bloqueadas"],["sem_medicao","Sem medição"],
] as const;

export function CronogramaOperacional({projetoId,linhas,inicioObra,hoje,titulo,codigoObra,localObra,finsCalculados,codigosExemplo,layoutProfissional=true}:Props){
  const planejamento=trpc.planning.list.useQuery({projectId:projetoId},{enabled:projetoId>0});
  const restricoes=trpc.planning.restricoes.useQuery({projectId:projetoId,incluirResolvidas:false},{enabled:projetoId>0});
  const baseline=trpc.planning.compararComBaseline.useQuery({projectId:projetoId},{enabled:projetoId>0,retry:false});
  const [estado,setEstado]=useState<EstadoCronogramaOperacional>(()=>typeof window==="undefined"
    ? {atividadeSelecionadaId:null,modo:"cronograma",busca:"",filtro:"todas"}
    : estadoCronogramaDaQuery(window.location.search));
  useEffect(()=>{
    if(typeof window==="undefined")return;
    const url=new URL(window.location.href);
    for(const chave of ["modo","filtro","busca","atividade"])url.searchParams.delete(chave);
    const query=new URLSearchParams(estadoCronogramaNaQuery(estado));
    query.forEach((valor,chave)=>url.searchParams.set(chave,valor));
    window.history.replaceState(null,"",url);
  },[estado]);
  const atividadePorId=useMemo(()=>new Map((planejamento.data?.activities??[]).map(item=>[item.id,item])),[planejamento.data]);
  const restricoesPorAtividade=useMemo(()=>{
    const mapa=new Map<number,number>();
    for(const item of restricoes.data?.itens??[])mapa.set(item.activityId,(mapa.get(item.activityId)??0)+1);
    return mapa;
  },[restricoes.data]);
  const operacionais=useMemo<LinhaCronogramaOperacional[]>(()=>linhas.map(linha=>{
    const atividade=atividadePorId.get(linha.activityId);
    const fim=finsCalculados[String(linha.activityId)]??linha.inicio;
    const quantidade=linha.quantidade==null?null:Number(linha.quantidade);
    const executado=linha.executado==null?null:Number(linha.executado);
    const concluida=quantidade!=null&&quantidade>0&&executado!=null&&executado>=quantidade;
    return {activityId:linha.activityId,codigo:linha.codigo,atividade:linha.atividade,inicio:linha.inicio,fim,duracao:linha.duracao,
      executado,quantidade,unidade:linha.unidade??null,pavimento:linha.pavimento??null,
      critica:Number(atividade?.critical??0)===1,atrasada:fim<hoje&&!concluida,
      bloqueada:restricoes.isPending||restricoes.isError?null:(restricoesPorAtividade.get(linha.activityId)??0)>0};
  }),[linhas,atividadePorId,finsCalculados,hoje,restricoesPorAtividade,restricoes.isPending,restricoes.isError]);
  const visiveis=useMemo(()=>selecionarLinhasOperacionais(operacionais,estado),[operacionais,estado]);
  const idsVisiveis=useMemo(()=>new Set(visiveis.map(item=>item.activityId)),[visiveis]);
  const linhasVisiveis=useMemo(()=>linhas.filter(linha=>idsVisiveis.has(linha.activityId)),[linhas,idsVisiveis]);
  const selecionada=operacionais.find(item=>item.activityId===estado.atividadeSelecionadaId)??null;
  const dependencias=planejamento.data?.dependencies??[];
  const predecessoras=selecionada?dependencias.filter(dep=>dep.successorId===selecionada.activityId).length:0;
  const sucessoras=selecionada?dependencias.filter(dep=>dep.predecessorId===selecionada.activityId).length:0;
  const atualizar=useCallback((parcial:Partial<EstadoCronogramaOperacional>)=>setEstado(atual=>({...atual,...parcial})),[]);
  const abrirAba=useCallback((aba:string)=>window.dispatchEvent(new CustomEvent("abrir-aba",{detail:{aba}})),[]);
  const fecharInspetor=useCallback(()=>atualizar({atividadeSelecionadaId:null}),[atualizar]);
  const linhaBaseline=selecionada?baseline.data?.linhas.find(item=>item.atividadeId===selecionada.activityId)??null:null;
  const resumoOperacional=useMemo(()=>({
    atrasadas:operacionais.filter(item=>item.atrasada).length,
    bloqueadas:operacionais.filter(item=>item.bloqueada===true).length,
    criticas:operacionais.filter(item=>item.critica).length,
    semLocal:operacionais.filter(item=>!item.pavimento).length,
  }),[operacionais]);
  const descricaoModo=estado.modo==="cronograma"
    ? "Lista operacional para decidir o que começa, termina e exige atenção."
    : estado.modo==="fluxo"
      ? "Leitura por local e frente para conferir ritmo e transferência entre unidades."
      : "Rede de precedências para explicar bloqueios e o caminho de execução.";
  return <section className="cronograma-operacional" aria-labelledby="cronograma-titulo">
    {typeof window !== "undefined" && <ReadinessGate projetoId={projetoId} abrirAba={abrirAba} />}
    <header className="cronograma-operacional-topo"><div><small>PLANEJAMENTO INTEGRADO</small><h1 id="cronograma-titulo">Cronograma operacional</h1><p>Selecione uma atividade para conferir datas, rede, local, medição e evidências no mesmo fluxo.</p></div><div className="cronograma-modos" role="tablist" aria-label="Modo do cronograma">
      {modos.map(modo=><button key={modo} type="button" role="tab" aria-selected={estado.modo===modo} className={estado.modo===modo?"ativo":""} onClick={()=>atualizar({modo})}>{modo==="cronograma"?<GanttChartSquare size={16}/>:modo==="fluxo"?<Activity size={16}/>:<GitBranch size={16}/>}{rotuloModo[modo]}</button>)}
    </div></header>
    <div className="cronograma-modo-explicacao"><strong>{rotuloModo[estado.modo]}:</strong><span>{descricaoModo}</span></div>
    <div className="cronograma-resumo" aria-label="Resumo do cronograma"><div><small>ATIVIDADES</small><b>{operacionais.length}</b></div><div><small>ATRASADAS</small><b className={resumoOperacional.atrasadas?"alerta":""}>{resumoOperacional.atrasadas}</b></div><div><small>BLOQUEADAS</small><b className={resumoOperacional.bloqueadas?"alerta":""}>{resumoOperacional.bloqueadas}</b></div><div><small>SEM LOCAL</small><b className={resumoOperacional.semLocal?"alerta":""}>{resumoOperacional.semLocal}</b></div><div><small>CRÍTICAS</small><b>{resumoOperacional.criticas}</b></div></div>
    <div className="cronograma-controles"><label className="cronograma-busca"><span>Pesquisar atividade</span><div><Search size={15}/><input value={estado.busca} onChange={e=>atualizar({busca:e.target.value})} placeholder="Código, serviço ou local"/></div></label><label><span>Filtrar</span><select value={estado.filtro} onChange={e=>atualizar({filtro:e.target.value as EstadoCronogramaOperacional["filtro"]})}>{filtros.map(([valor,rotulo])=><option key={valor} value={valor}>{rotulo}</option>)}</select></label><strong aria-live="polite">{visiveis.length} de {operacionais.length} atividades</strong></div>
    <div className="cronograma-grade" role="region" aria-label="Atividades do cronograma" tabIndex={0}>
      <div className="cronograma-grade-cab"><span>Atividade</span><span>Local</span><span>Início</span><span>Término</span><span>Situação</span></div>
      {restricoes.isError&&<div className="cronograma-orientacao" role="alert"><strong>Não foi possível confirmar as restrições.</strong><p>O sistema não considera as atividades liberadas enquanto esta consulta falhar. Tente novamente antes de assumir que a frente está desbloqueada.</p></div>}
      {visiveis.map(linha=><button key={linha.activityId} type="button" className={`cronograma-linha${estado.atividadeSelecionadaId===linha.activityId?" selecionada":""}`} style={visiveis.length>50?{contentVisibility:"auto",containIntrinsicSize:"42px"}:undefined} onClick={()=>atualizar({atividadeSelecionadaId:linha.activityId})} aria-pressed={estado.atividadeSelecionadaId===linha.activityId}>
        <span><b>{linha.codigo}</b>{linha.atividade}{linha.critica&&<em>Crítica</em>}</span><span>{linha.pavimento??<><MapPin size={13}/> Vincular local</>}</span><span>{linha.inicio}</span><span>{linha.fim}</span><span>{linha.bloqueada===null?"Restrições indisponíveis":linha.bloqueada?"Bloqueada":linha.atrasada?"Atrasada":linha.executado?"Em execução":"Planejada"}</span>
      </button>)}</div>
    {estado.modo==="fluxo"&&selecionada&&!selecionada.pavimento&&<div className="cronograma-orientacao" role="status"><strong>Esta atividade ainda não pode entrar no fluxo por local.</strong><p>Vincule um local físico na EAP. Depois, retorne ao Cronograma: a atividade aparecerá na escadinha sem perder datas ou dependências.</p><button type="button" onClick={()=>abrirAba("eap")}>Vincular local na EAP</button></div>}
    <div className="cronograma-visual">{estado.modo==="rede"?<AbaDependencias projetoId={projetoId}/>:<VisualizacaoPlanejamento projetoId={projetoId} linhas={linhasVisiveis} inicioObra={inicioObra} hoje={hoje} view={estado.modo==="fluxo"?"lob":"gantt"} titulo={titulo} codigoObra={codigoObra} localObra={localObra} finsCalculados={finsCalculados} codigosExemplo={codigosExemplo} layoutProfissional={layoutProfissional} atividadeSelecionadaId={estado.atividadeSelecionadaId} onSelecionarAtividade={activityId=>atualizar({atividadeSelecionadaId:activityId})}/>}</div>
    {selecionada&&<InspetorAtividade
      linha={selecionada}
      predecessoras={predecessoras}
      sucessoras={sucessoras}
      restricoesAbertas={restricoes.isPending||restricoes.isError?null:restricoesPorAtividade.get(selecionada.activityId)??0}
      baseline={baseline.isPending?{estado:"carregando"}:baseline.isError?{estado:"erro"}:!baseline.data?{estado:"ausente"}:{estado:"pronto",inicio:linhaBaseline?.baselineInicio??null,fim:linhaBaseline?.baselineFim??null,deltaFim:linhaBaseline?.deltaFim??null}}
      onFechar={fecharInspetor}
      onAbrirAba={abrirAba}
    />}
  </section>;
}
