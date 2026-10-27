/** Ferramenta de QA visual isolada. NENHUMA consulta, escrita ou acesso ao Supabase. */
const names=[
["1","AURORA TESTE"],["1.1","Implantação e administração"],["1.1.1","Mobilização e canteiro"],["1.1.2","Administração e controle da obra"],
["1.2","Serviços preliminares"],["1.2.1","Locação e preparação do terreno"],["1.2.2","Demolições e remanejamentos"],
["1.3","Infraestrutura"],["1.3.1","Terraplenagem"],["1.3.2","Fundações"],
["1.4","Superestrutura"],["1.4.1","Pilares"],["1.4.2","Vigas"],["1.4.3","Lajes"],
["1.5","Vedações"],["1.5.1","Alvenarias"],["1.5.2","Divisórias e sistemas leves"]
];
const byCode=new Map(names.map(([code],i)=>[code,i+1]));
const wbs=names.map(([code,name],i)=>({
  id:i+1,code,name,level:code.split(".").length,parentId:byCode.get(code.split(".").slice(0,-1).join("."))??null,
  externalId:null,unit:code.split(".").length===3?"m²":null,plannedQuantity:null,
  nodeType:code.split(".").length===3?"pacote":"grupo",
  description:"Descrição técnica do escopo de "+name+".",inclusions:"Serviços previstos no escopo aprovado.",exclusions:"Serviços fora do escopo contratado.",
  location:"AURORA TESTE",responsible:"Equipe de planejamento",acceptanceCriteria:"Conferência técnica pelo engenheiro responsável.",
  decompositionBasis:"deliverable",scopeStatus:"aprovado",sortOrder:i,
}));
const data={
  projects:{wbs},
  planning:{grade:{linhas:wbs.filter(n=>n.nodeType==="pacote").map(n=>({codigo:n.code,atividade:n.name,quantidade:100,unidade:"m²"}))}},
  agent:{snapshot:{stage:"EAP_REVISAO",blockerCount:0,canAdvance:true},
    agentPlanVersions:[{id:31,versionNumber:6,status:"draft",approvedAt:null},{id:30,versionNumber:5,status:"approved",approvedAt:"2026-10-25T00:00:00.000Z"}]},
  eap:{eapDictionaryStandard:{status:"approved",requiredFields:["description","inclusions","exclusions","acceptanceCriteria","responsible"]},
    eapArquimedesReview:null,
    validateWbsStructure:{valid:true,issues:[],summary:{nodes:17,leaves:10,errors:0,warnings:0}}},
};
const ready=(datum:any)=>({data:datum,isPending:false,isError:false,isLoading:false,error:null,refetch:async()=>datum});
const mutation=()=>({mutate:()=>{throw new Error("QA somente leitura: mutação bloqueada");},isPending:false,isError:false,error:null,reset:()=>{}});
const useUtils=()=>{
  const invalid={invalidate:async()=>{},refetch:async()=>{}};
  return {projects:{wbs:invalid,list:invalid},eap:{validateWbsStructure:invalid},planning:{grade:invalid}};
};
const query=(datum:any)=>({useQuery:()=>ready(datum),useMutation:mutation});
export const trpc:any={
  useUtils,
  projects:{wbs:query(data.projects.wbs),createWbsNode:query(null),updateWbsNode:query(null)},
  planning:{grade:query(data.planning.grade),criarAtividadeDaFolha:query(null)},
  agent:{snapshot:query(data.agent.snapshot),agentPlanVersions:query(data.agent.agentPlanVersions),recordDecision:query(null)},
  eap:{eapDictionaryStandard:query(data.eap.eapDictionaryStandard),decideEapDictionaryStandard:query(null),
    eapArquimedesReview:query(data.eap.eapArquimedesReview),validateWbsStructure:query(data.eap.validateWbsStructure),
    enviarEapParaRevisao:query(null),generateEapFromCatalog:query(null),aplicarPropostaEap:query(null),
    analisarEapComArquimedes:query(null)},
};