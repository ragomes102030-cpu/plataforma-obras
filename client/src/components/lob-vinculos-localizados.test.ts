import { describe, expect, it } from "vitest";
import { terminoCorretoLob } from "./linha-balanco-modelo";
import {
  calcularFaixasCompactasLob, chavePontoLob, resolverVinculosLocalizadosLob,
} from "./lob-vinculos-localizados";

describe("LOB — datas da atividade e datas de cada parcela",()=>{
  const source={codigo:"1.4.1",atividade:"Pilares",activityId:10,
    frente:"Estrutura",pavimento:null,inicio:"2027-01-01",
    duracao:30,quantidade:200,unidade:"m³",executado:0,marco:false};
  it("prefere a data por ID na atividade normal, mesmo com código EAP duplicado",()=>{
    expect(terminoCorretoLob(source,{
      "1.4.1":"2027-02-15","10":"2027-01-30",
    })).toBe("2027-01-30");
  });
  it("usa a data específica do local para a parcela e ignora término global",()=>{
    const parcela={...source,codigo:"lob-segmento-10-1"};
    expect(terminoCorretoLob(parcela,{
      "10":"2027-01-30","lob-segmento-10-1":"2027-01-05",
    })).toBe("2027-01-05");
  });
});

describe("LOB — vínculos físicos por ID, sem criar precedências", () => {
  const points=[
    {activityId:10,codigo:"lob-segmento-10-1",local:"P01",inicio:"2027-01-01",fim:"2027-01-05"},
    {activityId:10,codigo:"lob-segmento-10-2",local:"P02",inicio:"2027-01-06",fim:"2027-01-10"},
    {activityId:11,codigo:"lob-segmento-11-1",local:"P01",inicio:"2027-01-06",fim:"2027-01-08"},
    {activityId:11,codigo:"lob-segmento-11-2",local:"P02",inicio:"2027-01-11",fim:"2027-01-13"},
  ];
  const links=[{de:10,para:11,tipo:"FS",lag:0}];

  it("replica o vínculo oficial por pavimento, sem confundir códigos sintetizados",()=>{
    const result=resolverVinculosLocalizadosLob(links,points);
    expect(result.dependenciasTotais).toBe(1);
    expect(result.dependenciasRepresentadas).toBe(1);
    expect(result.semRepresentacao).toBe(0);
    expect(result.vinculos).toHaveLength(2);
    expect(result.vinculos.map(x=>x.localOrigem+"→"+x.localDestino)).toEqual(["P01→P01","P02→P02"]);
    expect(result.vinculos[0]!.chaveOrigem).toBe(chavePontoLob(points[0]!));
    expect(result.vinculos[1]!.chaveDestino).toBe(chavePontoLob(points[3]!));
  });

  it("não inventa ponte entre pavimentos sem vínculo físico identificável",()=>{
    const result=resolverVinculosLocalizadosLob(links,[points[0]!,points[3]!]);
    expect(result.vinculos).toEqual([]);
    expect(result.semRepresentacao).toBe(1);
  });

  it("conecta atividade sem local a frentes localizadas quando a dependência é oficial",()=>{
    const unlocated={activityId:9,codigo:"1.9.1",local:"",inicio:"2026-12-01",fim:"2026-12-30"};
    const r=resolverVinculosLocalizadosLob([{de:9,para:10,tipo:"FS"}],[unlocated,...points]);
    expect(r.vinculos).toHaveLength(2);
    expect(r.vinculos.every(x=>x.de==="1.9.1")).toBe(true);
    expect(r.semRepresentacao).toBe(0);
  });

  it("suporta carga parecida com Aurora: 169 parcelas, 25 atividades, sete pavimentos",()=>{
    const sites=["Térreo","1º Pavimento","2º Pavimento","3º Pavimento","4º Pavimento","5º Pavimento","6º Pavimento"];
    const distributed=Array.from({length:24},(_,i)=>sites.map((local,j)=>({
      activityId:1000+i,codigo:`lob-segmento-${1000+i}-${j+1}`,
      local,inicio:"2027-11-01",fim:"2027-11-15",
    }))).flat();
    const facade={activityId:1030,codigo:"lob-segmento-1030-20",local:"Fachadas",
      inicio:"2028-01-01",fim:"2028-01-08"};
    expect(distributed.length+1).toBe(169);
    const links=Array.from({length:23},(_,i)=>({de:1000+i,para:1001+i,tipo:"FS",lag:0}));
    const r=resolverVinculosLocalizadosLob(links,[...distributed,facade]);
    expect(r.vinculos).toHaveLength(161);
    expect(r.dependenciasRepresentadas).toBe(23);
    expect(r.semRepresentacao).toBe(0);
    expect(new Set(r.vinculos.map(v=>v.chaveOrigem+"|"+v.chaveDestino)).size).toBe(161);
  });

  it("não sobrepõe barras no mesmo local e reutiliza faixas livres",()=>{
    const barras=[
      {inicio:"2027-01-01",fim:"2027-01-05"},
      {inicio:"2027-01-06",fim:"2027-01-10"},
      {inicio:"2027-01-03",fim:"2027-01-07"},
      {inicio:"2027-01-11",fim:"2027-01-15"},
    ];
    expect(calcularFaixasCompactasLob(barras)).toEqual({
      faixas:[0,0,1,0],totalFaixas:2,
    });
  });

  it("preserva faixas separadas se as 24 barras realmente se sobrepõem",()=>{
    const bars=Array.from({length:24},()=>({inicio:"2027-01-01",fim:"2027-01-30"}));
    const r=calcularFaixasCompactasLob(bars);
    expect(r.totalFaixas).toBe(24);
    expect(new Set(r.faixas).size).toBe(24);
  });
});
