import { describe, expect, it } from "vitest";
import { auditApprovedSnapshot, type ApprovedSnapshot } from "./approved-plan-audit";

const snapshot: ApprovedSnapshot = {
  nodes: [
    { id:1, code:"1", parentId:null, level:1 },
    { id:2, code:"1.1", parentId:1, level:2 },
    { id:3, code:"1.1.1", parentId:2, level:3 },
  ],
  activities: [{
    id:42, durationDays:3, earlyStart:0, earlyFinish:3,
    lateStart:0, lateFinish:3, totalFloat:0, freeFloat:0, critical:true,
  }],
  dependencies:[], lobRows:6, activitiesWithResourceAllocations:0,
};

function fakeClients(startOffset=0, persistence=false) {
  const calls: Array<{name:string,args:Record<string,unknown>}> = [];
  const client = (payload: object) => ({
    callTool: async (name:string, args:Record<string,unknown>) => {
      calls.push({name,args});
      return {content:[{type:"text",text:JSON.stringify(payload)}]};
    },
  });
  return {
    clients: {
      eap:client({ok:true,total_nos:3,erros:[],persistido:false}),
      cronograma:client({valid:true,persistido:persistence,atividades:[{
        id:"42", ES:startOffset, EF:3, LS:0, LF:3,
        folga_total:0,folga_livre:0,critica:true,
      }]}),
      ganttLob:client({persistido:false}),
    }, calls,
  };
}

describe("auditoria isolada da versão aprovada AURORA",()=>{
  it("aprova paridade real EAP/CPM e mantém LOB como pendente",async()=>{
    const {clients,calls}=fakeClients();
    const r=await auditApprovedSnapshot(snapshot,clients);
    expect(r.readOnly).toBe(true);
    expect(r.eap.status).toBe("passed");
    expect(r.cpm.status).toBe("passed");
    expect(r.cpm.differences).toEqual([]);
    expect(r.lob.status).toBe("pending");
    expect(r.lob.associations).toBe(6);
    expect(calls.map(x=>x.name)).toEqual(["validar_estrutura_eap","calcular_cpm_com_evidencia"]);
    const eapInput=calls.find(x=>x.name==="validar_estrutura_eap")?.args.nos as Array<{parent_id:string|null}>;
    expect(eapInput.map(x=>x.parent_id)).toEqual([null,"1","1.1"]);
    expect(JSON.stringify(calls)).not.toContain("project_id");
  });

  it("marca divergência de ES, sem gravar baseline",async()=>{
    const r=await auditApprovedSnapshot(snapshot,fakeClients(1).clients);
    expect(r.cpm.status).toBe("failed");
    expect(r.cpm.differences[0].fields).toContain("earlyStart");
  });

  it("não aceita resposta que omite persistido=false",async()=>{
    const r=await auditApprovedSnapshot(snapshot,fakeClients(0,true).clients);
    expect(r.cpm.status).toBe("failed");
    expect(r.cpm.error).toMatch(/persistido/);
  });

  it("recusa dependência para atividade de outra versão",async()=>{
    const withBadDependency={...snapshot,dependencies:[{
      predecessorId:42, successorId:999, type:"FS",lag:0,
    }]};
    await expect(auditApprovedSnapshot(withBadDependency,fakeClients().clients))
      .rejects.toThrow(/fora da versão aprovada/);
  });

  it("não trata EAP com pai externo como válida",async()=>{
    const data={...snapshot,nodes:snapshot.nodes.map(n=>({...n}))};
    data.nodes[2].parentId=999;
    await expect(auditApprovedSnapshot(data,fakeClients().clients))
      .rejects.toThrow(/pai fora da versão aprovada/);
  });
});
