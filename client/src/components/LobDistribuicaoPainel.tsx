import {useMemo,useState} from "react";
import type {EntradaDaLinha} from "@shared/cronograma-colunas";
import type {AtividadeIdLob,DistribuicaoLob,UnidadeLob} from "./lob-distribuicao-modelo";
import "./lob-distribuicao-painel.css";

type Props={
  atividades:readonly AtividadeIdLob[];
  linhas:readonly EntradaDaLinha[];
  finsCalculados:Record<string,string>;
  unidades:readonly UnidadeLob[];
  distribuicoes:readonly DistribuicaoLob[];
  editavel:boolean;
  salvando:boolean;
  erro?:string|null;
  onSalvar:(input:{activityId:number;unitId:number;plannedQuantity:number;startDate:string;finishDate:string})=>void;
  onRemover:(id:number)=>void;
};

export function LobDistribuicaoPainel({
  atividades,linhas,finsCalculados,unidades,distribuicoes,editavel,salvando,erro,onSalvar,onRemover
}:Props){
  const [atividade,setAtividade]=useState("");
  const [unidade,setUnidade]=useState("");
  const [quantidade,setQuantidade]=useState("");
  const [inicio,setInicio]=useState("");
  const [fim,setFim]=useState("");
  const [aberto,setAberto]=useState(false);
  const linhasPorCodigo=useMemo(()=>new Map(linhas.map(l=>[l.codigo,l])),[linhas]);
  const codes=useMemo(()=>new Map(atividades.map(a=>[a.id,a.wbsCode])),[atividades]);
  const nomes=useMemo(()=>new Map(unidades.map(u=>[u.id,u.name])),[unidades]);
  const ativos=useMemo(()=>atividades.filter(a=>linhasPorCodigo.has(a.wbsCode)),[atividades,linhasPorCodigo]);
  const selecionada=ativos.find(a=>String(a.id)===atividade);
  const linha=selecionada?linhasPorCodigo.get(selecionada.wbsCode):undefined;
  const outras=distribuicoes.filter(d=>String(d.activityId)===atividade&&String(d.unitId)!==unidade);
  const alocado=outras.reduce((s,d)=>s+Number(d.plannedQuantity),0);
  const restante=(linha?.quantidade??0)-alocado;
  const quantidadeNum=Number(quantidade);
  const valido=!!selecionada&&!!unidade&&quantidade.trim()!==""&&
    Number.isFinite(quantidadeNum)&&quantidadeNum>0&&
    Math.abs(quantidadeNum*1000-Math.round(quantidadeNum*1000))<1e-6&&
    (linha?.quantidade??0)>0&&quantidadeNum<=restante+0.0001&&
    /^\d{4}-\d{2}-\d{2}$/.test(inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(fim)&&fim>=inicio;
  const comDistribuicao=new Set(distribuicoes.map(d=>d.activityId)).size;
  const totais=useMemo(()=>ativos.map(a=>{
    const l=linhasPorCodigo.get(a.wbsCode)!;
    const alocs=distribuicoes.filter(d=>d.activityId===a.id);
    const somado=alocs.reduce((s,d)=>s+Number(d.plannedQuantity),0);
    return {id:a.id,code:a.wbsCode,name:l.atividade,total:l.quantidade,
      unidade:l.unidade,allocated:somado,remaining:l.quantidade===null?null:Math.max(0,l.quantidade-somado),
      parts:alocs.length};
  }),[ativos,linhasPorCodigo,distribuicoes]);
  const fechadas=totais.filter(t=>t.total!==null&&t.total>0&&t.remaining!==null&&t.remaining<=0.001).length;
  return <details className="lob-distribuicao" open={aberto} onToggle={e=>setAberto(e.currentTarget.open)} data-testid="lob-multilocal-panel">
    <summary><strong>Distribuição por pavimento / setor</strong>
      <span>{comDistribuicao} serviços com parcelas · {fechadas} quantitativos integralmente distribuídos · {totais.length} serviços</span></summary>
    <div className="lob-distribuicao-body">
      <p><b>Um serviço pode ocupar várias localizações.</b> Cadastre uma parcela por local, informando quantidade real planejada e período de execução. O somatório não pode exceder o quantitativo total da EAP. Nenhum dado é estimado automaticamente; esta distribuição não altera CPM, datas oficiais ou baseline.</p>
      {!editavel&&<p role="status">Esta versão está congelada. Para editar as parcelas, abra uma versão de trabalho.</p>}
      {erro&&<p role="alert" className="lob-distribuicao-error">{erro}</p>}
      <div className="lob-distribuicao-form">
        <label>Atividade da EAP<select aria-label="Atividade para distribuir" value={atividade} onChange={e=>{
          setAtividade(e.target.value);setUnidade("");setQuantidade("");setInicio("");setFim("");
        }}><option value="">Selecionar atividade</option>{ativos.map(a=>{
          const l=linhasPorCodigo.get(a.wbsCode)!;
          return <option value={a.id} key={a.id}>{a.wbsCode} · {l.atividade}</option>;
        })}</select></label>
        <label>Local físico<select aria-label="Local de distribuição" value={unidade} onChange={e=>{
          const novo=e.target.value;setUnidade(novo);
          const d=distribuicoes.find(x=>String(x.activityId)===atividade&&String(x.unitId)===novo);
          setQuantidade(d?.plannedQuantity??"");setInicio(d?.startDate??"");setFim(d?.finishDate??"");
        }}><option value="">Selecionar local</option>{unidades.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
        <label>Quantidade por local <small>{linha?.unidade??""}</small>
          <input aria-label="Quantidade planejada no local" type="number" min="0.001" step="0.001" value={quantidade} onChange={e=>setQuantidade(e.target.value)} placeholder="Não estimar"/></label>
        <label>Início no local<input aria-label="Início do trecho" type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></label>
        <label>Término no local<input aria-label="Término do trecho" type="date" value={fim} onChange={e=>setFim(e.target.value)}/></label>
        <button type="button" disabled={!editavel||salvando||!valido} onClick={()=>{
          if(valido)onSalvar({activityId:Number(atividade),unitId:Number(unidade),
            plannedQuantity:quantidadeNum,startDate:inicio,finishDate:fim});
        }}>{salvando?"Salvando…":"Salvar parcela"}</button>
      </div>
      {linha&&<p className="lob-distribuicao-saldo" data-testid="lob-quantity-balance">
        Total da atividade: <b>{linha.quantidade===null?"Não informado":linha.quantidade.toLocaleString("pt-BR")+" "+(linha.unidade??"")}</b> ·
        Alocado nos outros locais: <b>{alocado.toLocaleString("pt-BR")}</b> ·
        Disponível para este local: <b>{restante.toLocaleString("pt-BR")}</b> ·
        Janela oficial de referência: <b>{linha.inicio} – {finsCalculados[linha.codigo]??"não calculado"}</b>.
      </p>}
      <div className="lob-distribuicao-table-wrap">
        <table><thead><tr><th>EAP / serviço</th><th>Locais</th><th>Alocado / total</th><th>Saldo</th></tr></thead><tbody>
        {totais.map(t=><tr key={t.id}><td><b>{t.code}</b> {t.name}</td><td>{t.parts}</td>
          <td>{t.allocated.toLocaleString("pt-BR")} / {t.total===null?"—":t.total.toLocaleString("pt-BR")} {t.unidade??""}</td>
          <td>{t.remaining===null?"Sem quantidade":t.remaining.toLocaleString("pt-BR")}</td></tr>)}
        </tbody></table>
      </div>
      <h4>Parcelas cadastradas nesta versão</h4>
      {distribuicoes.length===0?<p>Sem distribuição por vários locais. As atividades de um único local continuam no Dicionário da EAP.</p>:
      <div className="lob-distribuicao-table-wrap"><table><thead><tr><th>Atividade</th><th>Local</th><th>Quantidade</th><th>Período planejado</th><th>Ação</th></tr></thead><tbody>
        {distribuicoes.map(d=><tr key={d.id}>
          <td>{codes.get(d.activityId)??"Atividade não encontrada"}</td>
          <td>{nomes.get(d.unitId)??"Local não encontrado"}</td>
          <td>{Number(d.plannedQuantity).toLocaleString("pt-BR")}</td>
          <td>{d.startDate} a {d.finishDate}</td>
          <td><button type="button" disabled={!editavel||salvando} onClick={()=>onRemover(d.id)} aria-label={"Remover parcela "+d.id}>Remover</button></td>
        </tr>)}</tbody></table></div>}
      <small>Os serviços sem distribuição completa permanecem nas faixas de pendência. Atividades globais e administrativas não precisam criar degraus fictícios por pavimento.</small>
    </div>
  </details>;
}
