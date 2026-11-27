import {describe,expect,it} from "vitest";
import {estadoCronogramaDaQuery,estadoCronogramaNaQuery,identificarLocalOperacional,sugerirNaturezaAtividade,selecionarLinhasOperacionais,type LinhaCronogramaOperacional} from "./cronograma-operacional";

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

describe("identificação transparente dos locais",()=>{
  it("distingue unidade física, escopo textual e ausência de informação",()=>{
    expect(identificarLocalOperacional(linha(1)).estado).toBe("vinculado");
    const amplo=linha(2,{localEap:"Torres A e B — pavimentos 2 a 14"});
    expect(identificarLocalOperacional(amplo)).toMatchObject({estado:"escopo",rotulo:"Escopo localizado"});
    expect(identificarLocalOperacional(amplo).detalhe).toContain("Torres A e B");
    expect(amplo.pavimento).toBeNull();
    expect(identificarLocalOperacional(linha(2)).rotulo).toBe("Local a definir");
    expect(identificarLocalOperacional(linha(2,{lobApplicability:"aplicavel"})).rotulo).toBe("Unidade a vincular");
  });
  it("não inventa classificação global e respeita a classificação registrada",()=>{
    const global=linha(2,{atividade:"Compatibilização de projetos",lobApplicability:"fora_lob",lobApplicabilityReason:"Serviço global sem repetição"});
    expect(identificarLocalOperacional(global)).toMatchObject({estado:"fora_lob",detalhe:"Serviço global sem repetição"});
    expect(selecionarLinhasOperacionais([global],{atividadeSelecionadaId:null,modo:"fluxo",busca:"",filtro:"todas"})[0]?.precisaVincularLocal).toBe(false);
    expect(identificarLocalOperacional(linha(2,{atividade:"Compatibilização de projetos"})).estado).toBe("a_definir");
  });
  it("não sinaliza pendência física antes de consultar os dados",()=>{
    for(const estadoConsultaLocal of ["carregando","erro"] as const){
      const item=linha(2,{estadoConsultaLocal});
      expect(identificarLocalOperacional(item).estado).toBe("consulta");
      expect(selecionarLinhasOperacionais([item],{atividadeSelecionadaId:null,modo:"fluxo",busca:"",filtro:"todas"})[0]?.precisaVincularLocal).toBe(false);
    }
  });
  it("permite buscar o escopo da EAP sem criar localização física",()=>{
    const item=linha(2,{localEap:"Eixos das torres"});
    expect(selecionarLinhasOperacionais([item],{atividadeSelecionadaId:null,modo:"cronograma",busca:"eixos",filtro:"todas"})).toEqual([item]);
    expect(item.pavimento).toBeNull();
  });
});

describe("natureza e aplicabilidade sugeridas",()=>{
  it("propõe serviço global sem gravar classificação nem exigir vínculo",()=>{
    const global=linha(2,{atividade:"Compatibilizar e liberar projetos"});
    expect(sugerirNaturezaAtividade(global).tipo).toBe("global");
    expect(identificarLocalOperacional(global).rotulo).toBe("Não se aplica (sug.)");
    expect(global.lobApplicability).toBeUndefined();
    expect(selecionarLinhasOperacionais([global],{atividadeSelecionadaId:null,modo:"fluxo",busca:"",filtro:"todas"})[0]?.precisaVincularLocal).toBe(false);
    expect(identificarLocalOperacional({...global,lobApplicability:"fora_lob"}).rotulo).toBe("Não se aplica");
    expect(identificarLocalOperacional({...global,lobApplicability:"aplicavel"}).rotulo).toBe("Unidade a vincular");
  });
  it("respeita o local físico mesmo quando a LOB não se aplica",()=>{
    expect(identificarLocalOperacional(linha(1,{lobApplicability:"fora_lob"})).rotulo).toBe("Térreo");
    expect(identificarLocalOperacional(linha(2,{localEap:"Torre A",lobApplicability:"fora_lob"})).rotulo).toBe("Fora da LOB");
  });
  it("não trata execução de segurança como atividade documental global",()=>{
    expect(sugerirNaturezaAtividade(linha(2,{atividade:"Proteção contra quedas — Torre A",localEap:"Pavimentos da torre"})).sugerirForaLob).toBe(false);
    expect(sugerirNaturezaAtividade(linha(2,{atividade:"PGR e projetos de proteção coletiva por etapa",localEap:"Pavimentos da torre"})).sugerirForaLob).toBe(false);
  });
  it("distingue serviço repetitivo de marco global ou localizado",()=>{
    const repetitiva=linha(2,{atividade:"Tubulação sanitária PVC-U",localEap:"Torres A e B — pavimentos 2 a 14"});
    expect(sugerirNaturezaAtividade(repetitiva).tipo).toBe("repetitiva");
    expect(identificarLocalOperacional(repetitiva).rotulo).toBe("Distribuição a detalhar");
    expect(identificarLocalOperacional(linha(2,{isMilestone:true})).estado).toBe("revisar_global");
    expect(identificarLocalOperacional(linha(1,{isMilestone:true})).estado).toBe("vinculado");
  });
});
