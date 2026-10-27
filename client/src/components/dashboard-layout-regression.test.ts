import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const painel = readFileSync("client/src/components/PainelDoCronograma.tsx", "utf8");
const estilos = readFileSync("client/src/dashboard-executivo.css", "utf8");
const home = readFileSync("client/src/pages/Home.tsx", "utf8");

describe("Dashboard de obra — clareza visual sem regressão de engenharia", () => {
  it("usa o título de função sem repetir o nome da obra no painel principal", () => {
    expect(painel).toContain('<h2 className="pd-titulo">Visão geral</h2>');
    expect(painel).toContain("Painel de controle");
    expect(painel).not.toContain('<h2 className="pd-titulo">{nomeObra ?? "Obra"}</h2>');
    expect(painel).toContain('className="pd-cabecalho-acoes"');
  });

  it("preserva os indicadores oficiais, mas mostra o EV em reais e seu denominador", () => {
    expect(painel).toContain("calcularPesosDaCurva(atividades, orcamento.data?.items ?? [])");
    expect(painel).toContain("executado += valorDaAtividade * avanco");
    expect(painel).toContain("planejadoPorValor += valorDaAtividade * (planejadoPorCodigo.get");
    expect(painel).toContain("montarResumo({");
    expect(painel).toContain("Valor agregado (EV)");
    expect(painel).toContain("brl(valor.executado)");
    expect(painel).toContain("pct(valor.pctExecutado ?? 0)");
    expect(painel).toContain("pct(fisico.real)");
    expect(painel).toContain("pct(fisico.planejado)");
    expect(painel).toContain("valorSemDestino > 0");
  });

  it("mantém todas as decisões acionáveis e as réguas acessíveis", () => {
    expect(painel).toContain('onClick={() => abrirAba("gantt")}');
    expect(painel).toContain('onClick={() => abrirAba(a.aba!)}');
    expect(painel).toContain('onClick={() => abrirAba("producao")}');
    expect(painel).toContain('aria-label="Indicadores principais"');
    expect(painel).toContain('aria-label="Situação das atividades"');
    expect(painel).toContain('role="img" aria-label=');
    expect(painel).toContain('<details className="pd-nota">');
    expect(painel).toContain("Como este painel calcula os indicadores");
  });

  it("o CSS fica restrito ao dashboard e oferece breakpoints para desktop e celular", () => {
    expect(home).toContain('import "@/dashboard-executivo.css"');
    expect(painel.match(/className="pd pd-executivo"/g)?.length).toBe(3);
    expect(estilos).toContain(".pd.pd-executivo");
    expect(estilos).toContain(".pd-executivo .pd-kpis");
    expect(estilos).toContain(".pd-executivo .pd-alerta-critico");
    expect(estilos).toContain(".pd-executivo .pd-tabela-rolagem");
    expect(estilos).toContain("max-width:1279px");
    expect(estilos).toContain("max-width:760px");
    expect(estilos).toContain("max-width:480px");
    expect(estilos).toContain(":focus-visible");
  });
});
