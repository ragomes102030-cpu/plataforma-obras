import { diaUtc, type PontoLob, type SerieLob } from "./linha-balanco-modelo";

const DIA=86400000;
const dias=(inicio:string,fim:string)=>Math.round((diaUtc(fim)-diaUtc(inicio))/DIA)+1;
export type StatusLob="concluido"|"parcial"|"prazo"|"planejado"|"sem-medicao";
export type VínculoLob={de:string;para:string;tipo:string;lag:number};
export function statusAtividadeLob(p:PontoLob,hoje:string):StatusLob {
  // Progresso só pode ser afirmado se há quantidade e medição positiva.
  if(p.quantidade!==null && p.quantidade>0 && p.executado>=p.quantidade) return "concluido";
  if(p.executado>0) return "parcial";
  if(hoje>p.fim) return "prazo";
  if(hoje<p.inicio) return "planejado";
  return "sem-medicao";
}
export function resumoLob(series:SerieLob[],locais:string[],hoje:string) {
  const set=new Set(locais);
  const pontos=series.flatMap(s=>s.pontos.filter(p=>set.has(p.local)));
  const inicio=pontos.reduce<string|null>((min,p)=>min===null||p.inicio<min?p.inicio:min,null);
  const fim=pontos.reduce<string|null>((max,p)=>max===null||p.fim>max?p.fim:max,null);
  const diasCalendario=inicio&&fim?dias(inicio,fim):null;
  const estados=locais.map(local=>{
    const doLocal=pontos.filter(p=>p.local===local);
    const status:StatusLob=doLocal.length===0?"sem-medicao":
      doLocal.every(p=>statusAtividadeLob(p,hoje)==="concluido")?"concluido":
      doLocal.some(p=>statusAtividadeLob(p,hoje)==="parcial")?"parcial":
      doLocal.some(p=>statusAtividadeLob(p,hoje)==="prazo")?"prazo":
      doLocal.every(p=>statusAtividadeLob(p,hoje)==="planejado")?"planejado":"sem-medicao";
    return {local,status,atividades:doLocal.length};
  });
  return {pontos,inicio,fim,diasCalendario,estados};
}
export function taxaPlanejadaLob(p:PontoLob,duracao:number|null):number|null {
  if(p.quantidade===null||p.quantidade<=0||duracao===null||!Number.isFinite(duracao)||duracao<=0)return null;
  return Math.round((p.quantidade/duracao)*100)/100;
}
export function calcularVinculosExibidos(vinculos:VínculoLob[],pontos:PontoLob[]){
  const codigos=new Set(pontos.map(p=>p.codigo));
  return vinculos.filter(v=>codigos.has(v.de)&&codigos.has(v.para)&&v.de!==v.para);
}
