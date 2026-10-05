#!/usr/bin/env node
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate-pg] ERRO: DATABASE_URL ausente.");
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
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS table_count,
      (SELECT COUNT(*)::int FROM public.users) AS users_count,
      (SELECT COUNT(*)::int FROM public.projects) AS projects_count
  `);
  const row = result.rows[0];
  console.log(`[migrate-pg] OK: public schema reachable; tables=${row.table_count}; users=${row.users_count}; projects=${row.projects_count}`);
} catch (error) {
  console.error("[migrate-pg] ERRO: PostgreSQL schema check failed:", error);
  process.exit(1);
} finally {
  await pool.end();
}
