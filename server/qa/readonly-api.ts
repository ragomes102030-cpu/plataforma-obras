import { createHash, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

export function authorizeQa(header: string | undefined, digest: string | undefined, project: string | undefined, requested: string): boolean {
  if (!digest || !/^[a-f0-9]{64}$/i.test(digest) || !project || !/^[1-9][0-9]*$/.test(project) || requested !== project) return false;
  if (!header || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)) return false;
  const received = createHash("sha256").update(header.slice(7)).digest();
  return timingSafeEqual(received, Buffer.from(digest, "hex"));
}

export function validPosition(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function registerReadonlyQaApi(app: Express) {
  const path = "/internal/qa/readonly/:projectId";
  app.get(path, rateLimit({ windowMs: 60000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const requested = String(req.params.projectId);
    if (!authorizeQa(req.get("authorization"), process.env.QA_READONLY_TOKEN_SHA256, process.env.QA_READONLY_PROJECT_ID, requested)) {
      res.status(404).json({ ok: false }); return;
    }
    const projectId = Number(requested);
    const position = req.query.position;
    if (!Number.isSafeInteger(projectId) || !validPosition(position)) {
      res.status(400).json({ ok: false, error: "Informe uma data de posição válida." }); return;
    }
    try {
      const db = await getDb();
      if (!db) { res.status(503).json({ ok: false }); return; }
      // SELECT único: snapshot consistente, sem chamar endpoints de mutação.
      const result = await db.execute(sql`
        with p as (select id from projects where id=${projectId} and "deletedAt" is null),
        v as (select id,"versionNumber" from project_plan_versions where "projectId"=(select id from p) and status='approved'),
        b as (select id,"versionId" from schedule_baselines where "projectId"=(select id from p) and status='ativa'),
        a as (select id,exemplo,"physicalWeight","physicalWeightApprovedAt","plannedQuantity","durationDays","earlyStart","earlyFinish","cpmCalculatedAt","updatedAt" from schedule_activities where "projectId"=(select id from p) and "versionId" in (select id from v)),
        e as (select id,status,exemplo from production_entries where "projectId"=(select id from p) and "productionDate"<((${position}::date+1)::timestamp at time zone 'UTC')),
        bi as (select "activityId","earlyStart","earlyFinish","durationDays" from schedule_baseline_items where "baselineId" in (select id from b))
        select
          (select count(*)::int from p) as "projectCount",
          (select count(*)::int from v) as "approvedVersions",
          (select max("versionNumber") from v) as "versionNumber",
          (select count(*)::int from b) as "activeBaselines",
          (select count(*)::int from b where "versionId" in (select id from v)) as "matchingBaselines",
          (select count(*)::int from a) as "activities",
          (select count(*)::int from bi) as "baselineItems",
          (select count(*)::int from a where not exists(select 1 from bi where bi."activityId"=a.id and bi."earlyStart" is not distinct from a."earlyStart" and bi."earlyFinish" is not distinct from a."earlyFinish" and bi."durationDays" is not distinct from a."durationDays")) as "baselineMismatches",
          (select coalesce(sum("physicalWeight"::numeric),0) from a where coalesce(exemplo,0)<>1) as "physicalWeightSum",
          (select count(*)::int from a where coalesce(exemplo,0)<>1) as "curveActivities",
          (select count(*)::int from a where coalesce(exemplo,0)<>1 and ("physicalWeight" is null or "physicalWeight"::numeric<=0 or "physicalWeightApprovedAt" is null or "plannedQuantity" is null or "plannedQuantity"::numeric<=0 or "cpmCalculatedAt" is null or "updatedAt" is null or "cpmCalculatedAt"<"updatedAt" or "durationDays"<=0 or "earlyStart" is null)) as "invalidCurveActivities",
          (select count(*)::int from e where exemplo=1 and status='confirmada') as "confirmedExamples",
          (select count(*)::int from e where exemplo=1 and status='rascunho') as "draftExamples",
          (select count(*)::int from e where coalesce(exemplo,0)=0 and status='confirmada') as "confirmedProduction"
      `);
      const row = result.rows[0];
      if (!row || Number(row.projectCount) !== 1) { res.status(404).json({ ok: false }); return; }
      const ok = Number(row.approvedVersions)===1 && Number(row.activeBaselines)===1 && Number(row.matchingBaselines)===1 && Number(row.activities)>0 && Number(row.baselineItems)===Number(row.activities) && Number(row.baselineMismatches)===0 && Number(row.curveActivities)>0 && Math.abs(Number(row.physicalWeightSum)-100)<=0.01 && Number(row.invalidCurveActivities)===0 && Number(row.confirmedExamples)===0;
      res.status(ok ? 200 : 422).json({ ok, mode: "readonly", projectId, position, checks: row });
    } catch {
      // Nunca retornar credenciais, SQL ou detalhes de erros do driver.
      res.status(503).json({ ok: false, error: "Auditoria indisponível." });
    }
  });
}
