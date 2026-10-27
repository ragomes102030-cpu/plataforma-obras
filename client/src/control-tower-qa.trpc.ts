/**
 * QA VISUAL ISOLADA da PR #224: substitui APENAS as queries, nunca chama API.
 * Todos os dados deste arquivo são ilustrativos e nenhum dado será persistido.
 */
const data = {
  planning: {
    list: {
      activities: [
        {id:1,wbsNodeId:1,wbsCode:"1.1.1",durationDays:90,cpmCalculatedAt:"2026-10-20T00:00:00.000Z",earlyStart:0,progress:20,plannedQuantity:100},
        {id:2,wbsNodeId:2,wbsCode:"1.1.2",durationDays:220,cpmCalculatedAt:"2026-10-20T00:00:00.000Z",earlyStart:18,progress:10,plannedQuantity:200},
        {id:3,wbsNodeId:3,wbsCode:"1.1.3",durationDays:260,cpmCalculatedAt:"2026-10-20T00:00:00.000Z",earlyStart:80,progress:0,plannedQuantity:350}
      ],
      baselines: [],
    },
    grade: {inicioObra:"2026-10-01"},
    getCalendarForCurve: {weekPattern:{workingWeekdays:[1,2,3,4,5]},exceptions:[]},
    compararComBaseline: undefined,
  },
  budgets: {
    approvedForCurve:{items:[
      {wbsNodeId:1,code:"1.1.1",quantity:100,unitPrice:15000},
      {wbsNodeId:2,code:"1.1.2",quantity:200,unitPrice:8500},
      {wbsNodeId:3,code:"1.1.3",quantity:350,unitPrice:5714.285714},
    ]},
  },
  production:{entries:[
    {status:"confirmada",codigoEap:"1.1.1",quantity:10,productionDate:"2026-10-09"},
    {status:"confirmada",codigoEap:"1.1.1",quantity:12,productionDate:"2026-10-16"},
    {status:"confirmada",codigoEap:"1.1.2",quantity:17,productionDate:"2026-10-22"},
    {status:"confirmada",codigoEap:"1.1.2",quantity:13,productionDate:"2026-10-27"},
  ]},
};
const ready=(value:unknown)=>({data:value,isPending:false,isError:false,isLoading:false});
export const trpc={
  planning:{
    list:{useQuery:()=>ready(data.planning.list)},
    grade:{useQuery:()=>ready(data.planning.grade)},
    getCalendarForCurve:{useQuery:()=>ready(data.planning.getCalendarForCurve)},
    compararComBaseline:{useQuery:()=>ready(data.planning.compararComBaseline)},
  },
  budgets:{approvedForCurve:{useQuery:()=>ready(data.budgets.approvedForCurve)}},
  production:{entries:{useQuery:()=>ready(data.production.entries)}},
};
