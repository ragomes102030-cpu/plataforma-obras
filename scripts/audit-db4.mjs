// Ultima verificacao pontual: agent_findings e service_compositions columns.
import { createConnection } from "mysql2/promise";

function normalize(databaseUrl) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("ssl-mode")?.toLowerCase();
  url.searchParams.delete("ssl-mode");
  return { uri: url.toString(), ...(sslMode && sslMode !== "disabled" ? { ssl: { rejectUnauthorized: false } } : {}) };
}
async function q(conn, sqlText) { const [rows] = await conn.execute(sqlText); return rows; }

async function main() {
  const conn = await createConnection({ ...normalize(process.env.DATABASE_URL), connectTimeout: 15000 });
  for (const t of ["agent_findings", "service_compositions", "schedule_baselines", "planning_resources", "llm_provider_settings"]) {
    const cols = await q(conn, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}' ORDER BY ORDINAL_POSITION`);
    console.log(`[${t}] ${cols.map(c => c.COLUMN_NAME).join(", ")}`);
  }
  // agent_findings: descobrir coluna de link
  const afCols = (await q(conn, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_findings'`)).map(c => c.COLUMN_NAME);
  const runCol = afCols.find(c => /run/i.test(c));
  if (runCol) {
    const r = await q(conn, `SELECT COUNT(*) c FROM agent_findings f LEFT JOIN agent_runs r ON r.id = f.\`${runCol}\` WHERE f.\`${runCol}\` IS NOT NULL AND r.id IS NULL`);
    console.log(`agent_findings.${runCol} -> agent_runs: ${r[0].c} orphans`);
  }
  const scCols = (await q(conn, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_compositions'`)).map(c => c.COLUMN_NAME);
  const projCol = scCols.find(c => /project/i.test(c));
  if (projCol) {
    const r = await q(conn, `SELECT COUNT(*) c FROM service_compositions sc LEFT JOIN projects p ON p.id = sc.\`${projCol}\` WHERE sc.\`${projCol}\` IS NOT NULL AND p.id IS NULL`);
    console.log(`service_compositions.${projCol} -> projects: ${r[0].c} orphans`);
  }
  // agent_findings e agent_decisions content
  const findings = await q(conn, "SELECT * FROM agent_findings LIMIT 3");
  for (const f of findings) console.log("FINDING:", JSON.stringify(f).slice(0, 300));
  await conn.end();
}
main().catch(e => { console.error("Fatal:", e); process.exit(1); });