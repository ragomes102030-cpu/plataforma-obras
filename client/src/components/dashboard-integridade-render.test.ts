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
  simulacaoQa:{valorAgregado:0,percentual:0,lancamentosValidos:0,lancamentosUnidadeIncompativel:0,lancamentosForaDaVersao:0,pontos:[]},
  prazoConfianca:{confiavel:true,motivo:"CPM atual"},alertas:[],valorSemDestino:0,ultimos:[],
  prazoOperacional:{fimPrevisto:"2027-01-01",motivo:"CPM atual",variacaoBaseline:null,criticas:1,atrasadas:0,proximas:1,bloqueadas:0,emAndamento:0,concluidas:0,naoIniciadas:1,semAtualizacao:1,totalAtividades:1,dataUltimaPosicao:null},
  ppc:null,bloqueadas:null,compromissosPendentes:null,carregandoComplementos:false,erroComplementos:false,
  orcamentoEstado:"ok" as const,producaoEstado:"ok" as const,semanaEstado:"ok" as const,abrirAba:()=>{},
};
const prontidao = (fisico:"disponivel"|"sem_pesos"|"sem_producao"|"erro",financeiro:"disponivel"|"sem_orcamento"|"cobertura_incompleta"|"didatico"|"erro",evDisponivel=false) => ({
  fisico,financeiro,evDisponivel,orientacoes:[],
});

describe("dashboard não transforma dado ausente em desempenho zero", () => {
  it("mantém planejado e suprime realizado/desvio/EV sem medição", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{...props,prontidao:prontidao("sem_producao","disponivel")}));
    expect(html).toContain("Produção ainda não apurada");
    expect(html).toContain("40,0%");
    expect(html).toContain("Sem dado");
    expect(html).not.toContain("A execução está abaixo");
    expect(html).not.toContain("Avanço realizado 0,0%");
    expect(html).not.toContain("−40,0 p.p.");
    expect(html).not.toMatch(/<strong>R\$.*?0<\/strong>/);
  });
  it("não apresenta orçamento didático/parcial como valor agregado", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{...props,prontidao:prontidao("sem_pesos","didatico")}));
    expect(html).toContain("Orçamento de teste");
    expect(html).toContain("Avanço físico ainda sem pesos aprovados");
    expect(html).not.toMatch(/r[eé]gua validada/i);
    expect(html).not.toContain("A execução está abaixo");
    expect(html).not.toContain("Avanço realizado 0,0%");
  });
  it("informa que faltam pesos quando já existe produção confirmada", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{
      ...props,
      ultimos:[{id:1,data:"2026-11-16",codigo:"1.2.1",atividade:"Estacas hélice contínua Ø600 — Torre A",quantidade:12,unidade:"M",situacao:"confirmada"}],
      prontidao:prontidao("sem_pesos","disponivel"),
    }));
    expect(html).toContain("12,0 M · confirmada");
    expect(html).toContain("Pesos físicos pendentes");
    expect(html).toContain("Aguardando pesos físicos aprovados");
    expect(html).not.toContain("Sem produção confirmada");
  });
  it("aceita execução zero quando existem pesos e medição confirmados", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{...props,prontidao:prontidao("disponivel","disponivel",true)}));
    expect(html).toContain("Avanço realizado 0,0%");
    expect(html).toContain("A execução está abaixo");
    expect(html).toContain("−40,0 p.p.");
  });
  it("mantém a programação e as atualizações de prazo visíveis sem orçamento ou pesos", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{
      ...props,
      prontidao:prontidao("sem_pesos","sem_orcamento"),
      prazoOperacional:{...props.prazoOperacional,fimPrevisto:null,motivo:"Defina a data inicial planejada",atrasadas:null,proximas:null,semAtualizacao:1},
    }));
    expect(html).toContain("PLANEJAMENTO DE PRAZO");
    expect(html).toContain("1 atividade");
    expect(html).toContain("PLANO CALCULADO");
    expect(html).toContain("Não calculado");
    expect(html).toContain("1 sem atualização");
    expect(html).toContain("Sem orçamento aprovado");
  });
  it("identifica pesos, EV e classificações sintéticas no cenário QA liberado", () => {
    const html=renderToStaticMarkup(createElement(ControlTowerDashboard,{
      ...props,
      prontidao:prontidao("disponivel","disponivel",true),
      prontidaoPesos:{total:86,comQuantidade:86,comPeso:86,comEvidencia:86,aprovadas:86,somaPesos:100,semVinculoOrcamento:0,eapStatus:"approved",cenarioQa:true,foraDaLobQa:40},
    }));
    expect(html).toContain("CENÁRIO QA");
    expect(html).toContain("não são medição real");
    expect(html).toContain("VALOR AGREGADO (EV)");
    expect(html).toContain("EV QA (simulação): Sem apontamento QA compatível");
    expect(html).not.toContain("VALOR AGREGADO · CENÁRIO QA");
    expect(html).toContain("40 atividade(s) sem unidade exata");
  });

  it("explica o caminho por serviços antes dos indicadores financeiros", () => {
    const html = renderToStaticMarkup(createElement(ControlTowerDashboard, {
      ...props,
      prontidao: prontidao("sem_pesos", "sem_orcamento"),
      roteiroReadiness: {
        eapApproved: true,
        activityCount: 2,
        durationsComplete: true,
        networkValid: true,
        plannedStartDefined: true,
        cpmCurrent: true,
        baselineActive: true,
        totalActivities: 2,
        activitiesWithUpdate: 1,
      },
      roteiroForecast: {
        loading: false,
        available: true,
        plannedFinishDate: "2027-01-01",
        forecastFinishDate: "2027-01-04",
        activitiesWithUpdate: 1,
        totalActivities: 2,
        outOfSequenceActivityIds: [],
        warnings: [],
        unavailableReason: null,
      },
    }));
    expect(html.indexOf("Como planejar esta obra")).toBeLessThan(html.indexOf("Resumo do desempenho"));
    expect(html).toContain("Orçamento opcional");
    expect(html).toContain("Previsão pelos relatos: 04/01/2027");
    expect(html).toContain("1 de 2 serviços atualizados");
  });
});
