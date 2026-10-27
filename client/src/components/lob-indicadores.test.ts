import { describe, expect, it } from "vitest";
import { calcularVinculosExibidos, resumoLob, statusAtividadeLob, taxaPlanejadaLob } from "./lob-indicadores";
import type { PontoLob, SerieLob } from "./linha-balanco-modelo";

const p=(codigo:string,local:string,inicio:string,fim:string,executado=0,quantidade:number|null=120):PontoLob=>({
  codigo,nome:"Alvenaria",local,inicio,fim,executado,quantidade,unidade:"m²",
});
const serie=(pontos:PontoLob[]):SerieLob=>({chave:"alvenaria",nome:"Alvenaria",pontos,repetitiva:true});

describe("Indicadores reais da escadinha",()=>{
  it("sem medição positiva e com prazo futuro não equivale a concluído",()=>{
    const ponto=p("1","P01","2026-11-01","2026-11-04");
    expect(statusAtividadeLob(ponto,"2026-10-27")).toBe("planejado");
    expect(statusAtividadeLob(ponto,"2026-11-02")).toBe("sem-medicao");
    expect(statusAtividadeLob(ponto,"2026-11-08")).toBe("prazo");
    expect(statusAtividadeLob({...ponto,executado:25},"2026-11-08")).toBe("parcial");
    expect(statusAtividadeLob({...ponto,executado:120},"2026-11-08")).toBe("concluido");
  });
  it("respeita ausência de quantitativo e não inventa produtividade real",()=>{
    const ponto=p("2","P02","2026-11-05","2026-11-08",0,null);
    expect(statusAtividadeLob(ponto,"2026-11-02")).toBe("planejado");
    expect(taxaPlanejadaLob(ponto,4)).toBeNull();
    expect(taxaPlanejadaLob({...ponto,quantidade:100},4)).toBe(25);
    expect(taxaPlanejadaLob({...ponto,quantidade:100},0)).toBeNull();
  });
  it("resume somente locais selecionados sem misturar unidades ou serviços ocultos",()=>{
    const result=resumoLob([
      serie([p("A","P01","2026-11-01","2026-11-04",120),p("B","P02","2026-11-05","2026-11-08",0)])
    ],["P02"],"2026-10-27");
    expect(result.inicio).toBe("2026-11-05");
    expect(result.fim).toBe("2026-11-08");
    expect(result.pontos.map(x=>x.codigo)).toEqual(["B"]);
    expect(result.diasCalendario).toBe(4);
    expect(result.estados).toEqual([{local:"P02",status:"planejado",atividades:1}]);
  });
  it("mostra apenas vínculos cuja origem e destino estão na escadinha visível",()=>{
    const pontos=[p("A","P01","2026-11-01","2026-11-04"),p("B","P01","2026-11-05","2026-11-08")];
    const filtradas=calcularVinculosExibidos([
      {de:"A",para:"B",tipo:"FS",lag:0},
      {de:"B",para:"X",tipo:"FS",lag:0},
      {de:"Z",para:"A",tipo:"SS",lag:2},
    ],pontos);
    expect(filtradas).toEqual([{de:"A",para:"B",tipo:"FS",lag:0}]);
  });
});
