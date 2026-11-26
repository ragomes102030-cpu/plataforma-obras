import {FormEvent,useEffect,useRef,useState} from "react";
import {ArrowUpRight,Clock3,History,Save,Undo2,X} from "lucide-react";
import type {LinhaCronogramaOperacional} from "@/lib/cronograma-operacional";
import {trpc} from "@/lib/trpc";
import {revalidarAtualizacaoPrazo} from "@/lib/revalidar-atualizacao-prazo";

type Baseline={estado:"carregando"|"erro"|"ausente"}|{estado:"pronto";inicio:number|null;fim:number|null;deltaFim:number|null};
type EstadoPrazo="nao_iniciada"|"em_andamento"|"concluida"|"bloqueada";
type ApplicabilidadeLob="pendente"|"aplicavel"|"fora_lob";
type Props={projetoId:number;linha:LinhaCronogramaOperacional;predecessoras:number;sucessoras:number;restricoesAbertas:number|null;baseline:Baseline;onFechar:()=>void;onAbrirAba:(aba:string)=>void};
const valor=(dado:unknown,sufixo="")=>dado===null||dado===undefined||dado===""?"Sem dado":`${dado}${sufixo}`;
const hojeLocal=()=>{const agora=new Date();return new Date(agora.getTime()-agora.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const estados:Record<EstadoPrazo,string>={nao_iniciada:"Não iniciada",em_andamento:"Em andamento",concluida:"Concluída",bloqueada:"Bloqueada"};
const dataBr=(data:string|null|undefined)=>data?new Date(`${data}T00:00:00Z`).toLocaleDateString("pt-BR",{timeZone:"UTC"}):"Sem dado";
export function InspetorAtividade({projetoId,linha,predecessoras,sucessoras,restricoesAbertas,baseline,onFechar,onAbrirAba}:Props){
  const fecharRef=useRef<HTMLButtonElement>(null);
  const focoAnterior=useRef<HTMLElement|null>(null);
  const onFecharRef=useRef(onFechar);
  onFecharRef.current=onFechar;
  const utils=trpc.useUtils();
  const historico=trpc.planning.activityScheduleUpdates.useQuery({projectId:projetoId,activityId:linha.activityId},{enabled:projetoId>0});
  const [positionDate,setPositionDate]=useState(hojeLocal);
  const [status,setStatus]=useState<EstadoPrazo>("nao_iniciada");
  const [actualStartDate,setActualStartDate]=useState("");
  const [actualFinishDate,setActualFinishDate]=useState("");
  const [remainingDurationDays,setRemainingDurationDays]=useState("");
  const [forecastFinishDate,setForecastFinishDate]=useState("");
  const [blockerReason,setBlockerReason]=useState("");
  const [note,setNote]=useState("");
  const [evidenceRef,setEvidenceRef]=useState("");
  const [correctsUpdateId,setCorrectsUpdateId]=useState<number|null>(null);
  const [feedback,setFeedback]=useState<string|null>(null);
  const [lobApplicability,setLobApplicability]=useState<ApplicabilidadeLob>(linha.lobApplicability??"pendente");
  const [lobReason,setLobReason]=useState(linha.lobApplicabilityReason??"");
  const [lobFeedback,setLobFeedback]=useState<string|null>(null);
  const gravar=trpc.planning.registerActivityScheduleUpdate.useMutation({
    onSuccess:async()=>{setFeedback("Atualização de prazo registrada no histórico.");setCorrectsUpdateId(null);setNote("");setEvidenceRef("");await revalidarAtualizacaoPrazo(utils,projetoId,linha.activityId,hojeLocal());},
    onError:error=>setFeedback(error.message),
  });
  const classificarLob=trpc.planning.setActivityLobApplicability.useMutation({
    onSuccess:async()=>{setLobFeedback("Aplicabilidade registrada no histórico da obra.");await Promise.all([utils.planning.list.invalidate({projectId:projetoId}),utils.planning.readiness.invalidate({projectId:projetoId})]);},
    onError:error=>setLobFeedback(error.message),
  });
  useEffect(()=>{
    focoAnterior.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    fecharRef.current?.focus();
    const aoTeclar=(evento:KeyboardEvent)=>{
      if(evento.key === "Escape"){evento.preventDefault();onFecharRef.current();focoAnterior.current?.focus();return;}
      if(evento.key !== "Tab")return;
      const controles=Array.from(document.querySelectorAll<HTMLElement>(".cronograma-inspetor button:not(:disabled),.cronograma-inspetor input:not(:disabled),.cronograma-inspetor select:not(:disabled),.cronograma-inspetor textarea:not(:disabled)"));
      if(!controles.length)return;
      const primeiro=controles[0]!,ultimo=controles[controles.length-1]!;
      if(evento.shiftKey&&document.activeElement===primeiro){evento.preventDefault();ultimo.focus();}
      else if(!evento.shiftKey&&document.activeElement===ultimo){evento.preventDefault();primeiro.focus();}
    };
    document.addEventListener("keydown",aoTeclar);
    return()=>document.removeEventListener("keydown",aoTeclar);
  },[]);
  useEffect(()=>{
    setLobApplicability(linha.lobApplicability??"pendente");
    setLobReason(linha.lobApplicabilityReason??"");
    setLobFeedback(null);
  },[linha.activityId,linha.lobApplicability,linha.lobApplicabilityReason]);
  const fechar=()=>{onFechar();focoAnterior.current?.focus();};
  const registrar=(evento:FormEvent<HTMLFormElement>)=>{
    evento.preventDefault();setFeedback(null);
    gravar.mutate({projectId:projetoId,activityId:linha.activityId,positionDate,status,
      actualStartDate:actualStartDate||null,actualFinishDate:actualFinishDate||null,
      remainingDurationDays:remainingDurationDays?Number(remainingDurationDays):null,
      forecastFinishDate:forecastFinishDate||null,blockerReason:blockerReason.trim()||null,
      note:note.trim()||null,evidenceRef:evidenceRef.trim()||null,correctsUpdateId});
  };
  const prepararCorrecao=(item:NonNullable<typeof historico.data>["history"][number])=>{
    setPositionDate(item.positionDate);setStatus(item.status as EstadoPrazo);
    setActualStartDate(item.actualStartDate??"");setActualFinishDate(item.actualFinishDate??"");
    setRemainingDurationDays(item.remainingDurationDays==null?"":String(item.remainingDurationDays));
    setForecastFinishDate(item.forecastFinishDate??"");setBlockerReason(item.blockerReason??"");
    setNote(item.note??"");setEvidenceRef(item.evidenceRef??"");setCorrectsUpdateId(item.id);
    setFeedback(`Corrigindo o registro de ${dataBr(item.positionDate)}. O original será preservado.`);
  };
  const limparCorrecao=()=>{setCorrectsUpdateId(null);setFeedback(null);};
  const salvarApplicabilidadeLob=(evento:FormEvent<HTMLFormElement>)=>{
    evento.preventDefault();setLobFeedback(null);
    if(lobApplicability==="pendente")return;
    classificarLob.mutate({projectId:projetoId,activityId:linha.activityId,applicability:lobApplicability,reason:lobApplicability==="fora_lob"?lobReason.trim():null});
  };
  const progresso=linha.quantidade!=null&&linha.quantidade>0&&linha.executado!=null?`${Math.min(100,Math.max(0,linha.executado/linha.quantidade*100)).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`:"Sem dado";
  const referenciaBaseline=baseline.estado==="pronto"&&baseline.inicio!=null&&baseline.fim!=null?`D+${baseline.inicio} a D+${baseline.fim}`:baseline.estado==="carregando"?"Carregando…":baseline.estado==="erro"?"Erro na consulta":baseline.estado==="ausente"?"Baseline não aprovada":"Sem correspondência";
  const variacaoBaseline=baseline.estado==="pronto"&&baseline.deltaFim!=null?`${baseline.deltaFim>0?"+":""}${baseline.deltaFim} dias`:"Sem dado";
  const secoes=[
    {titulo:linha.planejamentoRelativo?"Planejado (dias relativos)":"Planejado",linhas:[["Início",linha.inicio],["Término",linha.fim],["Duração",valor(linha.duracao," dias")]],aba:"atividades"},
    {titulo:"Baseline",linhas:[["Referência",referenciaBaseline],["Variação",variacaoBaseline]],aba:"baseline"},
    {titulo:"Realizado",linhas:[["Quantidade",valor(linha.executado,linha.unidade?` ${linha.unidade}`:"")],["Progresso",progresso]],aba:"producao"},
    {titulo:"Rede",linhas:[["Predecessoras",predecessoras],["Sucessoras",sucessoras],["Caminho crítico",linha.critica?"Sim":"Não"]],aba:"dependencias"},
    {titulo:"Local",linhas:[["Local de execução",valor(linha.pavimento)]],aba:"eap"},
    {titulo:"Restrições",linhas:[["Abertas",restricoesAbertas??"Consulta indisponível"],["Estado",restricoesAbertas==null?"Não confirmado":restricoesAbertas>0?"Requer atenção":"Sem restrições abertas"]],aba:"producao"},
  ] as const;
  return <div className="cronograma-inspetor-raiz">
    <button type="button" className="cronograma-inspetor-fundo" aria-label="Fechar detalhes da atividade" onClick={fechar}/>
    <aside className="cronograma-inspetor" role="dialog" aria-modal="true" aria-label={`Detalhes de ${linha.atividade}`}>
      <header><div><small>ATIVIDADE {linha.activityId}</small><h2>{linha.codigo} · {linha.atividade}</h2></div><button ref={fecharRef} type="button" onClick={fechar} aria-label="Fechar inspetor"><X size={18}/></button></header>
      <div className="cronograma-inspetor-conteudo">
        <section className="cronograma-atualizacao" aria-labelledby="inspetor-atualizar">
          <div><h3 id="inspetor-atualizar"><Clock3 size={14}/> Atualizar andamento</h3><small>Relato de prazo separado de quantidade medida.</small></div>
          {historico.data?.current&&<p className="cronograma-atualizacao-atual" role="status">Estado vigente: <strong>{estados[historico.data.current.status as EstadoPrazo]??historico.data.current.status}</strong> · posição {dataBr(historico.data.current.positionDate)}{historico.data.current.forecastFinishDate?` · previsão ${dataBr(historico.data.current.forecastFinishDate)}`:""}</p>}
          {historico.data&&!historico.data.canUpdate&&<p role="note">Esta atividade pertence a uma versão substituída. O histórico está disponível para consulta.</p>}
          {historico.isError&&<p role="alert">Não foi possível carregar o histórico. Tente novamente antes de registrar.</p>}
          <form onSubmit={registrar}>
            <label>Data de posição<input type="date" required value={positionDate} onChange={e=>setPositionDate(e.target.value)} /></label>
            <label>Estado<select value={status} onChange={e=>setStatus(e.target.value as EstadoPrazo)}>{Object.entries(estados).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            {(status==="em_andamento"||status==="concluida"||status==="bloqueada")&&<label>Início real<input type="date" value={actualStartDate} onChange={e=>setActualStartDate(e.target.value)} /></label>}
            {status==="em_andamento"&&<>
              <label>Duração restante (dias úteis)<input type="number" min="1" step="1" inputMode="numeric" value={remainingDurationDays} onChange={e=>setRemainingDurationDays(e.target.value)} /></label>
              <label>Ou previsão de término<input type="date" value={forecastFinishDate} onChange={e=>setForecastFinishDate(e.target.value)} /></label>
            </>}
            {status==="concluida"&&<label>Término real<input type="date" required value={actualFinishDate} onChange={e=>setActualFinishDate(e.target.value)} /></label>}
            {status==="bloqueada"&&<label>Motivo do bloqueio<textarea required maxLength={2000} value={blockerReason} onChange={e=>setBlockerReason(e.target.value)} /></label>}
            <label>Observação de campo<textarea maxLength={4000} value={note} onChange={e=>setNote(e.target.value)} /></label>
            <label>Referência opcional de evidência<input maxLength={500} value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)} placeholder="Nome do documento, URL ou protocolo" /></label>
            {feedback&&<p className="cronograma-atualizacao-feedback" role="status">{feedback}</p>}
            <div className="cronograma-atualizacao-acoes"><button type="submit" disabled={!historico.data?.canUpdate||historico.isError||gravar.isPending}><Save size={14}/>{gravar.isPending?"Registrando…":correctsUpdateId?"Salvar correção":"Registrar atualização"}</button>{correctsUpdateId!=null&&<button type="button" onClick={limparCorrecao}><Undo2 size={14}/>Cancelar correção</button>}</div>
          </form>
        </section>
        {!linha.pavimento&&<section className="cronograma-lob-classificacao" aria-labelledby="inspetor-lob">
          <div><h3 id="inspetor-lob">Linha de Balanço (opcional)</h3><small>Sem unidade afeta somente o fluxo por local; o planejamento por prazo continua liberado.</small></div>
          {linha.lobApplicability==="fora_lob"&&<p role="status">Fora da LOB: {linha.lobApplicabilityReason??"justificativa registrada"}</p>}
          <form onSubmit={salvarApplicabilidadeLob}>
            <label>Aplicabilidade<select value={lobApplicability} onChange={evento=>setLobApplicability(evento.target.value as ApplicabilidadeLob)}>
              <option value="pendente">Ainda não revisada</option>
              <option value="aplicavel">Repete-se por unidade; falta vincular o local</option>
              <option value="fora_lob">Não se aplica: serviço sem repetição por unidade</option>
            </select></label>
            {lobApplicability==="fora_lob"&&<label>Justificativa<textarea required minLength={12} maxLength={1500} value={lobReason} onChange={evento=>setLobReason(evento.target.value)} placeholder="Explique por que esta atividade não se repete por unidade física." /></label>}
            {lobFeedback&&<p className="cronograma-atualizacao-feedback" role="status">{lobFeedback}</p>}
            <button type="submit" disabled={classificarLob.isPending||lobApplicability==="pendente"||(lobApplicability==="fora_lob"&&lobReason.trim().length<12)}><Save size={14}/>{classificarLob.isPending?"Registrando…":"Salvar aplicabilidade"}</button>
          </form>
        </section>}
        <section className="cronograma-historico" aria-labelledby="inspetor-historico"><div><h3 id="inspetor-historico"><History size={14}/> Histórico de prazo</h3><span>{historico.data?.history.length??0} registro(s)</span></div>
          {historico.isPending?<p>Carregando histórico…</p>:historico.data?.history.length? <ol>{historico.data.history.map(item=><li key={item.id} className={item.vigente?"vigente":"corrigido"}>
            <div><strong>{estados[item.status as EstadoPrazo]??item.status}</strong><time dateTime={item.positionDate}>{dataBr(item.positionDate)}</time></div>
            <p>{item.actualStartDate?`Início real ${dataBr(item.actualStartDate)} · `:""}{item.actualFinishDate?`Término real ${dataBr(item.actualFinishDate)} · `:""}{item.forecastFinishDate?`Previsão ${dataBr(item.forecastFinishDate)} · `:""}{item.remainingDurationDays!=null?`${item.remainingDurationDays} dias restantes · `:""}{item.blockerReason?`Bloqueio: ${item.blockerReason} · `:""}{item.note||"Sem observação."}</p>
            <small>Registrado por {item.authorName??`usuário ${item.authorUserId}`} em {new Date(item.createdAt).toLocaleString("pt-BR")}</small>{item.evidenceRef&&<small>Evidência: {item.evidenceRef}</small>}{item.supersedesId!=null&&<small>Corrige o registro #{item.supersedesId}.</small>}{!item.vigente&&<small>Substituído; mantido para auditoria.</small>}
            {item.corrigivel&&<button type="button" onClick={()=>prepararCorrecao(item)}>Corrigir este registro</button>}
          </li>)}</ol>:<p>Nenhuma atualização registrada. O tempo decorrido não será interpretado como avanço físico.</p>}
        </section>
        {secoes.map(secao=><section key={secao.titulo} aria-labelledby={`inspetor-${secao.titulo}`}>
        <div><h3 id={`inspetor-${secao.titulo}`}>{secao.titulo}</h3><button type="button" onClick={()=>onAbrirAba(secao.aba)}>Resolver no módulo <ArrowUpRight size={13}/></button></div>
        <dl>{secao.linhas.map(([rotulo,dado])=><div key={rotulo}><dt>{rotulo}</dt><dd className={dado==="Sem dado"?"sem-dado":undefined}>{dado}</dd></div>)}</dl>
      </section>)}</div>
    </aside>
  </div>;
}
