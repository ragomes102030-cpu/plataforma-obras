// Re-auditoria pontual das FKs que falharam/deram falso positivo.
import { createConnection } from "mysql2/promise";

function normalize(databaseUrl) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("ssl-mode")?.toLowerCase();
  url.searchParams.delete("ssl-mode");
  return {
    uri: url.toString(),
    ...(sslMode && sslMode !== "disabled" ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

async function q(conn, sqlText) {
  const [rows] = await conn.execute(sqlText);
  return rows;
}

async function main() {
  const conn = await createConnection({ ...normalize(process.env.DATABASE_URL), connectTimeout: 15000 });
  console.log("== RE-AUDITORIA PONTUAL ==");

  const checks = [
    ["production_entries.unitId -> production_units", "SELECT COUNT(*) c FROM production_entries pe LEFT JOIN production_units u ON u.id = pe.unitId WHERE pe.unitId IS NOT NULL AND u.id IS NULL"],
    ["production_entries.frontId -> production_fronts", "SELECT COUNT(*) c FROM production_entries pe LEFT JOIN production_fronts f ON f.id = pe.frontId WHERE pe.frontId IS NOT NULL AND f.id IS NULL"],
    ["production_entries.teamId -> production_teams", "SELECT COUNT(*) c FROM production_entries pe LEFT JOIN production_teams t ON t.id = pe.teamId WHERE pe.teamId IS NOT NULL AND t.id IS NULL"],
    ["production_entries.activityId -> schedule_activities", "SELECT COUNT(*) c FROM production_entries pe LEFT JOIN schedule_activities a ON a.id = pe.activityId WHERE pe.activityId IS NOT NULL AND a.id IS NULL"],
    ["budget_items.budgetVersionId -> budget_versions", "SELECT COUNT(*) c FROM budget_items b LEFT JOIN budget_versions v ON v.id = b.budgetVersionId WHERE b.budgetVersionId IS NOT NULL AND v.id IS NULL"],
    ["budget_items.wbsNodeId -> wbs_nodes", "SELECT COUNT(*) c FROM budget_items b LEFT JOIN wbs_nodes w ON w.id = b.wbsNodeId WHERE b.wbsNodeId IS NOT NULL AND w.id IS NULL"],
    ["budget_versions.projectId -> projects", "SELECT COUNT(*) c FROM budget_versions v LEFT JOIN projects p ON p.id = v.projectId WHERE v.projectId IS NOT NULL AND p.id IS NULL"],
    ["budget_items.priceException com coluna ausente?", "SELECT COUNT(*) c FROM budget_items WHERE isPriceException IS NOT NULL"],
    ["schedule_baselines.projectId -> projects", "SELECT COUNT(*) c FROM schedule_baselines b LEFT JOIN projects p ON p.id = b.projectId WHERE b.projectId IS NOT NULL AND p.id IS NULL"],
    ["schedule_baseline_items.baselineId -> schedule_baselines", "SELECT COUNT(*) c FROM schedule_baseline_items bi LEFT JOIN schedule_baselines b ON b.id = bi.baselineId WHERE bi.baselineId IS NOT NULL AND b.id IS NULL"],
    ["activity_resource_allocations.activityId -> schedule_activities", "SELECT COUNT(*) c FROM activity_resource_allocations ra LEFT JOIN schedule_activities a ON a.id = ra.activityId WHERE ra.activityId IS NOT NULL AND a.id IS NULL"],
    ["activity_resource_allocations.resourceId -> planning_resources", "SELECT COUNT(*) c FROM activity_resource_allocations ra LEFT JOIN planning_resources r ON r.id = ra.resourceId WHERE ra.resourceId IS NOT NULL AND r.id IS NULL"],
    ["agent_runs.projectId -> projects", "SELECT COUNT(*) c FROM agent_runs r LEFT JOIN projects p ON p.id = r.projectId WHERE r.projectId IS NOT NULL AND p.id IS NULL"],
    ["agent_decisions.projectId -> projects", "SELECT COUNT(*) c FROM agent_decisions d LEFT JOIN projects p ON p.id = d.projectId WHERE d.projectId IS NOT NULL AND p.id IS NULL"],
    ["agent_findings.runId -> agent_runs", "SELECT COUNT(*) c FROM agent_findings f LEFT JOIN agent_runs r ON r.id = f.runId WHERE f.runId IS NOT NULL AND r.id IS NULL"],
    ["project_audit_events.projectId -> projects", "SELECT COUNT(*) c FROM project_audit_events e LEFT JOIN projects p ON p.id = e.projectId WHERE e.projectId IS NOT NULL AND p.id IS NULL"],
    ["price_items.catalogId -> price_catalogs", "SELECT COUNT(*) c FROM price_items pi LEFT JOIN price_catalogs c ON c.id = pi.catalogId WHERE pi.catalogId IS NOT NULL AND c.id IS NULL"],
    ["service_compositions -> projects (auto)", "SELECT COUNT(*) c FROM service_compositions sc LEFT JOIN projects p ON p.id = sc.projectId"],
    ["composition_components.compositionId -> service_compositions", "SELECT COUNT(*) c FROM composition_components cc LEFT JOIN service_compositions sc ON sc.id = cc.compositionId WHERE cc.compositionId IS NOT NULL AND sc.id IS NULL"],
  ];

  for (const [label, sql] of checks) {
    try {
      const rows = await q(conn, sql);
      console.log(`  ${rows[0].c === 0 ? "OK " : "!!"} ${label}: ${rows[0].c}`);
    } catch (err) {
      console.log(`  ?? ${label}: ${err.message.split("\n")[0]}`);
    }
  }

  // Progress por projeto
  console.log("\n== PROJETOS (progress) ==");
  try {
    const projs = await q(conn, "SELECT id, code, name, status, progress, plannedStart, plannedFinish FROM projects ORDER BY id");
    for (const p of projs) console.log(`  #${p.id} [${p.code}] ${p.name} | status=${p.status} progress=${p.progress}% | ${p.plannedStart} -> ${p.plannedFinish}`);
  } catch (err) {
    console.log("  ?? " + err.message.split("\n")[0]);
  }

  // Schedules por projeto
  console.log("\n== SCHEDULE POR PROJETO ==");
  try {
    const rows = await q(conn, `SELECT s.projectId, p.code, COUNT(DISTINCT s.id) acts, COUNT(DISTINCT d.id) deps
      FROM schedule_activities s LEFT JOIN projects p ON p.id = s.projectId
      LEFT JOIN schedule_dependencies d ON d.projectId = s.projectId
      GROUP BY s.projectId, p.code ORDER BY s.projectId`);
    for (const r of rows) console.log(`  #${r.projectId} [${r.code}] activities=${r.acts} deps=${r.deps}`);
  } catch (err) {
    console.log("  ?? " + err.message.split("\n")[0]);
  }

  await conn.end();
  console.log("\n== FIM ==");
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });