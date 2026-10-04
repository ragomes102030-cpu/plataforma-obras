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
  throw new Error("[transfer] native migration requires DATABASE_URL and a PostgreSQL Supabase connection variable (SUPABASE_DB_URL/SUPABASE_DATABASE_URL/DATABASE_URL_SUPABASE/SUPA_DB_URL/SUPA_BASE_URL)");
}

function cfg(raw) {
  const u = new URL(raw);
  const mode = (u.searchParams.get("sslmode") || "").toLowerCase();
  u.searchParams.delete("sslmode");
  u.searchParams.delete("ssl-mode");
  return {
    connectionString: u.toString(),
    ...(mode !== "disable" ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

const source = new Client(cfg(src));
const target = new Client(cfg(dst));
await source.connect();
await target.connect();

const q = (c, sql, params) => c.query(sql, params);
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';

const tablesResult = await q(source, `
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name <> '__drizzle_migrations'
  ORDER BY table_name
`);
const tables = tablesResult.rows.map((r) => r.table_name);

const fkResult = await q(source, `
  SELECT tc.table_name AS child_table, kcu.column_name AS child_column,
         ccu.table_name AS parent_table, ccu.column_name AS parent_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
`);

const deps = new Map(tables.map((t) => [t, new Set()]));
const selfFk = new Map(tables.map((t) => [t, []]));
for (const fk of fkResult.rows) {
  if (!deps.has(fk.child_table) || !deps.has(fk.parent_table)) continue;
  if (fk.child_table === fk.parent_table) {
    selfFk.get(fk.child_table).push(fk.child_column);
  } else {
    deps.get(fk.child_table).add(fk.parent_table);
  }
}

const order = [];
const pending = new Set(tables);
while (pending.size) {
  const ready = [...pending].filter((t) => [...deps.get(t)].every((p) => !pending.has(p)));
  if (!ready.length) throw new Error("[transfer] foreign-key cycle detected: " + [...pending].join(", "));
  for (const t of ready) {
    order.push(t);
    pending.delete(t);
  }
}

console.log("[transfer] native PostgreSQL migration");
console.log("[transfer] destination variable: " + dstName);
console.log("[transfer] tables: " + tables.length);
console.log("[transfer] order: " + order.join(", "));

await target.query("BEGIN");
try {
  if (tables.length) {
    await target.query("TRUNCATE " + tables.map((t) => "public." + quote(t)).join(", ") + " CASCADE");
  }

  let total = 0;
  const deferredSelf = [];

  for (const table of order) {
    const columnsResult = await q(source, `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    const columns = columnsResult.rows.map((r) => r.column_name);
    const rows = (await q(source, "SELECT * FROM public." + quote(table))).rows;

    if (!rows.length) {
      console.log("[transfer] " + table + ": 0");
      continue;
    }

    const selfColumns = new Set(selfFk.get(table));
    const insertColumns = columns;
    const placeholders = [];
    const params = [];
    let p = 1;

    for (const row of rows) {
      const vals = columns.map((column) => {
        const original = row[column];
        if (selfColumns.has(column) && original !== null) {
          if (!deferredSelf.find((x) => x.table === table)) deferredSelf.push({ table, rows });
          return null;
        }
        return original;
      });
      const rowPlaceholders = vals.map(() => "$" + p++);
      placeholders.push("(" + rowPlaceholders.join(", ") + ")");
      params.push(...vals);
    }

    await target.query(
      "INSERT INTO public." + quote(table) + " (" + insertColumns.map(quote).join(", ") + ") VALUES " + placeholders.join(", "),
      params
    );

    total += rows.length;
    console.log("[transfer] " + table + ": " + rows.length);
  }

  for (const item of deferredSelf) {
    const selfColumns = new Set(selfFk.get(item.table));
    const pkResult = await q(source, `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `, [item.table]);
    const pk = pkResult.rows.map((r) => r.column_name);
    if (pk.length !== 1) throw new Error("[transfer] self-reference requires single-column PK: " + item.table);

    for (const row of item.rows) {
      const originalPk = row[pk[0]];
      for (const column of selfColumns) {
        if (row[column] === null) continue;
        await target.query(
          "UPDATE public." + quote(item.table) + " SET " + quote(column) + " = $1 WHERE " + quote(pk[0]) + " = $2",
          [row[column], originalPk]
        );
      }
    }
  }

  await target.query("COMMIT");
  await target.query("ANALYZE");
  await source.end();
  await target.end();
  console.log("[transfer] COMPLETE total=" + total);
} catch (error) {
  await target.query("ROLLBACK");
  await source.end();
  await target.end();
  throw error;
}
