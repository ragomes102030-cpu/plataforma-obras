import { validateEapScope } from "../construction/eap-validator";
import type { EapScopeNode } from "../construction/eap-validator";

const n=(o: Partial<EapScopeNode> = {}): EapScopeNode => ({
  id: 1, projectId: 8, externalId: null, externalUid: null, parentId: null,
  code: "1", name: "Obra", level: 1, nodeType: "grupo", unit: null,
  plannedQuantity: null, sortOrder: 0,
  description: "Escopo completo.", inclusions: "Itens contratados.",
  exclusions: "Itens fora do contrato.", responsible: "Engenheiro",
  acceptanceCriteria: "Inspeção aprovada.", decompositionBasis: "project", ...o
});

export function runEapValidatorQaSuiteV2() {
  const duplicate = validateEapScope([
    n(), n({id:2,parentId:1,code:"1.1",name:"Fundação",nodeType:"entrega"}),
    n({id:3,parentId:1,code:"1.2",name:"Fundação",nodeType:"pacote"})
  ]);
  const textual = validateEapScope([
    n(),
    n({id:2,parentId:1,code:"1.1",name:"Fundação A",nodeType:"entrega",description:"Formas, armaduras, concretagem e cura.",inclusions:"Formas, armaduras, concretagem e cura.",exclusions:"Impermeabilização."}),
    n({id:3,parentId:1,code:"1.2",name:"Fundação B",nodeType:"pacote",description:"Formas, armaduras, concretagem e cura.",inclusions:"Formas, armaduras, concretagem e cura.",exclusions:"Impermeabilização."})
  ]);
  const checks = [
    {id:"duplicate-scope-blocked",passed:duplicate.issues.some(i=>i.code==="possible_scope_overlap")},
    {id:"textual-scope-overlap-warning",passed:textual.issues.some(i=>i.code==="eap_scope_overlap_evidence")}
  ];
  return {suite:"EAP_SCOPE_REGRESSION_V2",status:checks.every(c=>c.passed)?"passed":"failed",checks};
}
