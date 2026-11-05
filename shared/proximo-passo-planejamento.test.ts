import { describe, expect, it } from "vitest";
import { proximoPassoPlanejamento } from "./proximo-passo-planejamento";

const atividade = { durationDays: 5, cpmCalculatedAt: "2026-11-04T12:00:00Z", updatedAt: "2026-11-04T11:00:00Z" };
const plano = { eapApproved: true, currentVersionNumber: 8, approvedVersionId: 80, activities: [atividade], networkValidation: {valid:true,issues:[]}, baselines: [] };

describe("próximo passo a partir do plano persistido", () => {
  it("mostra revisão EAP apenas enquanto a versão atual não estiver aprovada", () => {
    expect(proximoPassoPlanejamento({...plano,eapApproved:false}).aba).toBe("eap");
    expect(proximoPassoPlanejamento(plano).aba).toBe("baseline");
  });
  it("não confunde rede inválida com CPM antigo ou atividades faltantes", () => {
    expect(proximoPassoPlanejamento({...plano,activities:[]}).aba).toBe("atividades");
    expect(proximoPassoPlanejamento({...plano,networkValidation:{valid:false,issues:[{message:"Ciclo detectado"}]}})).toMatchObject({aba:"dependencias",mensagem:"Ciclo detectado"});
    expect(proximoPassoPlanejamento({...plano,activities:[{...atividade,updatedAt:"2026-11-05T12:00:00Z"}]}).aba).toBe("cpm");
  });
  it("exige baseline da versão aprovada atual e ignora atividades QA", () => {
    const comBaseline = {...plano,baselines:[{status:"ativa",versionId:80}]};
    expect(proximoPassoPlanejamento(comBaseline).aba).toBe("producao");
    expect(proximoPassoPlanejamento({...comBaseline,baselines:[{status:"ativa",versionId:70}]}).aba).toBe("baseline");
    expect(proximoPassoPlanejamento({...comBaseline,activities:[atividade,{...atividade,durationDays:0,exemplo:1}]}).aba).toBe("producao");
  });
  it("não manda revisar o escopo inalterado depois do primeiro fork de atividades", () => {
    const herdado = {...plano,eapApproved:false,canCreateActivities:true};
    expect(proximoPassoPlanejamento({...herdado,activities:[]}).aba).toBe("atividades");
    expect(proximoPassoPlanejamento({...herdado,activities:[{...atividade,cpmCalculatedAt:null}]}).aba).toBe("cpm");
    expect(proximoPassoPlanejamento(herdado)).toMatchObject({aba:"baseline",titulo:"Revisar versão do plano"});
  });
});
