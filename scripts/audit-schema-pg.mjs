#!/usr/bin/env node
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[audit-pg] ERRO: DATABASE_URL ausente.");
  process.exit(1);
}

const u = new URL(url);
const sslMode = (u.searchParams.get("sslmode") ?? u.searchParams.get("ssl-mode") ?? "").toLowerCase();
u.searchParams.delete("sslmode");
u.searchParams.delete("ssl-mode");

const pool = new Pool({
  connectionString: u.toString(),
  ...(sslMode === "disable" ? {} : { ssl: { rejectUnauthorized: false } }),
  connectionTimeoutMillis: 10000,
});

try {
  const required = ["users", "projects", "wbs_nodes", "schedule_activities", "schedule_dependencies"];
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [required]);
  const found = new Set(result.rows.map(r => r.table_name));
  const missing = required.filter(name => !found.has(name));
  if (missing.length) {
    console.error(`[audit-pg] ERRO: tabelas obrigatorias ausentes: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`[audit-pg] OK: tabelas obrigatorias presentes: ${required.join(", ")}`);
} catch (error) {
  console.error("[audit-pg] ERRO:", error);
  process.exit(1);
} finally {
  await pool.end();
}
