import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("LOB — escrita de localização isolada do planejamento",()=>{
  const router=readFileSync("server/routers.ts","utf8");
  const view=readFileSync("client/src/components/VisualizacaoPlanejamento.tsx","utf8");
  const model=readFileSync("client/src/components/AuroraLinhaBalanco.tsx","utf8");
  const endpoint=router.split("definirLocalLob: protectedProcedure")[1]?.split("// ---------------------------------------------------------- calendário")[0]??"";
  it("restringe à versão de trabalho e unidades da mesma obra",()=>{
    expect(endpoint).toContain("assertAccessibleProject");
    expect(endpoint).toContain('["draft","proposed"]');
    expect(endpoint).toContain("eq(productionUnits.projectId,input.projectId)");
    expect(endpoint).toContain("eq(wbsNodes.versionId,versionId)");
    expect(endpoint).toContain("isTerminalEapNode");
  });
  it("escreve exclusivamente o campo EAP.location, sem invalidar CPM, atividade ou baseline",()=>{
    expect(endpoint).toContain("db.update(wbsNodes).set({location,updatedAt:new Date()})");
    expect(endpoint).not.toContain(".update(scheduleActivities)");
    expect(endpoint).not.toContain(".update(scheduleBaselines)");
  });
  it("consulta unidades e EAP reais e exige clique do usuário para editar",()=>{
    expect(view).toContain("trpc.projects.wbs.useQuery");
    expect(view).toContain("trpc.production.units.useQuery");
    expect(view).toContain("trpc.planning.definirLocalLob.useMutation");
    expect(model).toContain("aplicarLocaisDaEapNaLob");
    expect(model).toContain('data-testid="lob-location-mapping"');
    expect(model).toContain("onDefinirLocal?.(node.id,Number(valor))");
  });
});
