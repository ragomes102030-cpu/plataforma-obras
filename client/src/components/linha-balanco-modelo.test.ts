import { describe, expect, it } from "vitest";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { dataValida, faixasDeTempo, ocupacaoNaFaixa, prepararLinhaBalancoVertical, atividadesForaDaEscadinhaLob } from "./linha-balanco-modelo";

const linha = (codigo: string, atividade: string, pavimento: string, inicio = "2026-10-15"): EntradaDaLinha => ({
  codigo, atividade, pavimento, frente: "", inicio, duracao: 20,
  quantidade: 80, unidade: "m²", executado: 20, marco: false,
});

describe("Linha de Balanço: leitura técnica sem dados inventados", () => {
  it("não conecta serviços diferentes nem repetições ambíguas no mesmo local", () => {
    const entradas = [
      linha("A1", "Laje", "P01"),
      linha("A2", "Laje", "P02"),
      linha("B1", "Alvenaria", "P01"),
      linha("C1", "Acabamento", "P01"),
      linha("C2", "Acabamento", "P01"),
      linha("C3", "Acabamento", "P02"),
    ];
    const fins = Object.fromEntries(entradas.map(p => [p.codigo, "2026-12-10"]));
    const r = prepararLinhaBalancoVertical(entradas, fins);
    expect(r.locais).toEqual(["P01", "P02"]);
    expect(r.series.find(s => s.chave === "laje")?.repetitiva).toBe(true);
    expect(r.series.find(s => s.chave === "alvenaria")?.repetitiva).toBe(false);
    expect(r.series.find(s => s.chave === "acabamento")?.repetitiva).toBe(false);
    expect(r.series.find(s => s.chave === "laje")?.pontos.length).toBe(2);
  });

  it("usa meses reais e datas exatas em ano bissexto", () => {
    const meses = faixasDeTempo("2028-01-27", "2028-03-03", "mes");
    expect(meses.map(m => m.inicio)).toEqual(["2028-01-01","2028-02-01","2028-03-01"]);
    expect(meses[1]?.fimExclusivo).toBe("2028-03-01");
    const quinzenas = faixasDeTempo("2028-02-28", "2028-03-03", "quinzena");
    expect(quinzenas.map(m => m.inicio)).toEqual(["2028-02-01","2028-02-16","2028-03-01"]);
    expect(quinzenas[1]?.fimExclusivo).toBe("2028-03-01");
  });

  it("ocupação por local é a contagem de tarefas com sobreposição, não produtividade", () => {
    const entradas = [
      linha("X1", "Concreto", "P01", "2026-10-14"),
      linha("X2", "Vedações", "P01", "2026-10-25"),
      linha("X3", "Concreto", "P02", "2026-11-01"),
    ];
    const mapa = prepararLinhaBalancoVertical(entradas, {X1:"2026-10-20",X2:"2026-11-10",X3:"2026-11-20"});
    const pontos = mapa.series.flatMap(s => s.pontos);
    const outubro = faixasDeTempo("2026-10-14", "2026-11-20", "mes")[0]!;
    expect(ocupacaoNaFaixa(pontos, "P01", outubro).length).toBe(2);
    expect(ocupacaoNaFaixa(pontos, "P02", outubro).length).toBe(0);
    expect(ocupacaoNaFaixa(pontos, "P02", {inicio:"2026-11-01",fimExclusivo:"2026-12-01",rotulo:"nov/26"}).length).toBe(1);
  });

  it("recusa datas inválidas, marcos e término anterior ao início", () => {
    expect(dataValida("2026-02-29")).toBe(false);
    expect(dataValida("2028-02-29")).toBe(true);
    const marco = linha("M1", "Marco", "P01"); marco.marco=true;
    const r = prepararLinhaBalancoVertical([
      marco, linha("A1", "Alvenaria", "P02", "2026-11-08"),
      linha("A2", "Piso", "P03", "2026-11-08"),
    ], {M1:"2026-11-08",A1:"2026-11-02",A2:"2026-11-24"});
    expect(r.series.flatMap(s=>s.pontos.map(p=>p.codigo))).toEqual(["A2"]);
    expect(r.descartadas).toBe(2);
  });
});

describe("LOB — todas as atividades na mesma régua desde o início da obra",()=>{
  it("mostra atividades gerais de 2026 e preserva as mesmas escadinhas de 2028",()=>{
    const gerais=Array.from({length:53},(_,i)=>({
      ...linha("G"+(i+1),"Atividade "+(i+1),"Disciplina da EAP","2026-10-01"),
      frente:i<15?"Mobilização":i<30?"Estrutura":"Acabamentos",
    }));
    const repetidas=Array.from({length:18},(_,i)=>({
      ...linha("QA"+i,["Alvenaria","Chapisco","Pintura"][Math.floor(i/6)]!,
        "P0"+(i%6+1),"2028-03-01"),
      frente:"Execução",
    }));
    const linhas=[...gerais,...repetidas];
    const fins=Object.fromEntries(linhas.map(l=>[l.codigo,l.codigo.startsWith("QA")?"2028-03-12":"2026-11-05"]));
    const modelo=prepararLinhaBalancoVertical(linhas,fins);
    const r=atividadesForaDaEscadinhaLob(linhas,fins,modelo.series.filter(s=>s.repetitiva));
    expect(r.flatMap(x=>x.pontos)).toHaveLength(53);
    expect(r[0]?.pontos[0]?.inicio).toBe("2026-10-01");
    expect(modelo.series.filter(x=>x.repetitiva).flatMap(x=>x.pontos)).toHaveLength(18);
    expect(r.flatMap(x=>x.pontos).some(x=>x.codigo.startsWith("QA"))).toBe(false);
    expect(r.map(x=>x.nome)).toEqual(["Acabamentos","Estrutura","Mobilização"]);
  });
  it("não cria períodos para marcos nem registros sem término válido",()=>{
    const m=linha("M","Liberação","Serviços Gerais");m.marco=true;
    const x=linha("X","Fundações","Infraestrutura","2026-10-01");
    const y=linha("Y","Mobilização","Serviços Gerais","2026-10-02");
    const r=atividadesForaDaEscadinhaLob([m,x,y],{M:"2026-10-01",X:"2026-09-30"},[]);
    expect(r.flatMap(z=>z.pontos.map(p=>p.codigo))).toEqual([]);
    const r2=atividadesForaDaEscadinhaLob([m,x,y],{M:"2026-10-01",X:"2026-10-06",Y:"2026-10-08"},[]);
    expect(r2.flatMap(z=>z.pontos.map(p=>p.codigo))).toEqual(["X","Y"]);
    expect(r2.some(z=>z.nome==="Infraestrutura")).toBe(false);
  });
});
