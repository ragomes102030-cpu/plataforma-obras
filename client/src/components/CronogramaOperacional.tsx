import {useCallback,useEffect,useMemo,useState} from "react";
import {Activity,GitBranch,GanttChartSquare,Search} from "lucide-react";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import type {ActivityScheduleStatus} from "@shared/activity-schedule-update";
import type {IsoDate} from "@shared/work-calendar";
import {trpc} from "@/lib/trpc";
import {estadoCronogramaDaQuery,estadoCronogramaNaQuery,identificarLocalOperacional,selecionarLinhasOperacionais,type EstadoCronogramaOperacional,type LinhaCronogramaOperacional} from "@/lib/cronograma-operacional";
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
  const relatosPrazo=trpc.planning.activityScheduleStatusSummary.useQuery({projectId:projetoId,asOf:hoje},{enabled:projetoId>0});
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
  const relatoPorAtividade=useMemo(()=>new Map((relatosPrazo.data?.currentStates??[]).map(item=>[item.activityId,item])),[relatosPrazo.data]);
  const situacoesTemporais=useMemo(()=>{
    const estados=new Map<number,{status:ActivityScheduleStatus;positionDate:string;forecastFinishDate:string|null}>();
    for(const item of relatosPrazo.data?.currentStates??[])estados.set(item.activityId,{
      status:item.status as ActivityScheduleStatus,
      positionDate:item.positionDate,
      forecastFinishDate:item.forecastFinishDate,
    });
    return estados;
  },[relatosPrazo.data]);
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
    const relato=relatoPorAtividade.get(linha.activityId);
    const previsaoVencida=relato?.status!=="concluida"&&relato?.forecastFinishDate!=null&&relato.forecastFinishDate<hoje;
    return {activityId:linha.activityId,codigo:linha.codigo,atividade:linha.atividade,inicio:linha.inicio,fim,duracao:linha.duracao,
      executado,quantidade,unidade:linha.unidade??null,pavimento:atividade?.pavimentoIsProductionUnit?atividade.pavimento??null:atividade?.wbsLocationIsProductionUnit?atividade.wbsLocation:null,
      isMilestone:atividade?.isMilestone===true,localEap:atividade?.wbsLocation??null,localDeclarado:atividade?.pavimento??null,
      estadoConsultaLocal:planejamento.isError?"erro":planejamento.isPending||!atividade?"carregando":"pronto",
      critica:Number(atividade?.critical??0)===1,atrasada:Boolean(previsaoVencida),
      estadoRelatado:relato?.status??null,dataPosicao:relato?.positionDate??null,previsaoRelatada:relato?.forecastFinishDate??null,
      bloqueada:relatosPrazo.isError?null:relato?.status==="bloqueada",
      restricoesAbertas:restricoes.isPending||restricoes.isError?null:restricoesPorAtividade.get(linha.activityId)??0,
      lobApplicability:atividade?.lobApplicability??null,lobApplicabilityReason:atividade?.lobApplicabilityReason??null,
      planejamentoRelativo:false};
  }),[linhas,atividadePorId,relatoPorAtividade,finsCalculados,hoje,restricoesPorAtividade,restricoes.isPending,restricoes.isError,relatosPrazo.isError,planejamento.isError,planejamento.isPending]);
  const operacionaisComPlanoRelativo=useMemo<LinhaCronogramaOperacional[]>(()=>{
    if(inicioObra||linhas.length>0||planejamento.isPending||planejamento.isError)return operacionais;
    return (planejamento.data?.activities??[])
      .filter(activity=>Number(activity.exemplo??0)!==1&&!codigosExemplo?.has(activity.wbsCode??""))
      .map(activity=>{
        const offset=Math.max(0,Number(activity.startOffset??0));
        const duracao=Math.max(1,Number(activity.durationDays??1));
        const relato=relatoPorAtividade.get(activity.id);
        const previsaoVencida=relato?.status!=="concluida"&&relato?.forecastFinishDate!=null&&relato.forecastFinishDate<hoje;
        return {
          activityId:activity.id,codigo:activity.wbsCode,atividade:activity.name,
          inicio:`D+${offset}`,fim:`D+${offset+duracao-1}`,duracao,
          executado:null,quantidade:activity.plannedQuantity==null?null:Number(activity.plannedQuantity),
          unidade:activity.unit??null,pavimento:activity.pavimentoIsProductionUnit?activity.pavimento??null:activity.wbsLocationIsProductionUnit?activity.wbsLocation:null,
          isMilestone:activity.isMilestone===true,localEap:activity.wbsLocation??null,localDeclarado:activity.pavimento??null,estadoConsultaLocal:"pronto",
          critica:false,atrasada:Boolean(previsaoVencida),
          bloqueada:relatosPrazo.isError?null:relato?.status==="bloqueada",
          estadoRelatado:relato?.status??null,dataPosicao:relato?.positionDate??null,
          previsaoRelatada:relato?.forecastFinishDate??null,
          restricoesAbertas:restricoes.isPending||restricoes.isError?null:restricoesPorAtividade.get(activity.id)??0,
          lobApplicability:activity.lobApplicability??null,lobApplicabilityReason:activity.lobApplicabilityReason??null,
          planejamentoRelativo:true,
        };
      });
  },[inicioObra,linhas.length,planejamento.data,planejamento.isPending,planejamento.isError,codigosExemplo,relatoPorAtividade,hoje,relatosPrazo.isError,restricoes.isPending,restricoes.isError,restricoesPorAtividade,operacionais]);
  const operacionaisExibidas=inicioObra?operacionais:operacionaisComPlanoRelativo;
  const visiveis=useMemo(()=>selecionarLinhasOperacionais(operacionaisExibidas,estado),[operacionaisExibidas,estado]);
  const idsVisiveis=useMemo(()=>new Set(visiveis.map(item=>item.activityId)),[visiveis]);
  const linhasVisiveis=useMemo(()=>linhas.filter(linha=>idsVisiveis.has(linha.activityId)),[linhas,idsVisiveis]);
  const selecionada=operacionaisExibidas.find(item=>item.activityId===estado.atividadeSelecionadaId)??null;
  const dependencias=planejamento.data?.dependencies??[];
  const predecessoras=selecionada?dependencias.filter(dep=>dep.successorId===selecionada.activityId).length:0;
  const sucessoras=selecionada?dependencias.filter(dep=>dep.predecessorId===selecionada.activityId).length:0;
  const atualizar=useCallback((parcial:Partial<EstadoCronogramaOperacional>)=>setEstado(atual=>({...atual,...parcial})),[]);
  const abrirAba=useCallback((aba:string)=>window.dispatchEvent(new CustomEvent("abrir-aba",{detail:{aba}})),[]);
  const fecharInspetor=useCallback(()=>atualizar({atividadeSelecionadaId:null}),[atualizar]);
  const linhaBaseline=selecionada?baseline.data?.linhas.find(item=>item.atividadeId===selecionada.activityId)??null:null;
  const resumoOperacional=useMemo(()=>({
    atrasadas:operacionaisExibidas.filter(item=>item.atrasada).length,
    bloqueadas:operacionaisExibidas.filter(item=>item.bloqueada===true).length,
    criticas:operacionaisExibidas.filter(item=>item.critica).length,
    semLocal:operacionaisExibidas.filter(item=>["escopo","a_definir"].includes(identificarLocalOperacional(item).estado)).length,
    revisarGlobais:operacionaisExibidas.filter(item=>identificarLocalOperacional(item).estado==="revisar_global").length,
  }),[operacionaisExibidas]);
  const temPlanoRelativo=!inicioObra&&operacionaisExibidas.some(item=>item.planejamentoRelativo);
  const descricaoModo=estado.modo==="cronograma"
    ? "Lista operacional para decidir o que começa, termina e exige atenção."
    : estado.modo==="fluxo"
      ? "Leitura por local e frente para conferir ritmo e transferência entre unidades."
      : "Rede de precedências para explicar bloqueios e o caminho de execução.";
  return <section className="cronograma-operacional" aria-labelledby="cronograma-titulo">
    {typeof window !== "undefined" && <ReadinessGate projetoId={projetoId} abrirAba={abrirAba} contexto="cronograma" />}
    <header className="cronograma-operacional-topo"><div><small>PLANEJAMENTO INTEGRADO</small><h1 id="cronograma-titulo">Cronograma operacional</h1><p>Selecione uma atividade para conferir prazo, rede, local, medição e evidências no mesmo fluxo.</p></div><div className="cronograma-modos" role="tablist" aria-label="Modo do cronograma">
      {modos.map(modo=><button key={modo} type="button" role="tab" aria-selected={estado.modo===modo} className={estado.modo===modo?"ativo":""} onClick={()=>atualizar({modo})}>{modo==="cronograma"?<GanttChartSquare size={16}/>:modo==="fluxo"?<Activity size={16}/>:<GitBranch size={16}/>}{rotuloModo[modo]}</button>)}
    </div></header>
    <div className="cronograma-modo-explicacao"><strong>{rotuloModo[estado.modo]}:</strong><span>{descricaoModo}</span></div>
    {temPlanoRelativo&&<div className="cronograma-orientacao" role="note"><strong>Planejamento em dias relativos</strong><p>Os marcos D+ mostram início e duração cadastrados, sem presumir uma data civil. Informe o início planejado em Escopo para calcular o CPM, comparar a baseline e liberar Gantt e Linha de Balanço. Você já pode registrar o andamento de cada atividade nesta tela.</p><button type="button" onClick={()=>abrirAba("escopo")}>Informar início planejado</button></div>}
    {planejamento.isError&&<div className="cronograma-orientacao" role="alert"><strong>Não foi possível carregar as atividades do plano.</strong><p>Tente novamente antes de interpretar a lista vazia como ausência de atividades.</p></div>}
    <div className="cronograma-resumo" aria-label="Resumo do cronograma"><div><small>ATIVIDADES</small><b>{operacionaisExibidas.length}</b></div><div><small>PREVISÕES VENCIDAS</small><b className={resumoOperacional.atrasadas?"alerta":""}>{resumoOperacional.atrasadas}</b></div><div><small>BLOQUEADAS POR RELATO</small><b className={resumoOperacional.bloqueadas?"alerta":""}>{resumoOperacional.bloqueadas}</b></div><div><small title="Atividades com escopo físico a detalhar ou local a definir; não bloqueiam o cronograma por prazo.">LOCAL A DETALHAR</small><b>{planejamento.isPending||planejamento.isError?"—":resumoOperacional.semLocal}</b></div><div><small>CRÍTICAS</small><b>{temPlanoRelativo?"—":resumoOperacional.criticas}</b></div></div>
    <div className="cronograma-controles"><label className="cronograma-busca"><span>Pesquisar atividade</span><div><Search size={15}/><input value={estado.busca} onChange={e=>atualizar({busca:e.target.value})} placeholder="Código, serviço ou local"/></div></label><label><span>Filtrar</span><select value={estado.filtro} onChange={e=>atualizar({filtro:e.target.value as EstadoCronogramaOperacional["filtro"]})}>{filtros.map(([valor,rotulo])=><option key={valor} value={valor}>{rotulo}</option>)}</select></label><strong aria-live="polite">{visiveis.length} de {operacionaisExibidas.length} atividades</strong></div>
    <p className="cronograma-modo-explicacao"><span>Local confirmado: unidade cadastrada. Distribuição a detalhar: serviço repetitivo com escopo em vários locais. Não se aplica: serviço sem vínculo físico necessário. “(sug.)” indica classificação sugerida, ainda a confirmar. Essas situações não impedem o planejamento por prazo.</span></p>
    {resumoOperacional.revisarGlobais>0&&<p className="cronograma-modo-explicacao"><span>{resumoOperacional.revisarGlobais} atividade(s) com sugestão de não aplicação da LOB. Confirme no inspetor; não são contabilizadas como vínculos físicos pendentes.</span></p>}
    <div className="cronograma-grade" role="region" aria-label="Atividades do cronograma" tabIndex={0}>
      <div className="cronograma-grade-cab"><span>Atividade</span><span>Local</span><span>Início</span><span>Término</span><span>Situação</span></div>
      {restricoes.isError&&<div className="cronograma-orientacao" role="alert"><strong>Não foi possível confirmar as restrições.</strong><p>O sistema não considera as atividades liberadas enquanto esta consulta falhar. Tente novamente antes de assumir que a frente está desbloqueada.</p></div>}
      {visiveis.map(linha=><button key={linha.activityId} type="button" className={`cronograma-linha${estado.atividadeSelecionadaId===linha.activityId?" selecionada":""}`} style={visiveis.length>50?{contentVisibility:"auto",containIntrinsicSize:"42px"}:undefined} onClick={()=>atualizar({atividadeSelecionadaId:linha.activityId})} aria-pressed={estado.atividadeSelecionadaId===linha.activityId}>
        <span><b>{linha.codigo}</b>{linha.atividade}{linha.critica&&<em>Crítica</em>}</span><span title={identificarLocalOperacional(linha).detalhe}>{identificarLocalOperacional(linha).rotulo}</span><span>{linha.inicio}</span><span>{linha.fim}</span><span>{linha.estadoRelatado?`${({nao_iniciada:"Não iniciada",em_andamento:"Em andamento",concluida:"Concluída",bloqueada:"Bloqueada"} as Record<string,string>)[linha.estadoRelatado]??linha.estadoRelatado}${linha.dataPosicao?` · posição ${linha.dataPosicao}`:""}${linha.atrasada?" · previsão vencida":""}`:"Sem atualização de prazo"}{linha.restricoesAbertas==null?" · restrições indisponíveis":linha.restricoesAbertas>0?` · ${linha.restricoesAbertas} restrição(ões) aberta(s)`:""}</span>
      </button>)}</div>
    {estado.modo==="fluxo"&&selecionada&&["escopo","a_definir"].includes(identificarLocalOperacional(selecionada).estado)&&<div className="cronograma-orientacao" role="status"><strong>Esta atividade ainda não pode entrar no fluxo por local.</strong><p>O escopo pode abranger diversos locais ou um serviço global. Confira o local descrito na EAP, distribua serviços repetitivos conforme evidência e justifique serviços sem repetição no inspetor. O cronograma por prazo continua disponível.</p><button type="button" onClick={()=>atualizar({modo:"cronograma"})}>Classificar no inspetor</button></div>}
    {estado.modo==="fluxo"&&selecionada&&identificarLocalOperacional(selecionada).estado==="revisar_global"&&<div className="cronograma-orientacao" role="status"><strong>Não aplicação da LOB sugerida.</strong><p>Confira a natureza e o escopo no inspetor e confirme a classificação. O prazo continua disponível.</p></div>}
    {estado.modo==="fluxo"&&selecionada&&!selecionada.pavimento&&selecionada.lobApplicability==="fora_lob"&&<div className="cronograma-orientacao" role="status"><strong>Atividade classificada fora da Linha de Balanço.</strong><p>{selecionada.lobApplicabilityReason??"Justificativa registrada no histórico da obra."} O planejamento e o acompanhamento por prazo continuam disponíveis.</p></div>}
    <div className="cronograma-visual">{estado.modo==="rede"?<AbaDependencias projetoId={projetoId}/>:temPlanoRelativo?<div className="cronograma-orientacao" role="status"><strong>{estado.modo==="fluxo"?"Linha de Balanço aguardando data civil":"Gantt civil aguardando data inicial"}</strong><p>As atividades e durações permanecem organizadas acima em dias relativos. Este gráfico não inventa datas.</p></div>:<VisualizacaoPlanejamento projetoId={projetoId} linhas={linhasVisiveis} inicioObra={inicioObra} hoje={hoje} view={estado.modo==="fluxo"?"lob":"gantt"} titulo={titulo} codigoObra={codigoObra} localObra={localObra} finsCalculados={finsCalculados} codigosExemplo={codigosExemplo} layoutProfissional={layoutProfissional} atividadeSelecionadaId={estado.atividadeSelecionadaId} situacoesTemporais={situacoesTemporais} onSelecionarAtividade={activityId=>atualizar({atividadeSelecionadaId:activityId})}/>}</div>
    {selecionada&&<InspetorAtividade
      projetoId={projetoId}
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
