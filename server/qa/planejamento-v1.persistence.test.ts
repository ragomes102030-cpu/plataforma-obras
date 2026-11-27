import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { aplicarMigrations, migrationsEmDisco } from "../test-helpers/pglite";
import { resolveActivityDuration } from "../construction/activity-planning";

describe("QA v1 — persistência isolada do planejamento", () => {
  it("grava e relê EAP, cronograma, rede, baseline, LOB e apontamentos sem tocar produção", async () => {
    const pg = await PGlite.create();
    try {
      for (const sql of migrationsEmDisco()) await aplicarMigrations(pg, sql);
      await pg.exec(`
        INSERT INTO projects (code,name,location,status,progress,"plannedStart")
          VALUES ('QA-V1','Obra fictícia QA','Ambiente isolado','Planejamento',0,'2026-11-30');
        INSERT INTO project_plan_versions ("projectId","versionNumber",status)
          SELECT id,1,'draft' FROM projects WHERE code='QA-V1';
        INSERT INTO wbs_nodes ("projectId","versionId",code,name,level,"nodeType")
          SELECT "projectId",id,'1','Obra',1,'grupo' FROM project_plan_versions;
        INSERT INTO wbs_nodes ("projectId","versionId","parentId",code,name,level,"nodeType",unit,"plannedQuantity")
          SELECT "projectId","versionId",id,'1.1','Fundação',2,'pacote','m3',40 FROM wbs_nodes WHERE code='1';
        INSERT INTO wbs_nodes ("projectId","versionId","parentId",code,name,level,"nodeType",unit,"plannedQuantity")
          SELECT "projectId","versionId",id,'1.2','Alvenaria',2,'pacote','m2',200 FROM wbs_nodes WHERE code='1';
        INSERT INTO schedule_activities ("projectId","versionId","wbsNodeId","wbsCode",name,phase,"startOffset","durationDays","plannedQuantity",unit,productivity,"earlyStart","earlyFinish")
          SELECT "projectId","versionId",id,code,name,'Execução',0,2,"plannedQuantity",unit,20,0,2 FROM wbs_nodes WHERE code='1.1';
        INSERT INTO schedule_activities ("projectId","versionId","wbsNodeId","wbsCode",name,phase,"startOffset","durationDays","plannedQuantity",unit,productivity,"earlyStart","earlyFinish")
          SELECT "projectId","versionId",id,code,name,'Execução',2,4,"plannedQuantity",unit,50,2,6 FROM wbs_nodes WHERE code='1.2';
        INSERT INTO schedule_dependencies ("projectId","versionId","predecessorId","successorId",type,lag)
          SELECT a."projectId",a."versionId",a.id,b.id,'FS',0 FROM schedule_activities a CROSS JOIN schedule_activities b WHERE a."wbsCode"='1.1' AND b."wbsCode"='1.2';
        INSERT INTO production_units ("projectId",code,name,"unitType")
          SELECT id,'P01','Pavimento 1','pavimento' FROM projects WHERE code='QA-V1';
        INSERT INTO production_units ("projectId",code,name,"unitType")
          SELECT id,'P02','Pavimento 2','pavimento' FROM projects WHERE code='QA-V1';
        INSERT INTO lob_activity_locations ("projectId","versionId","activityId","unitId","plannedQuantity","startDate","finishDate")
          SELECT a."projectId",a."versionId",a.id,u.id,100,'2026-12-02','2026-12-03' FROM schedule_activities a JOIN production_units u ON u."projectId"=a."projectId" WHERE a."wbsCode"='1.2' AND u.code='P01';
        INSERT INTO lob_activity_locations ("projectId","versionId","activityId","unitId","plannedQuantity","startDate","finishDate")
          SELECT a."projectId",a."versionId",a.id,u.id,100,'2026-12-04','2026-12-07' FROM schedule_activities a JOIN production_units u ON u."projectId"=a."projectId" WHERE a."wbsCode"='1.2' AND u.code='P02';
        UPDATE project_plan_versions SET status='approved', "approvedAt"=now();
        INSERT INTO schedule_baselines ("projectId","versionId",name,status)
          SELECT "projectId",id,'Baseline QA','ativa' FROM project_plan_versions;
        INSERT INTO schedule_baseline_items ("baselineId","activityId","startOffset","durationDays","earlyStart","earlyFinish")
          SELECT b.id,a.id,a."startOffset",a."durationDays",a."earlyStart",a."earlyFinish"
          FROM schedule_activities a JOIN schedule_baselines b ON b."versionId"=a."versionId";
        INSERT INTO production_entries ("projectId","activityId","productionDate",quantity,"measurementUnit",status,exemplo)
          SELECT "projectId",id,'2026-12-01',20,'m3','rascunho',1 FROM schedule_activities WHERE "wbsCode"='1.1';
      `);
      const atividades = await pg.query<{ quantidade: string; produtividade: string; duracao: number }>(`
        SELECT "plannedQuantity"::text AS quantidade,productivity::text AS produtividade,"durationDays" AS duracao FROM schedule_activities ORDER BY "wbsCode"
      `);
      expect(atividades.rows).toHaveLength(2);
      for (const a of atividades.rows) expect(resolveActivityDuration({plannedQuantity:Number(a.quantidade),productivity:Number(a.produtividade)})).toBe(a.duracao);
      const leitura = await pg.query<{ folhas:number; rede:number; baseline:number; parcelas:number; quantidade:number; confirmadas:number }>(`
        SELECT (SELECT count(*)::int FROM wbs_nodes WHERE "nodeType"='pacote') AS folhas,
          (SELECT count(*)::int FROM schedule_dependencies) AS rede,
          (SELECT count(*)::int FROM schedule_baseline_items) AS baseline,
          (SELECT count(*)::int FROM lob_activity_locations) AS parcelas,
          (SELECT sum("plannedQuantity")::int FROM lob_activity_locations) AS quantidade,
          (SELECT count(*)::int FROM production_entries WHERE status='confirmada' AND exemplo=0) AS confirmadas
      `);
      expect(leitura.rows[0]).toEqual({folhas:2,rede:1,baseline:2,parcelas:2,quantidade:200,confirmadas:0});
      await expect(pg.exec(`INSERT INTO schedule_baselines ("projectId","versionId",name,status)
        SELECT "projectId",id,'Duplicada','ativa' FROM project_plan_versions`)).rejects.toThrow();
      await expect(pg.exec(`UPDATE lob_activity_locations SET "plannedQuantity"=0`)).rejects.toThrow();
      await expect(pg.exec(`UPDATE lob_activity_locations SET "finishDate"='2026-01-01'`)).rejects.toThrow();
      const final = await pg.query<{ n:number }>(`SELECT count(*)::int AS n FROM schedule_baselines WHERE status='ativa'`);
      expect(final.rows[0]?.n).toBe(1);
    } finally {
      await pg.close();
    }
  }, 60000);
});
