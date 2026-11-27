import { describe, expect, it } from "vitest";
import { avaliarIntegridadeDashboard } from "./dashboard-integridade";

const base = {
  hoje: "2026-11-05", atividades: [{id:1,budgetItemId:10,unit:"M"}],
  itens: [{id:10,code:"1.1",quantity:5,unitPrice:100,source:"SEINFRA 028",officialPriceItemId:1,quantityEvidence:"Memória de levantamento conferida",quantityEvidenceStatus:"validada"}],
  versaoAtivaAprovada: true, custoPorAtividade: new Map([[1,500]]), lancamentos: [],
  pesosFisicosAprovados: true,
};
const medicao = { activityId:1,productionDate:"2026-11-05",quantity:0,status:"confirmada",vinculo:"atual",measurementUnit:"M" };

describe("integridade dos indicadores do dashboard", () => {
  it("distingue ausência de medição de medição confirmada zero", () => {
    expect(avaliarIntegridadeDashboard(base)).toMatchObject({orcamentoConfiavel:true,temProducaoConfirmada:false,prontidao:{fisico:"sem_producao",financeiro:"disponivel"}});
    expect(avaliarIntegridadeDashboard({...base,lancamentos:[medicao]}).temProducaoConfirmada).toBe(true);
  });
  it("não considera produção confirmada quando a unidade diverge da atividade", () => {
    expect(avaliarIntegridadeDashboard({
      ...base,
      lancamentos:[{...medicao,quantity:12,measurementUnit:"un"}],
    }).temProducaoConfirmada).toBe(false);
  });
  it("mantém o físico independente do orçamento", () => {
    const resultado=avaliarIntegridadeDashboard({...base,itens:[],versaoAtivaAprovada:false,lancamentos:[medicao]});
    expect(resultado.prontidao).toMatchObject({fisico:"disponivel",financeiro:"sem_orcamento"});
  });
  it.each([
    {...medicao,status:"rascunho"}, {...medicao,productionDate:"2026-11-06"},
    {...medicao,activityId:999}, {...medicao,vinculo:"versao_anterior"},
    {...medicao,exemplo:1}, {...medicao,quantity:-1}, {...medicao,quantity:"inválida"},
    {...medicao,productionDate:"2026-01-99"}, {...medicao,quantity:""}, {...medicao,productionDate:new Date("invalida")},
  ])("não usa lançamento inválido, futuro ou sem vínculo atual: %j", lancamento => {
    expect(avaliarIntegridadeDashboard({...base,lancamentos:[lancamento]}).temProducaoConfirmada).toBe(false);
  });
  it("não habilita EV real com quantitativos de cenário mesmo que o preço seja oficial", () => {
    const resultado=avaliarIntegridadeDashboard({...base,lancamentos:[medicao],itens:[{...base.itens[0],quantityEvidenceStatus:"cenario"}]});
    expect(resultado.prontidao.financeiro).toBe("didatico");
    expect(resultado.prontidao.evDisponivel).toBe(false);
  });
  it("não habilita régua financeira por fonte didática, cobertura parcial ou rascunho", () => {
    const didatico = avaliarIntegridadeDashboard({...base,itens:[{...base.itens[0],source:"Rateio uniforme didático"}]});
    expect(didatico.orcamentoConfiavel).toBe(false);
    expect(didatico.prontidao.financeiro).toBe("didatico");
    expect(avaliarIntegridadeDashboard({...base,atividades:[...base.atividades,{id:2,budgetItemId:null}]}).orcamentoConfiavel).toBe(false);
    expect(avaliarIntegridadeDashboard({...base,versaoAtivaAprovada:false}).orcamentoConfiavel).toBe(false);
  });
});
