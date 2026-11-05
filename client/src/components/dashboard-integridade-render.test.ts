import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { montarResumo } from "@shared/painel-obra";

vi.mock("./CurvaSControlTower", () => ({CurvaSControlTower:()=>null}));
import { ControlTowerDashboard } from "./ControlTowerDashboard";

const resumo = montarResumo({
  hoje:"2026-11-05",inicio:"2026-11-01",fim:"2027-01-01",
  fisico:{real:0,planejado:.4},
  status:{total:1,concluidas:0,emAndamento:0,atrasadas:0,naoIniciadas:1},
  valor:{total:100,distribuido:100,executado:0},alertas:{},
});
const props = {
  projetoId:25,nomeObra:"Escola",codigosExemplo:new Set<string>(),hoje:"2026-11-05",resumo,
  prazoConfianca:{confiavel:true,motivo:"CPM atual"},alertas:[],valorSemDestino:0,ultimos:[],
  ppc:null,bloqueadas:null,compromissosPendentes:null,carregandoComplementos:false,erroComplementos:false,
  orcamentoEstado:"ok" as const,producaoEstado:"ok" as const,semanaEstado:"ok" as const,abrirAba:()=>{},
};

describe("dashboard não transforma dado ausente em desempenho zero", () => {
  it("mantém planejado e suprime realizado/desvio/EV sem medição", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{...props,avancoEstado:"sem-producao",orcamentoConfiavel:true}));
    expect(html).toContain("Produção ainda não apurada");
    expect(html).toContain("40,0%");
    expect(html).toContain("Sem dado");
    expect(html).not.toContain("A execução está abaixo");
    expect(html).not.toContain("Avanço realizado 0,0%");
    expect(html).not.toContain("−40,0 p.p.");
    expect(html).not.toMatch(/<strong>R\$.*?0<\/strong>/);
  });
  it("não apresenta orçamento didático/parcial como valor agregado", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{...props,avancoEstado:"indisponivel",orcamentoConfiavel:false}));
    expect(html).toContain("Orçamento em revisão");
    expect(html).not.toContain("A execução está abaixo");
    expect(html).not.toContain("Avanço realizado 0,0%");
  });
  it("aceita execução zero quando existe medição confirmada e régua válida", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{...props,avancoEstado:"ok",orcamentoConfiavel:true}));
    expect(html).toContain("Avanço realizado 0,0%");
    expect(html).toContain("A execução está abaixo");
    expect(html).toContain("−40,0 p.p.");
  });
});
