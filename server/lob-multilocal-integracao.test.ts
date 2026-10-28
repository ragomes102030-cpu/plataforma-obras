import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

/** Travar invariantes de segurança/versionamento da distribuição física. */
describe("LOB multi-local — contrato de persistência seguro",()=>{
  const router=readFileSync("server/routers.ts","utf8");
  const schema=readFileSync("drizzle/schema.ts","utf8");
  const sql=readFileSync("drizzle/0021_lob_activity_locations.sql","utf8");
  const perm=readFileSync("scripts/sql/lob-supabase-permissions.sql","utf8");
  const versions=readFileSync("server/construction/plan-versions.ts","utf8");
  const purge=readFileSync("server/trash-retention.ts","utf8");
  const ui=readFileSync("client/src/components/VisualizacaoPlanejamento.tsx","utf8");
  it("usa endpoints autenticados, verificação de obra, de versão e limite de quantitativo",()=>{
    for(const op of ["listarDistribuicoesLob","salvarDistribuicaoLob","removerDistribuicaoLob"]){
      const part=router.split(op+": protectedProcedure")[1];
      expect(part).toBeDefined();
      expect(part?.split(".query(async")[0]||part?.split(".mutation(async")[0]).toContain("projectId");
    }
    const save=router.split("salvarDistribuicaoLob: protectedProcedure")[1]?.split("removerDistribuicaoLob:")[0]??"";
    expect(save).toContain("assertAccessibleProject");
    expect(save).toContain('["draft","proposed"]');
    expect(save).toContain("activity.exemplo===1");
    expect(save).toContain("usado+qtdMil>total");
    expect(save).toContain("unitId:input.unitId");
    expect(save).not.toContain("update(scheduleActivities)");
    expect(save).not.toContain("scheduleBaselines");
  });
  it("mantém a distribuição em cada fork e apaga ao eliminar a obra",()=>{
    expect(versions).toContain("parcelasBase");
    expect(versions).toContain("activityIdMap.get(parcela.activityId)");
    expect(purge).toContain('DELETE FROM "lob_activity_locations"');
  });
  it("migração exclusiva do backend, sem acesso da Data API anônima",()=>{
    expect(perm).toContain("ENABLE ROW LEVEL SECURITY");
    expect(perm).toContain("TO arquimedes_app");
    expect(perm).toContain("FROM anon,authenticated,PUBLIC");
    expect(sql).toContain("lob_activity_locations_unique_idx");
    expect(schema).toContain("export const lobActivityLocations");
  });
  it("a LOB consulta e edita as parcelas e preserva o Gantt",()=>{
    expect(ui).toContain("trpc.planning.listarDistribuicoesLob.useQuery");
    expect(ui).toContain("<LobDistribuicaoPainel");
    expect(ui).toContain("view === \"gantt\"");
  });
  it("não perde execução ao distribuir e não atribui produção sem unidade a um local",()=>{
    expect(router).toContain("execucaoPorCodigoLocal");
    expect(router).toContain("if(entry.unitId!=null)");
    expect(router).toContain("`${codigo}\\t${entry.unitId}`");
    const modelo=readFileSync("client/src/components/lob-distribuicao-modelo.ts","utf8");
    expect(modelo).toContain("(execução sem local)");
    expect(modelo).toContain("quantidade:null,executado:executadoSemLocal");
  });
});
