import { describe, expect, it } from "vitest";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { dataValida, faixasDeTempo, ocupacaoNaFaixa, prepararLinhaBalancoVertical } from "./linha-balanco-modelo";

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
