import { and, asc, isNotNull, lte, sql } from "drizzle-orm";
import { projects } from "../drizzle/schema";
import { getDb } from "./db";

const RETENTION_DAYS = 30;
const BATCH_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Remove apenas dados pertencentes a uma obra já expirada. Tabelas globais
 * do usuário (catálogos, composições e configurações de LLM) são preservadas.
 */
async function purgeProject(tx: Transaction, projectId: number, cutoff: Date) {
  await tx.execute(sql`DELETE FROM "project_documents" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "project_mcp_integrations" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "mcp_mutation_operations" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "mcp_homologation_runs" WHERE "projectId" = ${projectId}`);

  await tx.execute(sql`DELETE FROM "production_entries" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "lob_activity_locations" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`
    DELETE FROM "schedule_baseline_items"
    WHERE "baselineId" IN (SELECT "id" FROM "schedule_baselines" WHERE "projectId" = ${projectId})
       OR "activityId" IN (SELECT "id" FROM "schedule_activities" WHERE "projectId" = ${projectId})
  `);
  await tx.execute(sql`DELETE FROM "schedule_dependencies" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`
    DELETE FROM "activity_resource_allocations"
    WHERE "activityId" IN (SELECT "id" FROM "schedule_activities" WHERE "projectId" = ${projectId})
       OR "resourceId" IN (SELECT "id" FROM "planning_resources" WHERE "projectId" = ${projectId})
  `);
  await tx.execute(sql`
    DELETE FROM "budget_items"
    WHERE "budgetVersionId" IN (SELECT "id" FROM "budget_versions" WHERE "projectId" = ${projectId})
       OR "wbsNodeId" IN (SELECT "id" FROM "wbs_nodes" WHERE "projectId" = ${projectId})
  `);
  await tx.execute(sql`DELETE FROM "budget_versions" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "schedule_baselines" WHERE "projectId" = ${projectId}`);

  await tx.execute(sql`
    DELETE FROM "calendar_exceptions"
    WHERE "calendarId" IN (SELECT "id" FROM "work_calendars" WHERE "projectId" = ${projectId})
  `);
  await tx.execute(sql`DELETE FROM "work_calendars" WHERE "projectId" = ${projectId}`);

  await tx.execute(sql`DELETE FROM "agent_run_events" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "agent_runs" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "project_audit_events" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "agent_findings" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "agent_memories" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "agent_project_states" WHERE "projectId" = ${projectId}`);

  // schedule_activities aponta para wbs_nodes com ON DELETE RESTRICT.
  await tx.execute(sql`DELETE FROM "schedule_activities" WHERE "projectId" = ${projectId}`);
  // wbs_nodes também é autorreferente com RESTRICT: solta a árvore inteira.
  await tx.execute(sql`UPDATE "wbs_nodes" SET "parentId" = NULL WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "wbs_nodes" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "planning_resources" WHERE "projectId" = ${projectId}`);

  // As versões têm baseVersionId autorreferente e decisionId para agent_decisions.
  await tx.execute(sql`UPDATE "project_plan_versions" SET "baseVersionId" = NULL WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "project_plan_versions" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "agent_decisions" WHERE "projectId" = ${projectId}`);

  await tx.execute(sql`DELETE FROM "production_fronts" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "production_teams" WHERE "projectId" = ${projectId}`);
  await tx.execute(sql`DELETE FROM "production_units" WHERE "projectId" = ${projectId}`);

  // Defesa final: só apaga se ainda estiver na lixeira e o prazo venceu.
  await tx.execute(sql`
    DELETE FROM "projects"
    WHERE "id" = ${projectId}
      AND "deletedAt" IS NOT NULL
      AND "deletedAt" <= ${cutoff}
  `);
}

/** Remove em lotes as obras cuja retenção de 30 dias venceu. */
export async function purgeExpiredTrashedProjects(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[trash-retention] banco indisponível; purga ignorada");
    return 0;
  }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  let total = 0;

  for (;;) {
    const batch = await db.transaction(async tx => {
      const expired = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(isNotNull(projects.deletedAt), lte(projects.deletedAt, cutoff)))
        .orderBy(asc(projects.deletedAt), asc(projects.id))
        .limit(BATCH_SIZE)
        .for("update", { skipLocked: true });

      for (const row of expired) {
        await purgeProject(tx, row.id, cutoff);
      }
      return expired.length;
    });

    total += batch;
    if (batch < BATCH_SIZE) break;
  }

  return total;
}

/** Executa na inicialização e diariamente no serviço de produção. */
export function startTrashRetentionJob() {
  if (process.env.NODE_ENV !== "production") return;

  const run = async () => {
    try {
      const removed = await purgeExpiredTrashedProjects();
      if (removed > 0) {
        console.info(`[trash-retention] exclusão permanente concluída: ${removed} obra(s) com retenção vencida`);
      }
    } catch (error) {
      // Qualquer falha reverte a transação do lote; a próxima execução tenta de novo.
      console.error("[trash-retention] falha; a transação foi revertida:", error);
    }
  };

  void run();
  const timer = setInterval(() => void run(), DAY_MS);
  timer.unref?.();
}
