/**
 * Somente Vite preview.dashboard-pr223.config.ts: estado de demonstração.
 * Não é importado pela aplicação principal e não acessa o Supabase.
 */
const activities = [{ id: 101, wbsNodeId: 101, wbsCode:"1.1.3.3", cpmCalculatedAt:null, updatedAt:null }];
const todayWeek = {
  numero:1, inicio:"2026-10-26", fim:"2026-10-30", situacao:"corrente",
  atividades:[
    {id:111, wbsCode:"1.1.3.3",name:"Muros, gradis e fechamentos",startIso:"2026-10-01",finishIso:"2026-10-26",openConstraints:0,percentualExecutado:0.14},
    {id:112, wbsCode:"1.1.2",name:"Administração e controle da obra",startIso:"2026-10-08",finishIso:"2027-04-04",openConstraints:0,percentualExecutado:0.02},
  ]
};
const entries = [
  {id:101,productionDate:"2026-10-21",codigoEap:"1.6.1",atividadeNome:"Estrutura da cobertura",quantity:18,unidade:"m²",status:"confirmada",vinculo:"antigo"},
  {id:102,productionDate:"2026-10-21",codigoEap:"1.4.2",atividadeNome:"Alvenaria e fechamentos",quantity:21,unidade:"m²",status:"confirmada",vinculo:"antigo"},
  ...Array.from({length:8},(_,i)=>({id:103+i,productionDate:"2026-10-18",codigoEap:"1.2."+i,atividadeNome:"Serviço demonstrativo "+(i+1),quantity:5,unidade:"m²",status:"confirmada",vinculo:"antigo"}))
];
const ready = <T>(data:T) => ({data,isPending:false,isLoading:false,isError:false});
const planning = {
  list:{useQuery:()=>ready({activities})},
  lookahead:{useQuery:()=>ready({semanas:[todayWeek],totalBloqueadas:0,compromissosPendentes:0,ppcCorrente:null})},
  compararComBaseline:{useQuery:()=>ready({resumo:{atrasoNoFim:null}})},
  validateEngineeringCoherence:{useQuery:()=>ready({issues:Array.from({length:5},(_,i)=>({id:i,severity:"error"})),resumo:{valorEmRisco:2340000}})},
};
export const trpc = {
  planning,
  budgets:{list:{useQuery:()=>ready({total:5200000,items:[]})}},
  production:{entries:{useQuery:()=>ready(entries)}}
};
