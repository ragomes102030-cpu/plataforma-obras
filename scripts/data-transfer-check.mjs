import { Client } from "pg";

const run = process.env.RUN_TRANSFER === "1";
if (!run) process.exit(0);

const src = process.env.DATABASE_URL;
const dstCandidates = [
  ["SUPABASE_DB_URL", process.env.SUPABASE_DB_URL],
  ["SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL],
  ["DATABASE_URL_SUPABASE", process.env.DATABASE_URL_SUPABASE],
  ["SUPA_DB_URL", process.env.SUPA_DB_URL],
  ["SUPA_BASE_URL", process.env.SUPA_BASE_URL],
];
const [dstName, dst] = dstCandidates.find(([, value]) => value && /^postgres(?:ql)?:\/\//i.test(value)) || [];
if (!src || !dst) {
  throw new Error("[transfer] native migration requires DATABASE_URL and a PostgreSQL Supabase connection variable");
}

function cfg(raw, { pooler = false } = {}) {
  const u = new URL(raw);
  // Supabase direct database host can be IPv6-only from some Render runtimes.
  // When the supplied URL targets this project directly, use the IPv4 Session
  // Pooler without changing the password. The pooler user is project-scoped.
  if (pooler && u.hostname === "db.tromrvfijbtihuilvnuk.supabase.co") {
    u.hostname = "aws-0-sa-east-1.pooler.supabase.com";
    u.port = "5432";
    if (u.username === "postgres") u.username = "postgres.tromrvfijbtihuilvnuk";
  }
  const mode = (u.searchParams.get("sslmode") || "").toLowerCase();
  u.searchParams.delete("sslmode");
  u.searchParams.delete("ssl-mode");
  return { connectionString: u.toString(), ...(mode !== "disable" ? { ssl: { rejectUnauthorized: false } } : {}) };
}
const ingestUrl = process.env.SUPABASE_INGEST_URL;
const ingestKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const useHttp = Boolean(ingestUrl && ingestKey);
const source = new Client(cfg(src));
const target = useHttp ? null : new Client(cfg(dst, { pooler: true }));
await source.connect();
console.log("[transfer] source preflight: connected");
if (useHttp) {
  console.log("[transfer] destination: HTTPS migration bridge");
  const probe = await fetch(ingestUrl, {
    method:"POST",
    headers:{"apikey":ingestKey,"Authorization":`Bearer ${ingestKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({op:"insert",table:"users",rows:[]})
  });
  if (!probe.ok) throw new Error("[transfer] HTTPS bridge preflight failed: HTTP " + probe.status);
  console.log("[transfer] HTTPS bridge preflight: connected");
} else {
  try {
    await target.connect();
    await target.query("SELECT 1");
    console.log("[transfer] target preflight: connected");
  } catch (error) {
    console.error("[transfer] target preflight failed: " + (error?.message ?? String(error)));
    console.error("[transfer] no target data was changed");
    await source.end();
    throw new Error("[transfer] Supabase destination is unreachable; migration aborted before TRUNCATE");
  }
}

const q = (c, sql, params) => c.query(sql, params);
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';

// Explicit Arquimedes allowlist. Never introspect Supabase's public schema wholesale:
// Supabase owns additional public tables (auth/storage/analytics metadata) that are not app tables.
const APP_TABLES = [
  "activity_resource_allocations","agent_decisions","agent_findings","agent_memories","agent_project_states",
  "agent_run_events","agent_runs","arquimedes_capabilities","arquimedes_capability_events","budget_items",
  "budget_versions","calendar_exceptions","composition_components","llm_provider_settings","mcp_homologation_runs",
  "mcp_mutation_operations","planning_resources","price_catalogs","price_items","production_entries","production_fronts",
  "production_teams","production_units","project_audit_events","project_documents","project_mcp_integrations",
  "project_plan_versions","projects","schedule_activities","schedule_baseline_items","schedule_baselines",
  "schedule_dependencies","service_compositions","users","wbs_nodes","work_calendars"
];

const missing = (await q(source, `
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name = ANY($1::text[])
`, [APP_TABLES])).rows.map(r => r.table_name);
if (missing.length !== APP_TABLES.length) {
  const present = new Set(missing);
  throw new Error("[transfer] source schema mismatch; missing Arquimedes tables: " + APP_TABLES.filter(t => !present.has(t)).join(", "));
}

const fkResult = await q(source, `
  SELECT tc.table_name AS child_table, kcu.column_name AS child_column,
         ccu.table_name AS parent_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
`);
const allowed = new Set(APP_TABLES);
const deps = new Map(APP_TABLES.map(t => [t, new Set()]));
const selfFk = new Map(APP_TABLES.map(t => [t, []]));
for (const fk of fkResult.rows) {
  if (!allowed.has(fk.child_table) || !allowed.has(fk.parent_table)) continue;
  if (fk.child_table === fk.parent_table) selfFk.get(fk.child_table).push(fk.child_column);
  else deps.get(fk.child_table).add(fk.parent_table);
}
const order = [];
const pending = new Set(APP_TABLES);
while (pending.size) {
  const ready = [...pending].filter(t => [...deps.get(t)].every(p => !pending.has(p)));
  if (!ready.length) throw new Error("[transfer] foreign-key cycle detected: " + [...pending].join(", "));
  for (const t of ready) { order.push(t); pending.delete(t); }
}

console.log("[transfer] native PostgreSQL migration");
console.log("[transfer] destination: " + (useHttp ? "HTTPS bridge" : dstName + " (IPv4 Session Pooler fallback enabled)"));
console.log("[transfer] Arquimedes tables: " + APP_TABLES.length);
console.log("[transfer] order: " + order.join(", "));

try {
  if (!useHttp) await target.query("BEGIN");

  let total = 0;
  const deferredSelf = [];
  for (const table of order) {
    const columns = (await q(source, `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position
    `, [table])).rows.map(r => r.column_name);
    const rows = (await q(source, "SELECT * FROM public." + quote(table))).rows;
    if (!rows.length) { console.log("[transfer] " + table + ": 0"); continue; }

    const selfColumns = new Set(selfFk.get(table));
    const placeholders = [];
    const params = [];
    let p = 1;
    for (const row of rows) {
      const vals = columns.map(column => {
        const value = row[column];
        if (selfColumns.has(column) && value !== null) {
          if (!deferredSelf.some(x => x.table === table)) deferredSelf.push({ table, rows });
          return null;
        }
        return value;
      });
      placeholders.push("(" + vals.map(() => "$" + p++).join(", ") + ")");
      params.push(...vals);
    }
    if (useHttp) {
      const plainRows = rows.map(row => {
        const out = {};
        for (const column of columns) out[column] = selfColumns.has(column) ? null : row[column];
        return out;
      });
      for (let i = 0; i < plainRows.length; i += 200) {
        const response = await fetch(ingestUrl, {
          method:"POST",
          headers:{"apikey":ingestKey,"Authorization":`Bearer ${ingestKey}`,"Content-Type":"application/json"},
          body:JSON.stringify({op:"insert",table,rows:plainRows.slice(i,i+200)})
        });
        if (!response.ok) throw new Error("[transfer] HTTPS insert failed for " + table + ": HTTP " + response.status + " " + await response.text());
      }
    } else {
      await target.query(
        "INSERT INTO public." + quote(table) + " (" + columns.map(quote).join(", ") + ") VALUES " + placeholders.join(", "),
        params
      );
    }
    total += rows.length;
    console.log("[transfer] " + table + ": " + rows.length);
  }

  for (const item of deferredSelf) {
    const pk = (await q(source, `
      SELECT kcu.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
      WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `, [item.table])).rows.map(r => r.column_name);
    if (pk.length !== 1) throw new Error("[transfer] self-reference requires single-column PK: " + item.table);
    for (const row of item.rows) {
      for (const column of new Set(selfFk.get(item.table))) {
        if (row[column] !== null) {
          if (useHttp) {
            const response = await fetch(ingestUrl, {
              method:"POST",
              headers:{"apikey":ingestKey,"Authorization":`Bearer ${ingestKey}`,"Content-Type":"application/json"},
              body:JSON.stringify({op:"update",table:item.table,pk:pk[0],column,pkValue:row[pk[0]],value:row[column]})
            });
            if (!response.ok) throw new Error("[transfer] HTTPS self-reference update failed for " + item.table + ": HTTP " + response.status + " " + await response.text());
          } else {
            await target.query("UPDATE public." + quote(item.table) + " SET " + quote(column) + "=$1 WHERE " + quote(pk[0]) + "=$2", [row[column], row[pk[0]]]);
          }
        }
      }
    }
  }

  if (!useHttp) {
    await target.query("COMMIT");
    await target.query("ANALYZE");
    await target.end();
  }
  await source.end();
  console.log("[transfer] COMPLETE total=" + total);
} catch (error) {
  if (!useHttp && target) {
    await target.query("ROLLBACK");
    await target.end();
  }
  await source.end();
  throw error;
}
