import pg from "pg";

const { Client } = pg;

const projectId = Number(process.env.AURORA_PROJECT_ID || 7);
const versionId = Number(process.env.AURORA_VERSION_ID || 5);
const databaseUrl =
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("A database connection is required (SUPABASE_DB_URL or DATABASE_URL).");
}

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

const checks = [
  ["version exists and is approved", `SELECT count(*)::int AS n FROM project_plan_versions WHERE id=$1 AND "projectId"=$2 AND status='approved'`, [versionId, projectId]],
  ["69 nodes", `SELECT count(*)::int AS n FROM wbs_nodes WHERE "versionId"=$1`, [versionId]],
  ["53 package leaves", `SELECT count(*)::int AS n FROM wbs_nodes n WHERE "versionId"=$1 AND "nodeType"='pacote' AND NOT EXISTS (SELECT 1 FROM wbs_nodes c WHERE c."parentId"=n.id AND c."versionId"=$1)`, [versionId]],
  ["15 level-2 groups", `SELECT count(*)::int AS n FROM wbs_nodes WHERE "versionId"=$1 AND level=2 AND "nodeType"<>'pacote'`, [versionId]],
  ["exactly one root", `SELECT count(*)::int AS n FROM wbs_nodes WHERE "versionId"=$1 AND "parentId" IS NULL`, [versionId]],
  ["no orphan nodes", `SELECT count(*)::int AS n FROM wbs_nodes n LEFT JOIN wbs_nodes p ON p.id=n."parentId" WHERE n."versionId"=$1 AND n."parentId" IS NOT NULL AND (p.id IS NULL OR p."versionId"<>$1)`, [versionId]],
  ["no invalid levels", `SELECT count(*)::int AS n FROM wbs_nodes n JOIN wbs_nodes p ON p.id=n."parentId" WHERE n."versionId"=$1 AND n.level<>p.level+1`, [versionId]],
  ["no leaf with children", `SELECT count(*)::int AS n FROM wbs_nodes n WHERE n."versionId"=$1 AND n."nodeType"='pacote' AND EXISTS (SELECT 1 FROM wbs_nodes c WHERE c."parentId"=n.id AND c."versionId"=$1)`, [versionId]],
  ["no non-leaf without children", `SELECT count(*)::int AS n FROM wbs_nodes n WHERE n."versionId"=$1 AND n."nodeType"<>'pacote' AND NOT EXISTS (SELECT 1 FROM wbs_nodes c WHERE c."parentId"=n.id AND c."versionId"=$1)`, [versionId]],
  ["no duplicate sibling names", `SELECT count(*)::int AS n FROM (SELECT "parentId", lower(trim(name)) FROM wbs_nodes WHERE "versionId"=$1 GROUP BY "parentId", lower(trim(name)) HAVING count(*)>1) d`, [versionId]],
];

await client.connect();
try {
  let failed = false;
  for (const [label, sql, params] of checks) {
    const result = await client.query(sql, params);
    const n = Number(result.rows[0]?.n ?? -1);
    const expected = label === "version exists and is approved" ? 1 : 0;
    const ok = n === (label === "69 nodes" ? 69 : label === "53 package leaves" ? 53 : label === "15 level-2 groups" ? 15 : label === "exactly one root" ? 1 : expected);
    console.log(`${ok ? "PASS" : "FAIL"} | ${label} | actual=${n}`);
    if (!ok) failed = true;
  }
  if (failed) process.exitCode = 1;
} finally {
  await client.end();
}
