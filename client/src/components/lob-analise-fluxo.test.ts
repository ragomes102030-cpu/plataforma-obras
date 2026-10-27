import { describe, expect, it } from "vitest";
import { analisarFluxoLob } from "./lob-analise-fluxo";
import type { PontoLob, SerieLob } from "./linha-balanco-modelo";

const p=(codigo:string,local:string,inicio:string,fim:string):PontoLob => ({
  codigo,nome:codigo,local,inicio,fim,quantidade:120,unidade:"m²",executado:0,
});
const s=(chave:string,nome:string,pontos:PontoLob[]):SerieLob => ({
  chave,nome,pontos,repetitiva:true,
});

describe("Análise descritiva da LOB — não inventar conflitos",()=>{
  it("dados contínuos de duas frentes em dois pavimentos não produzem avisos falsos",()=>{
    const a=s("alv","Alvenaria",[
      p("A1","P01","2026-11-01","2026-11-04"),
      p("A2","P02","2026-11-05","2026-11-08"),
    ]);
    const b=s("rev","Revestimento",[
      p("B1","P01","2026-11-05","2026-11-08"),
      p("B2","P02","2026-11-09","2026-11-12"),
    ]);
    const r=analisarFluxoLob([a,b],["P01","P02"]);
    expect(r.alertas).toEqual([]);
    expect(r.ritmos.map(x=>x.diasPorTransferencia)).toEqual([4,4]);
    expect(r.ritmos.every(x=>!x.variavel && !x.invertido)).toBe(true);
  });

  it("detecta intervalos e coincidência de datas por pavimento sem afirmar choque de equipes",()=>{
    const r=analisarFluxoLob([
      s("a","Alvenaria",[
        p("A1","P01","2026-11-01","2026-11-05"),
        p("A2","P02","2026-11-10","2026-11-13"),
      ]),
      s("b","Revestimento",[
        p("B1","P01","2026-11-04","2026-11-07"),
        p("B2","P02","2026-11-19","2026-11-20"),
      ]),
    ],["P01","P02"]);
    expect(r.sobreposicoes).toBe(1);
    expect(r.intervalos).toBe(1);
    expect(r.transferencias).toBe(2);
    expect(r.alertas.find(x=>x.tipo==="sobreposicao")).toMatchObject({
      local:"P01",dias:2,codigos:["A1","B1"],
    });
    expect(r.alertas.find(x=>x.tipo==="intervalo")).toMatchObject({
      local:"P02",dias:5,codigos:["A2","B2"],
    });
    expect(r.alertas.find(x=>x.tipo==="transferencia" && x.servicos==="Alvenaria")).toMatchObject({
      local:"P01 → P02",dias:4,
    });
    expect(r.alertas.every(x=>!x.descricao.includes("confirmado"))).toBe(true);
  });

  it("captura irregularidade de inícios sem transformá-la em produtividade",()=>{
    const r=analisarFluxoLob([s("a","Alvenaria",[
      p("A1","P01","2026-11-01","2026-11-03"),
      p("A2","P02","2026-11-05","2026-11-07"),
      p("A3","P03","2026-11-11","2026-11-13"),
    ])],["P01","P02","P03"]);
    expect(r.ritmos[0]).toMatchObject({
      diasPorTransferencia:5,menorIntervalo:4,maiorIntervalo:6,variavel:true,invertido:false,
    });
  });

  it("respeita filtro de pavimentos, inclusive apenas uma unidade, e datas de calendário",()=>{
    const pontos=[
      p("A1","P01","2028-02-28","2028-02-29"),
      p("A2","P02","2028-03-01","2028-03-02"),
    ];
    const r=analisarFluxoLob([s("a","Alvenaria",pontos)],["P01"]);
    expect(r.alertas).toHaveLength(0);
    expect(r.ritmos[0]?.diasPorTransferencia).toBeNull();
    const completo=analisarFluxoLob([s("a","Alvenaria",pontos)],["P01","P02"]);
    expect(completo.transferencias).toBe(0);
    expect(completo.ritmos[0]?.diasPorTransferencia).toBe(2);
  });

  it("considera janelas encaixadas e não soma espera quando alguma atividade permanece ativa",()=>{
    const r=analisarFluxoLob([
      s("a","Alvenaria",[p("A1","P01","2026-11-01","2026-11-10")]),
      s("b","Chapisco",[p("B1","P01","2026-11-02","2026-11-03")]),
      s("c","Pintura",[p("C1","P01","2026-11-04","2026-11-05")]),
    ],["P01"]);
    expect(r.sobreposicoes).toBe(2);
    expect(r.intervalos).toBe(0);
  });
});
