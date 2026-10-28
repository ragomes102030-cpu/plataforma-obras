import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import {dataValida,diaUtc} from "./linha-balanco-modelo";

/** Parcela persistida na versão corrente; nunca substitui a atividade do CPM. */
export type DistribuicaoLob={
  id:number; activityId:number;unitId:number;plannedQuantity:string;
  startDate:string;finishDate:string;
};
export type AtividadeIdLob={id:number;wbsCode:string};
export type UnidadeLob={id:number;code:string;name:string;unitType:string};
const MIL=1000;
export function integrarDistribuicoesLob(
  linhas:readonly EntradaDaLinha[],
  ids:readonly AtividadeIdLob[],
  unidades:readonly UnidadeLob[],
  distribuicoes:readonly DistribuicaoLob[]
){
  const codPorId=new Map(ids.map(a=>[a.id,a.wbsCode]));
  const porCodigo=new Map(linhas.map(l=>[l.codigo,l]));
  const nomePorUnidade=new Map(unidades.map(u=>[u.id,u.name]));
  const somaPorCodigo=new Map<string,number>();
  const entradas:EntradaDaLinha[]=[];
  const fins:Record<string,string>={};
  const codigosConfirmados=new Set<string>();
  const codigosDistribuidos=new Set<string>();
  for(const d of distribuicoes) {
    const codigo=codPorId.get(d.activityId);
    const fonte=codigo?porCodigo.get(codigo):undefined;
    const nomeLocal=nomePorUnidade.get(d.unitId);
    const quantidade=Number(d.plannedQuantity);
    if(!fonte||!nomeLocal||fonte.marco||!dataValida(d.startDate)||!dataValida(d.finishDate)||
      d.finishDate<d.startDate||!Number.isFinite(quantidade)||quantidade<=0)continue;
    const chave="lob-segmento-"+d.activityId+"-"+d.unitId;
    entradas.push({
      ...fonte,codigo:chave,pavimento:nomeLocal,inicio:d.startDate,
      duracao:Math.floor((diaUtc(d.finishDate)-diaUtc(d.startDate))/86400000)+1,
      quantidade,executado:0,
    });
    fins[chave]=d.finishDate;
    codigosConfirmados.add(chave);
    codigosDistribuidos.add(fonte.codigo);
    somaPorCodigo.set(fonte.codigo,(somaPorCodigo.get(fonte.codigo)??0)+Math.round(quantidade*MIL));
  }
  const pendentes=linhas.flatMap(l=>{
    const distribuiddo=somaPorCodigo.get(l.codigo)??0;
    if(distribuiddo===0)return [l];
    const total=l.quantidade===null?null:Math.round(l.quantidade*MIL);
    const restante=total===null?null:Math.max(0,total-distribuiddo);
    if(restante!==null&&restante<=0)return [];
    return [{
      ...l,
      atividade:l.atividade+" (saldo sem local)",
      quantidade:restante===null?null:restante/MIL,
      executado:0,
    }];
  });
  return {entradas,fins,codigosConfirmados,codigosDistribuidos,pendentes,somaPorCodigo};
}
