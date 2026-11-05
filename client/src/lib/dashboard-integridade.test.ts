import { describe, expect, it } from "vitest";
import { avaliarIntegridadeDashboard } from "./dashboard-integridade";

const base = {
  hoje: "2026-11-05", atividades: [{id:1,budgetItemId:10}],
  itens: [{id:10,code:"1.1",quantity:5,unitPrice:100,source:"SEINFRA 028"}],
  versaoAtivaAprovada: true, custoPorAtividade: new Map([[1,500]]), lancamentos: [],
};
const medicao = { activityId:1,productionDate:"2026-11-05",quantity:0,status:"confirmada",vinculo:"atual" };

describe("integridade dos indicadores do dashboard", () => {
  it("distingue ausência de medição de medição confirmada zero", () => {
    expect(avaliarIntegridadeDashboard(base)).toEqual({orcamentoConfiavel:true,temProducaoConfirmada:false});
    expect(avaliarIntegridadeDashboard({...base,lancamentos:[medicao]}).temProducaoConfirmada).toBe(true);
  });
  it.each([
    {...medicao,status:"rascunho"}, {...medicao,productionDate:"2026-11-06"},
    {...medicao,activityId:999}, {...medicao,vinculo:"versao_anterior"},
    {...medicao,exemplo:1}, {...medicao,quantity:-1}, {...medicao,quantity:"inválida"},
    {...medicao,productionDate:"2026-01-99"}, {...medicao,quantity:""}, {...medicao,productionDate:new Date("invalida")},
  ])("não usa lançamento inválido, futuro ou sem vínculo atual: %j", lancamento => {
    expect(avaliarIntegridadeDashboard({...base,lancamentos:[lancamento]}).temProducaoConfirmada).toBe(false);
  });
  it("não habilita régua financeira por fonte didática, cobertura parcial ou rascunho", () => {
    expect(avaliarIntegridadeDashboard({...base,itens:[{...base.itens[0],source:"Rateio uniforme didático"}]}).orcamentoConfiavel).toBe(false);
    expect(avaliarIntegridadeDashboard({...base,atividades:[...base.atividades,{id:2,budgetItemId:null}]}).orcamentoConfiavel).toBe(false);
    expect(avaliarIntegridadeDashboard({...base,versaoAtivaAprovada:false}).orcamentoConfiavel).toBe(false);
  });
});
