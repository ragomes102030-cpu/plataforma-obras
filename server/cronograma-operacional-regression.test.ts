import {describe,expect,it} from "vitest";
import {isStoredCpmCurrent} from "../shared/cpm-validity";
import {orientarFluxoPlanejamento} from "../shared/planning-guidance";
import {avaliarProntidaoDeAvanco} from "../shared/progress-readiness";

const atividade=(updatedAt:string,cpmCalculatedAt:string|null)=>({
  id:101,durationDays:5,updatedAt,cpmCalculatedAt,earlyStart:"2026-11-01",earlyFinish:"2026-11-05",
  lateStart:"2026-11-01",lateFinish:"2026-11-05",totalFloat:0,freeFloat:0,critical:1,exemplo:0,
});
describe("regressão causa e efeito do cronograma operacional",()=>{
  it("alterar duração ou vínculo invalida CPM e orienta recalcular antes da baseline",()=>{
    const calculada=atividade("2026-11-05T10:00:00Z","2026-11-05T10:01:00Z");
    expect(isStoredCpmCurrent([calculada])).toBe(true);
    const alterada={...calculada,updatedAt:"2026-11-05T10:02:00Z"};
    expect(isStoredCpmCurrent([alterada])).toBe(false);
    const fluxo=orientarFluxoPlanejamento({eapApproved:true,currentVersionNumber:2,activities:[alterada],networkValidation:{valid:true,issues:[]},baselines:[],approvedVersionId:2});
    expect([fluxo.primaria,...fluxo.demais].map(item=>item?.id)).toContain("cpm-desatualizado");
    const recalculada={...alterada,cpmCalculatedAt:"2026-11-05T10:03:00Z"};
    expect(isStoredCpmCurrent([recalculada])).toBe(true);
    const liberada=orientarFluxoPlanejamento({eapApproved:true,currentVersionNumber:2,activities:[recalculada],networkValidation:{valid:true,issues:[]},baselines:[],approvedVersionId:2});
    expect([liberada.primaria,...liberada.demais].map(item=>item?.id)).not.toContain("cpm-desatualizado");
    expect(liberada.primaria?.id).toBe("baseline-ausente");
  });
  it("produção confirmada não inventa agregado físico sem pesos",()=>{
    const prontidao=avaliarProntidaoDeAvanco({pesosFisicosAprovados:false,temProducaoConfirmada:true,orcamentoAprovado:true,orcamentoDidatico:false,atividadesSemCusto:0});
    expect(prontidao.fisico).toBe("sem_pesos");
    expect(prontidao.financeiro).toBe("disponivel");
    expect(prontidao.evDisponivel).toBe(false);
  });
});
