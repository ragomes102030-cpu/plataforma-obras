import { Client } from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const url = new URL(process.env.DATABASE_URL);
if (["disable", "disabled"].includes((url.searchParams.get("sslmode") ?? "").toLowerCase())) throw new Error("TLS necessário");
url.searchParams.delete("sslmode");
url.searchParams.delete("ssl-mode");
const client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: true, ...(process.env.SUPABASE_DB_CA_PEM ? { ca: process.env.SUPABASE_DB_CA_PEM } : {}) } });
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entry = journal.entries.find(item => item.tag === "0027_sicro_catalog");
const previous = journal.entries.find(item => item.tag === "0026_physical_weight_evidence");
const ddl = readFileSync("drizzle/0027_sicro_catalog.sql", "utf8");
const hash = createHash("sha256").update(ddl).digest("hex");
try {
  await client.connect();
  const pre = await client.query('SELECT created_at, hash FROM "__drizzle_migrations" ORDER BY created_at');
  const recorded = new Set(pre.rows.map(row => Number(row.created_at)));
  if (journal.entries.some(item => item.idx < entry.idx && !recorded.has(item.when))) throw new Error("Há migração anterior pendente.");
  if (pre.rows.some(row => Number(row.created_at) > entry.when)) throw new Error("O banco possui migração posterior.");
  const types = await client.query("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname=$1", ["price_catalogs_sourceType"]);
  if (!types.rows.some(row => row.enumlabel === "SEINFRA")) throw new Error("Tipo esperado não encontrado.");
  if (recorded.has(entry.when)) {
    if (!types.rows.some(row => row.enumlabel === "SICRO")) throw new Error("Journal e tipo divergem.");
    console.log("Migração SICRO já estava aplicada.");
  } else {
    if (Math.max(...recorded) !== previous.when) throw new Error("A última migração do banco não é a esperada.");
    await client.query("BEGIN");
    await client.query(ddl);
    await client.query('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)', [hash, entry.when]);
    await client.query("COMMIT");
    console.log("Migração SICRO aplicada.");
  }
  const check = await client.query("SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=current_schema() AND t.typname=$1 AND e.enumlabel=$2", ["price_catalogs_sourceType", "SICRO"]);
  if (check.rowCount !== 1) throw new Error("Rótulo não encontrado após migração.");
  console.log("Enum e journal conferidos.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migração interrompida:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
