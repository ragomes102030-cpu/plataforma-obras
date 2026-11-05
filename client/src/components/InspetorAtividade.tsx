import {useEffect,useRef} from "react";
import {ArrowUpRight,X} from "lucide-react";
import type {LinhaCronogramaOperacional} from "@/lib/cronograma-operacional";

type Props={linha:LinhaCronogramaOperacional;predecessoras:number;sucessoras:number;onFechar:()=>void;onAbrirAba:(aba:string)=>void};
const valor=(dado:unknown,sufixo="")=>dado===null||dado===undefined||dado===""?"Sem dado":`${dado}${sufixo}`;
export function InspetorAtividade({linha,predecessoras,sucessoras,onFechar,onAbrirAba}:Props){
  const fecharRef=useRef<HTMLButtonElement>(null);
  const focoAnterior=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    focoAnterior.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    fecharRef.current?.focus();
    const aoTeclar=(evento:KeyboardEvent)=>{
      if(evento.key === "Escape"){evento.preventDefault();onFechar();focoAnterior.current?.focus();return;}
      if(evento.key !== "Tab")return;
      const controles=Array.from(document.querySelectorAll<HTMLElement>(".cronograma-inspetor button:not(:disabled)"));
      if(!controles.length)return;
      const primeiro=controles[0]!,ultimo=controles[controles.length-1]!;
      if(evento.shiftKey&&document.activeElement===primeiro){evento.preventDefault();ultimo.focus();}
      else if(!evento.shiftKey&&document.activeElement===ultimo){evento.preventDefault();primeiro.focus();}
    };
    document.addEventListener("keydown",aoTeclar);
    return()=>document.removeEventListener("keydown",aoTeclar);
  },[onFechar]);
  const fechar=()=>{onFechar();focoAnterior.current?.focus();};
  const secoes=[
    {titulo:"Planejado",linhas:[["Início",linha.inicio],["Término",linha.fim],["Duração",valor(linha.duracao," dias")]],aba:"atividades"},
    {titulo:"Baseline",linhas:[["Referência","Sem dado"],["Variação","Sem dado"]],aba:"baseline"},
    {titulo:"Realizado",linhas:[["Quantidade",valor(linha.executado,linha.unidade?` ${linha.unidade}`:"")],["Progresso",linha.executado==null?"Sem dado":valor(linha.executado)]],aba:"producao"},
    {titulo:"Rede",linhas:[["Predecessoras",predecessoras],["Sucessoras",sucessoras],["Caminho crítico",linha.critica?"Sim":"Não"]],aba:"dependencias"},
    {titulo:"Local",linhas:[["Local de execução",valor(linha.pavimento)]],aba:"eap"},
    {titulo:"Restrições",linhas:[["Abertas",linha.bloqueada?"Requer atenção":"Sem registro"]],aba:"producao"},
  ] as const;
  return <div className="cronograma-inspetor-raiz">
    <button type="button" className="cronograma-inspetor-fundo" aria-label="Fechar detalhes da atividade" onClick={fechar}/>
    <aside className="cronograma-inspetor" role="dialog" aria-modal="true" aria-label={`Detalhes de ${linha.atividade}`}>
      <header><div><small>ATIVIDADE {linha.activityId}</small><h2>{linha.codigo} · {linha.atividade}</h2></div><button ref={fecharRef} type="button" onClick={fechar} aria-label="Fechar inspetor"><X size={18}/></button></header>
      <div className="cronograma-inspetor-conteudo">{secoes.map(secao=><section key={secao.titulo} aria-labelledby={`inspetor-${secao.titulo}`}>
        <div><h3 id={`inspetor-${secao.titulo}`}>{secao.titulo}</h3><button type="button" onClick={()=>onAbrirAba(secao.aba)}>Resolver no módulo <ArrowUpRight size={13}/></button></div>
        <dl>{secao.linhas.map(([rotulo,dado])=><div key={rotulo}><dt>{rotulo}</dt><dd className={dado==="Sem dado"?"sem-dado":undefined}>{dado}</dd></div>)}</dl>
      </section>)}</div>
    </aside>
  </div>;
}
