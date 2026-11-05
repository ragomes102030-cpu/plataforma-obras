import {describe,expect,it} from "vitest";
import {estadoCronogramaDaQuery,estadoCronogramaNaQuery,selecionarLinhasOperacionais,type LinhaCronogramaOperacional} from "./cronograma-operacional";

const linha=(id:number,extra:Partial<LinhaCronogramaOperacional>={}):LinhaCronogramaOperacional=>({
  activityId:id,codigo:`1.${id}`,atividade:`Atividade ${id}`,inicio:"2026-11-01",fim:"2026-11-10",
  duracao:8,executado:0,quantidade:10,unidade:"m2",pavimento:id%2?"Térreo":null,critica:false,
  atrasada:false,bloqueada:false,...extra,
});

describe("modelo do cronograma operacional",()=>{
  it("filtra 2.000 atividades sem duplicar identidade nem perder seleção",()=>{
    const linhas=Array.from({length:2000},(_,i)=>linha(i+1,{critica:i%10===0}));
    const estado={atividadeSelecionadaId:102,modo:"cronograma" as const,busca:"Atividade",filtro:"criticas" as const};
    const resultado=selecionarLinhasOperacionais(linhas,estado);
    expect(resultado).toHaveLength(200);
    expect(new Set(resultado.map(item=>item.activityId)).size).toBe(200);
    expect(estado.atividadeSelecionadaId).toBe(102);
  });
  it("preserva seleção e filtros entre cronograma, fluxo e rede",()=>{
    const estado={atividadeSelecionadaId:102,modo:"fluxo" as const,busca:"estrutura",filtro:"bloqueadas" as const};
    const serializado=estadoCronogramaNaQuery(estado);
    expect(estadoCronogramaDaQuery(serializado)).toEqual(estado);
  });
  it("distingue atividade sem local quando o modo é fluxo",()=>{
    const resultado=selecionarLinhasOperacionais([linha(102,{pavimento:null})],{
      atividadeSelecionadaId:102,modo:"fluxo",busca:"",filtro:"todas",
    });
    expect(resultado[0]?.precisaVincularLocal).toBe(true);
  });
});
