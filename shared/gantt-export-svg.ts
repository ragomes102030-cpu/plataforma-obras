/**
 * Exportação SVG autossuficiente do Gantt clássico.
 * Inclui a grade de atividades, meses, barras, marcos, avanço e vínculos visíveis.
 * Não exporta somente as camadas auxiliares de setas.
 */
export type LinhaGanttExport = {
  codigo: string;
  nome: string;
  inicio: string;
  fim: string;
  duracao: number;
  progresso: number;
  critica: boolean;
  marco: boolean;
  resumo: boolean;
  profundidade: number;
};
export type VinculoGanttExport = { de: string; para: string; tipo: string };
export type GanttExportInput = {
  titulo: string;
  inicio: string;
  totalDias: number;
  pxDia: number;
  hoje: string;
  linhas: LinhaGanttExport[];
  vinculos: VinculoGanttExport[];
  /** Fotografias já convertidas a datas civis pelo calendário da obra. */
  baseline?: { codigo: string; inicio: string; fim: string }[];
};
const MS_DIA=86400000;
const dia=(iso:string)=>Date.parse(iso+"T12:00:00Z");
const diaDeslocamento=(a:string,b:string)=>Math.round((dia(b)-dia(a))/MS_DIA);
const xml=(valor:unknown):string=>String(valor??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const data=(iso:string):string=>iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4);
export function gerarSvgGantt(input:GanttExportInput):string {
  const esquerda=490,alturaLinha=30,cabecalho=87,rodape=35;
  const px=Math.max(.6,Math.min(48,input.pxDia));
  const larguraTempo=Math.max(100,Math.round(input.totalDias*px));
  const largura=esquerda+larguraTempo;
  const altura=cabecalho+input.linhas.length*alturaLinha+rodape;
  const posicao=(iso:string)=>diaDeslocamento(input.inicio,iso)*px;
  const partes:string[]=[
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+largura+'" height="'+altura+'" viewBox="0 0 '+largura+' '+altura+'">',
    '<rect width="100%" height="100%" fill="#fff"/>',
    '<text x="15" y="23" font-family="Arial,sans-serif" fill="#163850" font-size="16" font-weight="700">'+xml(input.titulo)+'</text>',
    '<text x="15" y="40" font-family="Arial,sans-serif" font-size="10" fill="#537085">Gantt · EAP, cronograma e dependências visíveis · exportado em '+xml(new Date().toISOString().slice(0,10))+'</text>',
    '<rect x="0" y="49" width="'+largura+'" height="38" fill="#edf3f8"/>',
    '<text x="13" y="72" font-family="Arial,sans-serif" font-weight="700" font-size="11" fill="#294c63">EAP / Atividade</text>',
    '<text x="310" y="72" font-family="Arial,sans-serif" font-size="10" fill="#294c63">Dur.</text>',
    '<text x="350" y="72" font-family="Arial,sans-serif" font-size="10" fill="#294c63">Início</text>',
    '<text x="405" y="72" font-family="Arial,sans-serif" font-size="10" fill="#294c63">Término</text>',
    '<text x="462" y="72" font-family="Arial,sans-serif" font-size="10" fill="#294c63">%</text>',
    '<path d="M '+esquerda+' 49 V '+(altura-rodape)+'" stroke="#b9cbd7" stroke-width="1"/>',
  ];
  // Faixas mensais com rótulos do ano; o eixo permanece válido por décadas.
  if(Number.isFinite(dia(input.inicio))&&input.totalDias>0){
    const primeiro=new Date(dia(input.inicio));primeiro.setUTCDate(1);
    for(let i=0;i<180&&posicao(primeiro.toISOString().slice(0,10))<=larguraTempo;i++){
      const inicioMes=primeiro.toISOString().slice(0,10);
      const proximo=new Date(primeiro);proximo.setUTCMonth(proximo.getUTCMonth()+1);
      const fimMes=proximo.toISOString().slice(0,10);
      const x1=Math.max(0,posicao(inicioMes)),x2=Math.min(larguraTempo,posicao(fimMes));
      if(x2>x1){
        const rotulo=new Intl.DateTimeFormat("pt-BR",{month:"short",year:"2-digit",timeZone:"UTC"}).format(primeiro);
        partes.push('<line x1="'+(esquerda+x1)+'" y1="49" x2="'+(esquerda+x1)+'" y2="'+(altura-rodape)+'" stroke="#d4e1e9"/>');
        partes.push('<text x="'+(esquerda+x1+5)+'" y="72" fill="#385c74" font-family="Arial,sans-serif" font-size="11">'+xml(rotulo)+'</text>');
      }
      primeiro.setTime(proximo.getTime());
    }
  }
  const baselinePorCodigo=new Map((input.baseline??[]).map(b=>[b.codigo,b]));
  const geometria=new Map<string,{x0:number;x1:number;y:number}>();
  input.linhas.forEach((r,i)=>{
    const y=cabecalho+i*alturaLinha;
    const x0=Math.max(0,posicao(r.inicio));
    const larguraBarra=Math.max(5,(diaDeslocamento(r.inicio,r.fim)+1)*px);
    const x1=x0+larguraBarra;
    geometria.set(r.codigo,{x0:esquerda+x0,x1:esquerda+x1,y:y+alturaLinha/2});
    partes.push('<rect x="0" y="'+y+'" width="'+largura+'" height="'+alturaLinha+'" fill="'+(i%2?"#f6f9fc":"#fff")+'"/>');
    partes.push('<path d="M 0 '+(y+alturaLinha)+' H '+largura+'" stroke="#e4ebf0"/>');
    const nome=r.codigo+"  "+r.nome;
    const cortar=nome.length>53?nome.slice(0,50)+"…":nome;
    partes.push('<text x="'+(12+Math.min(r.profundidade,7)*12)+'" y="'+(y+20)+'" font-family="Arial,sans-serif" font-weight="'+(r.resumo?"700":"400")+'" font-size="11" fill="#203e55">'+xml(cortar)+'</text>');
    partes.push('<text x="312" y="'+(y+20)+'" font-family="Arial,sans-serif" font-size="10" fill="#3e5d71">'+xml(r.marco?"marco":r.duracao+"d")+'</text>');
    partes.push('<text x="350" y="'+(y+20)+'" font-family="Arial,sans-serif" font-size="10" fill="#3e5d71">'+xml(data(r.inicio).slice(0,5))+'</text>');
    partes.push('<text x="405" y="'+(y+20)+'" font-family="Arial,sans-serif" font-size="10" fill="#3e5d71">'+xml(data(r.fim).slice(0,5))+'</text>');
    partes.push('<text x="461" y="'+(y+20)+'" font-family="Arial,sans-serif" font-size="10" fill="#3e5d71">'+Math.round(r.progresso)+'%</text>');
    const meio=y+alturaLinha/2;
    const baseline=baselinePorCodigo.get(r.codigo);
    if(baseline&&!r.resumo) {
      const xBase=esquerda+Math.max(0,posicao(baseline.inicio));
      const larguraBase=Math.max(3,(diaDeslocamento(baseline.inicio,baseline.fim)+1)*px);
      partes.push('<rect x="'+xBase+'" y="'+(meio-13)+'" width="'+larguraBase+'" height="5" rx="2" fill="#8798aa"/>');
    }
    if(r.marco){
      partes.push('<polygon points="'+(esquerda+x0)+','+(meio-6)+' '+(esquerda+x0+7)+','+meio+' '+(esquerda+x0)+','+(meio+6)+' '+(esquerda+x0-7)+','+meio+'" fill="'+(r.critica?"#d15b59":"#36799b")+'"/>');
    } else {
      const cor=r.critica?"#c65e58":r.resumo?"#4f6578":"#497eae";
      const h=r.resumo?7:14;
      const by=meio-h/2;
      partes.push('<rect x="'+(esquerda+x0)+'" y="'+by+'" width="'+larguraBarra+'" height="'+h+'" rx="2" fill="'+cor+'"/>');
      const progresso=Math.max(0,Math.min(100,r.progresso));
      if(progresso>0)partes.push('<rect x="'+(esquerda+x0)+'" y="'+by+'" width="'+(larguraBarra*progresso/100)+'" height="'+h+'" rx="1" fill="#245b50" opacity=".7"/>');
    }
  });
  for(const v of input.vinculos){
    const a=geometria.get(v.de),b=geometria.get(v.para);
    if(!a||!b)continue;
    const tipo=v.tipo.toUpperCase();
    const origem=(tipo==="SS"||tipo==="SF")?a.x0:a.x1;
    const destino=(tipo==="FF"||tipo==="SF")?b.x1:b.x0;
    const canal=Math.max(origem+7,destino+7);
    partes.push('<path d="M '+origem+' '+a.y+' H '+canal+' V '+b.y+' H '+destino+'" stroke="#748b9d" stroke-width="1" stroke-dasharray="3 2" fill="none"/>');
    partes.push('<circle cx="'+destino+'" cy="'+b.y+'" r="2" fill="#748b9d"/>');
  }
  const hojeX=esquerda+posicao(input.hoje);
  if(hojeX>=esquerda&&hojeX<=largura){
    partes.push('<path d="M '+hojeX+' 49 V '+(altura-rodape)+'" stroke="#da5447" stroke-width="1.5" stroke-dasharray="4 4"/>');
  }
  partes.push('<text x="12" y="'+(altura-12)+'" font-family="Arial,sans-serif" font-size="10" fill="#577082">Azul: atividade · vermelho: caminho crítico · cinza: etapa'+(input.baseline?.length?' e baseline aprovada':'')+' · losango: marco · tracejado: dependência</text>');
  partes.push('</svg>');
  return partes.join("\n");
}
