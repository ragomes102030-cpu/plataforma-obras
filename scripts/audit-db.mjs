// Auditoria de integridade do banco Aiven (MySQL).
// Uso: $env:DATABASE_URL="..." ; node scripts/audit-db.mjs
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

async function q(conn, sqlText, params) {
  const [rows] = await conn.execute(sqlText, params ?? []);
  return rows;
}

async function count(conn, table) {
  try {
    const rows = await q(conn, `SELECT COUNT(*) AS c FROM \`${table}\``);
    return rows[0].c;
  } catch {
    return "ERRO";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nao definida");
  const conn = await createConnection({ ...normalize(url), connectTimeout: 15000 });
  console.log("== AUDITORIA AIVEN ==");

  // 1. Tabelas + contagens
  console.log("\n[1] TABELAS E CONTAGENS");
  const tables = await q(
    conn,
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
  );
  for (const t of tables) {
    console.log(`  ${t.TABLE_NAME}: ${await count(conn, t.TABLE_NAME)}`);
  }

  // 2. Tabelas sem PK / sem engine InnoDB
  console.log("\n[2] TABELAS FORA DO PADRAO (engine/pk)");
  const engines = await q(
    conn,
    `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND ENGINE != 'InnoDB'`
  );
  for (const e of engines) console.log(`  ! ${e.TABLE_NAME}: engine=${e.ENGINE}`);
  if (engines.length === 0) console.log("  OK: todas InnoDB");

  // 3. Órfãos por domínio (FKs que violam)
  console.log("\n[3] ORFAOS (violacoes de FK)");
  const checks = [
    ["projects.ownerUserId -> users", "SELECT COUNT(*) c FROM projects p LEFT JOIN users u ON u.id = p.ownerUserId WHERE p.ownerUserId IS NOT NULL AND u.id IS NULL"],
    ["schedule_activities.projectId -> projects", "SELECT COUNT(*) c FROM schedule_activities s LEFT JOIN projects p ON p.id = s.projectId WHERE s.projectId IS NOT NULL AND p.id IS NULL"],
    ["wbs_nodes.projectId -> projects", "SELECT COUNT(*) c FROM wbs_nodes w LEFT JOIN projects p ON p.id = w.projectId WHERE w.projectId IS NOT NULL AND p.id IS NULL"],
    ["schedule_dependencies.projectId -> projects", "SELECT COUNT(*) c FROM schedule_dependencies d LEFT JOIN projects p ON p.id = d.projectId WHERE d.projectId IS NOT NULL AND p.id IS NULL"],
    ["schedule_dependencies.predecessorId -> schedule_activities", "SELECT COUNT(*) c FROM schedule_dependencies d LEFT JOIN schedule_activities a ON a.id = d.predecessorId WHERE d.predecessorId IS NOT NULL AND a.id IS NULL"],
    ["schedule_dependencies.successorId -> schedule_activities", "SELECT COUNT(*) c FROM schedule_dependencies d LEFT JOIN schedule_activities a ON a.id = d.successorId WHERE d.successorId IS NOT NULL AND a.id IS NULL"],
    ["budget_items.projectId -> projects", "SELECT COUNT(*) c FROM budget_items b LEFT JOIN projects p ON p.id = b.projectId WHERE b.projectId IS NOT NULL AND p.id IS NULL"],
    ["production_entries.projectId -> projects", "SELECT COUNT(*) c FROM production_entries pe LEFT JOIN projects p ON p.id = pe.projectId WHERE pe.projectId IS NOT NULL AND p.id IS NULL"],
    ["production_entries.wbsNodeId -> wbs_nodes", "SELECT COUNT(*) c FROM production_entries pe LEFT JOIN wbs_nodes w ON w.id = pe.wbsNodeId WHERE pe.wbsNodeId IS NOT NULL AND w.id IS NULL"],
    ["agent_memories.projectId -> projects", "SELECT COUNT(*) c FROM agent_memories am LEFT JOIN projects p ON p.id = am.projectId WHERE am.projectId IS NOT NULL AND p.id IS NULL"],
    ["agent_project_states.projectId -> projects", "SELECT COUNT(*) c FROM agent_project_states s LEFT JOIN projects p ON p.id = s.projectId WHERE s.projectId IS NOT NULL AND p.id IS NULL"],
  ];
  for (const [label, sql] of checks) {
    try {
      const rows = await q(conn, sql);
      console.log(`  ${rows[0].c === 0 ? "OK " : "!!"} ${label}: ${rows[0].c} orphans`);
    } catch (err) {
      console.log(`  ?? ${label}: query falhou (coluna pode nao existir) - ${err.message.split("\n")[0]}`);
    }
  }

  // 4. Schedule: atividades órfãs de projeto (sem projeto)
  console.log("\n[4] ACTIVITIES SEM PROJECT (nao-fk, verificacao de dados)");
  try {
    const orphanActs = await q(
      conn,
      "SELECT COUNT(*) c FROM schedule_activities WHERE projectId IS NULL OR projectId = 0"
    );
    console.log(`  activities com projectId NULL/0: ${orphanActs[0].c}`);
  } catch (err) {
    console.log(`  ?? ${err.message.split("\n")[0]}`);
  }

  // 5. wbs: nós com projectId inconsistente
  try {
    const wbsNoProj = await q(
      conn,
      "SELECT COUNT(*) c FROM wbs_nodes WHERE projectId IS NULL OR projectId = 0"
    );
    console.log(`  wbs_nodes com projectId NULL/0: ${wbsNoProj[0].c}`);
  } catch (err) {
    console.log(`  ?? ${err.message.split("\n")[0]}`);
  }

  // 6. Duplicados potencialmente problemáticos
  console.log("\n[5] DUPLICATAS (wbs por projeto/codigo)");
  try {
    const dups = await q(
      conn,
      `SELECT projectId, eapRef, COUNT(*) c FROM wbs_nodes
       WHERE eapRef IS NOT NULL GROUP BY projectId, eapRef HAVING c > 1 LIMIT 10`
    );
    if (dups.length === 0) console.log("  OK: sem duplicatas eapRef em wbs_nodes");
    else for (const d of dups) console.log(`  !! projectId=${d.projectId} eapRef=${d.eapRef} x${d.c}`);
  } catch (err) {
    console.log(`  ?? ${err.message.split("\n")[0]}`);
  }

  // 7. Cobertura de dados reais por domínio
  console.log("\n[6] RESUMO POR DOMINIO");
  const domains = [
    "projects", "users",
    "budget_versions", "budget_items", "price_catalogs", "price_items",
    "service_compositions", "composition_components",
    "production_fronts", "production_teams", "production_units", "production_entries",
    "schedule_baselines", "schedule_baseline_items",
    "agent_runs", "agent_decisions", "agent_memories", "agent_run_events",
    "mcp_homologation_runs", "mcp_mutation_operations", "project_mcp_integrations",
    "llm_provider_settings", "planning_resources",
    "activity_resource_allocations", "project_audit_events",
  ];
  for (const t of domains) {
    const c = await count(conn, t);
    if (c !== 0 && c !== "ERRO") console.log(`  ${t}: ${c}`);
  }

  await conn.end();
  console.log("\n== FIM DA AUDITORIA ==");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});