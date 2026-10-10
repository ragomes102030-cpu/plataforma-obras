/**
 * Persiste o resultado do CPM nas atividades do banco.
 * Usa o schema Drizzle para atualizar earlyStart, earlyFinish, lateStart, lateFinish,
 * totalFloat, freeFloat, critical e cpmCalculatedAt.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import type { ScheduleResult } from "../../shared/cpm";

export type CpmPersisterDb = NodePgDatabase<typeof schema>;

/**
 * Persiste o resultado do CPM para todas as atividades de um projeto/versão.
 * Atualiza: earlyStart, earlyFinish, lateStart, lateFinish, totalFloat, freeFloat,
 * critical, cpmCalculatedAt.
 * Retorna o número de atividades atualizadas.
 */
export async function persistCpmResult(
  db: CpmPersisterDb,
  projectId: number,
  versionId: number | null,
  result: ScheduleResult
): Promise<number> {
  const activities = result.activities;
  if (activities.length === 0) {
    return 0;
  }

  // Atualiza cada atividade individualmente via SQL direto
  // (Drizzle não tem update em lote nativo)
  let updated = 0;
  for (const activity of activities) {
    const activityId = Number(activity.id);
    if (!Number.isInteger(activityId)) continue;

    const values = {
      earlyStart: activity.earlyStart,
      earlyFinish: activity.earlyFinish,
      lateStart: activity.lateStart,
      lateFinish: activity.lateFinish,
      totalFloat: activity.totalFloat,
      freeFloat: activity.freeFloat,
      critical: activity.critical ? 1 : 0,
      cpmCalculatedAt: sql`now()`,
    };

    const whereClause = versionId
      ? sql`id = ${activityId} AND "projectId" = ${projectId} AND "versionId" = ${versionId}`
      : sql`id = ${activityId} AND "projectId" = ${projectId}`;

    const updateSql = sql`
      UPDATE schedule_activities
      SET "earlyStart" = ${values.earlyStart},
          "earlyFinish" = ${values.earlyFinish},
          "lateStart" = ${values.lateStart},
          "lateFinish" = ${values.lateFinish},
          "totalFloat" = ${values.totalFloat},
          "freeFloat" = ${values.freeFloat},
          critical = ${values.critical},
          "cpmCalculatedAt" = now()
      WHERE ${whereClause}
    `;

    await db.execute(updateSql);
    updated++;
  }

  return updated;
}
