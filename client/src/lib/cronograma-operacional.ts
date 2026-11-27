export type ModoCronogramaOperacional="cronograma"|"fluxo"|"rede";
export type FiltroCronogramaOperacional="todas"|"criticas"|"atrasadas"|"bloqueadas"|"sem_medicao";
export type EstadoCronogramaOperacional={
  atividadeSelecionadaId:number|null;
  modo:ModoCronogramaOperacional;
  busca:string;
  filtro:FiltroCronogramaOperacional;
};
export type LinhaCronogramaOperacional={
  activityId:number;codigo:string;atividade:string;inicio:string;fim:string;duracao:number;
  executado:number|null;quantidade:number|null;unidade:string|null;pavimento:string|null;
  critica:boolean;atrasada:boolean;bloqueada:boolean|null;estadoRelatado?:string|null;dataPosicao?:string|null;previsaoRelatada?:string|null;precisaVincularLocal?:boolean;
  planejamentoRelativo?:boolean;restricoesAbertas?:number|null;
  isMilestone?:boolean;localEap?:string|null;localDeclarado?:string|null;estadoConsultaLocal?:"carregando"|"erro"|"pronto";
  lobApplicability?:"aplicavel"|"fora_lob"|null;lobApplicabilityReason?:string|null;
};
type ContextoLocal=Pick<LinhaCronogramaOperacional,"atividade"|"pavimento"|"localEap"|"localDeclarado"|"estadoConsultaLocal"|"lobApplicability"|"lobApplicabilityReason"|"isMilestone">;
const normalizar=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

/** Sugestão conservadora, não é classificação gravada nem cria unidade física. */
export function sugerirNaturezaAtividade(linha:ContextoLocal){
  const escopo=linha.localEap?.trim()||linha.localDeclarado?.trim()||"";
  const nome=normalizar(linha.atividade);
  const texto=normalizar(escopo);
  if(linha.isMilestone===true)return {tipo:"marco" as const,rotulo:"Marco",sugerirForaLob:!linha.pavimento&&!escopo,justificativa:"Marco sem local físico declarado; confirmar se representa evento global sem repetição."};
  if(linha.pavimento?.trim())return {tipo:"localizada" as const,rotulo:"Localizada",sugerirForaLob:false,justificativa:"Unidade física reconhecida no planejamento."};
  const documental=/^(compatibilizar e liberar projetos|as built, manuais e dossie de qualidade|pgr e projetos de protecao coletiva por etapa)$/.test(nome);
  const escopoDocumental=!escopo||/^(obra\s*[—–-]\s*documentacao de seguranca)(?:;.*)?$/.test(texto);
  if(documental&&escopoDocumental)return {tipo:"global" as const,rotulo:"Global (sugestão)",sugerirForaLob:true,justificativa:"Atividade de documentação ou liberação de projetos, possivelmente global; confirme se não envolve execução repetitiva por unidade."};
  if(/\b(pavimentos|torres|ambientes|unidades)\b/.test(texto)&&/\b(alvenaria|paredes|divisorias|tubulacao|revestimentos|forros|pintura|esquadrias|loucas|metais)\b/.test(nome))return {tipo:"repetitiva" as const,rotulo:"Repetitiva (sugestão)",sugerirForaLob:false,justificativa:"Serviço com escopo em várias unidades; confirmar quantitativos e distribuição por local."};
  return {tipo:"indefinida" as const,rotulo:"A classificar",sugerirForaLob:false,justificativa:"A natureza da atividade depende de revisão do escopo."};
}
export function identificarLocalOperacional(linha:ContextoLocal){
  const escopo=linha.localEap?.trim()||linha.localDeclarado?.trim()||null;
  if(linha.estadoConsultaLocal==="carregando")return {estado:"consulta" as const,rotulo:"Consultando local",detalhe:"Aguardando a leitura do planejamento."};
  if(linha.estadoConsultaLocal==="erro")return {estado:"consulta" as const,rotulo:"Local não consultado",detalhe:"Não foi possível confirmar os dados de localização. Tente novamente."};
  if(linha.pavimento?.trim())return {estado:"vinculado" as const,rotulo:linha.pavimento,detalhe:linha.lobApplicability==="fora_lob"?"Unidade física confirmada; serviço classificado fora da LOB.":"Unidade física cadastrada e reconhecida."};
  if(linha.lobApplicability==="fora_lob")return {estado:"fora_lob" as const,rotulo:escopo?"Fora da LOB":"Não se aplica",detalhe:(linha.lobApplicabilityReason||"Serviço classificado sem repetição por unidade física.")+(escopo?" Escopo: "+escopo:"")};
  const natureza=sugerirNaturezaAtividade(linha);
  if(!linha.lobApplicability&&natureza.sugerirForaLob)return {estado:"revisar_global" as const,rotulo:"Não se aplica (sug.)",detalhe:natureza.justificativa+" Sugestão pendente de confirmação, não altera o CPM ou Gantt."};
  if(escopo&&natureza.tipo==="repetitiva")return {estado:"escopo" as const,rotulo:"Distribuição a detalhar",detalhe:escopo+" — "+natureza.justificativa};
  if(escopo)return {estado:"escopo" as const,rotulo:"Escopo localizado",detalhe:escopo+" — localização descrita, sem unidade física confirmada."};
  return {estado:"a_definir" as const,rotulo:linha.lobApplicability==="aplicavel"?"Unidade a vincular":"Local a definir",detalhe:"Sem local declarado. Defina o escopo físico ou justifique a não aplicação da LOB; o planejamento por prazo não é bloqueado."};
}
const modos=new Set<ModoCronogramaOperacional>(["cronograma","fluxo","rede"]);
const filtros=new Set<FiltroCronogramaOperacional>(["todas","criticas","atrasadas","bloqueadas","sem_medicao"]);
export const ESTADO_CRONOGRAMA_INICIAL:EstadoCronogramaOperacional={atividadeSelecionadaId:null,modo:"cronograma",busca:"",filtro:"todas"};

export function selecionarLinhasOperacionais(linhas:readonly LinhaCronogramaOperacional[],estado:EstadoCronogramaOperacional):LinhaCronogramaOperacional[]{
  const termo=estado.busca.trim().toLocaleLowerCase("pt-BR");
  const vistos=new Set<number>();
  const resultado:LinhaCronogramaOperacional[]=[];
  for(const original of linhas){
    if(vistos.has(original.activityId))continue;
    vistos.add(original.activityId);
    const item=estado.modo==="fluxo"?{...original,precisaVincularLocal:["escopo","a_definir"].includes(identificarLocalOperacional(original).estado)}:original;
    if(termo&&!`${item.codigo} ${item.atividade} ${item.pavimento??""} ${item.localEap??""} ${item.localDeclarado??""} ${identificarLocalOperacional(item).rotulo}`.toLocaleLowerCase("pt-BR").includes(termo))continue;
    if(estado.filtro==="criticas"&&!item.critica)continue;
    if(estado.filtro==="atrasadas"&&!item.atrasada)continue;
    if(estado.filtro==="bloqueadas"&&!item.bloqueada)continue;
    if(estado.filtro==="sem_medicao"&&(item.executado??0)>0)continue;
    resultado.push(item);
  }
  return resultado;
}
export function estadoCronogramaNaQuery(estado:EstadoCronogramaOperacional):string{
  const query=new URLSearchParams();
  query.set("modo",estado.modo);query.set("filtro",estado.filtro);
  if(estado.busca)query.set("busca",estado.busca);
  if(estado.atividadeSelecionadaId!=null)query.set("atividade",String(estado.atividadeSelecionadaId));
  return query.toString();
}
export function estadoCronogramaDaQuery(valor:string):EstadoCronogramaOperacional{
  const query=new URLSearchParams(valor.startsWith("?")?valor.slice(1):valor);
  const modo=query.get("modo") as ModoCronogramaOperacional|null;
  const filtro=query.get("filtro") as FiltroCronogramaOperacional|null;
  const atividade=Number(query.get("atividade"));
  return {
    atividadeSelecionadaId:Number.isSafeInteger(atividade)&&atividade>0?atividade:null,
    modo:modo&&modos.has(modo)?modo:"cronograma",
    busca:query.get("busca")??"",
    filtro:filtro&&filtros.has(filtro)?filtro:"todas",
  };
}
