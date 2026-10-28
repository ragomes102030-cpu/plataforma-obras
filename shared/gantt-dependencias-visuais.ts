/**
 * Ligações FS/SS/FF/SF entre BARRAS VISÍVEIS do Gantt.
 * SVG e barras usam o mesmo mapa de linhas, índice vertical e escala civil.
 * Sem geometria para ambas as extremidades, não se desenha ligação fantasma.
 */
export type PosicaoAtividadeGantt = { x0:number; x1:number; y:number };
export type DependenciaVisualGantt = { de:string; para:string; tipo:string };
export type SetaVisualGantt = { chave:string; d:string; critica:boolean; tipo:string };

const valido=(p:PosicaoAtividadeGantt|undefined):p is PosicaoAtividadeGantt=>
  Boolean(p) && Number.isFinite(p!.x0) && Number.isFinite(p!.x1) &&
  Number.isFinite(p!.y) && p!.x1>=p!.x0 && p!.x0>=0;

export function gerarSetasVisiveisGantt(
  dependencias:readonly DependenciaVisualGantt[],
  posicoes:ReadonlyMap<string,PosicaoAtividadeGantt>,
  criticas:ReadonlySet<string>,
):SetaVisualGantt[] {
  const setas:SetaVisualGantt[]=[];
  const jaVistas=new Set<string>();
  for(const dep of dependencias) {
    const tipo=String(dep.tipo??"FS").toUpperCase();
    if(!["FS","SS","FF","SF"].includes(tipo) || dep.de===dep.para)continue;
    const a=posicoes.get(dep.de),b=posicoes.get(dep.para);
    if(!valido(a)||!valido(b))continue;
    const chave=`${dep.de}>${dep.para}:${tipo}`;
    if(jaVistas.has(chave))continue;
    jaVistas.add(chave);
    const saiInicio=tipo==="SS"||tipo==="SF";
    const entraInicio=tipo==="FS"||tipo==="SS";
    const origem=saiInicio?Math.max(2,a.x0-3):a.x1+3;
    const destino=entraInicio?Math.max(2,b.x0-3):b.x1+3;
    const afastamento=12;
    // A ponta da flecha sempre se aproxima do lado físico correto:
    // inícios recebem seta da esquerda (→); términos, da direita (←).
    let d:string;
    if(entraInicio && !saiInicio && origem+afastamento<destino) {
      // FS sem recuo: caminho ortogonal curto.
      const x=origem+afastamento;
      d=`M ${origem} ${a.y} H ${x} V ${b.y} H ${destino}`;
    }else {
      const xCanal=entraInicio
        ? Math.max(2,Math.min(origem,destino)-afastamento)
        : Math.max(origem,destino)+afastamento;
      // Se o caminho termina do lado errado (FS com sobreposição temporal),
      // usa um corredor entre as linhas antes da aproximação final.
      if(entraInicio && origem>=destino-afastamento) {
        const retorno=Math.max(2,destino-afastamento);
        const meio=a.y===b.y?a.y-10:(a.y+b.y)/2;
        d=`M ${origem} ${a.y} H ${origem+afastamento} V ${meio} H ${retorno} V ${b.y} H ${destino}`;
      }else {
        d=`M ${origem} ${a.y} H ${xCanal} V ${b.y} H ${destino}`;
      }
    }
    setas.push({chave,d,tipo,critica:criticas.has(dep.de)&&criticas.has(dep.para)});
  }
  return setas;
}
