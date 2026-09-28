/**
 * Auditoria somente-leitura do banco MySQL de produção/staging.
 *
 * Verifica:
 *  1. versão, uptime, charset/collation de cada tabela
 *  2. contagem de linhas por tabela
 *  3. DRIFT: colunas em drizzle/schema.ts x information_schema
 *  4. integridade referencial: linhas órfãs (FK sem pai)
 *  5. índices primários/únicos ausentes
 *
 * Não executa NENHUM INSERT/UPDATE/DELETE/ALTER.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const cfg = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

if (!cfg.host || !cfg.user || !cfg.password) {
  console.error("Faltam DB_HOST/DB_USER/DB_PASSWORD");
  process.exit(1);
}

const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });
const out = [];
const log = (...a) => { const s = a.join(" "); out.push(s); console.log(s); };

// ---------------------------------------------------------------- 1. server
const [sv] = await conn.query(
  "SELECT VERSION() version, @@version_comment comment, @@sql_mode sql_mode, @@time_zone tz, @@innodb_buffer_pool_size bp"
);
log("=== 1. SERVIDOR ===");
log(JSON.stringify(sv[0], null, 2));

const [vars] = await conn.query(
  `SELECT table_name AS tbl, engine AS eng, table_rows AS rws, table_collation AS coll,
          data_length AS dl, index_length AS il
     FROM information_schema.tables
    WHERE table_schema = ? ORDER BY table_name`, [cfg.database]
);
log("\n=== 2. TABELAS (engine / rows aprox / collation) ===");
let totalRows = 0;
for (const t of vars) {
  totalRows += Number(t.rws || 0);
  log(`  ${String(t.tbl).padEnd(34)} ${String(t.eng).padEnd(8)} ~${String(t.rws).padStart(6)}  ${t.coll}`);
}
log(`  TOTAL tabelas=${vars.length}  soma(rows aprox)=${totalRows}`);

const innodb = vars.filter((t) => String(t.eng).toUpperCase() !== "INNODB");
if (innodb.length) log(`  !! tabelas fora do InnoDB: ${innodb.map((t) => t.tbl).join(", ")}`);

// ------------------------------------------------- 3. drift schema.ts x banco
log("\n=== 3. DRIFT drizzle/schema.ts x information_schema ===");

// Extrai `export const <tableName> = mysqlTable("<db_name>", { ... })` e as
// chaves de coluna de primeiro nivel do corpo do objeto.
const src = readFileSync("drizzle/schema.ts", "utf-8");
const expected = new Map(); // db_name -> Set(cols)
const re = /export const (\w+)\s*=\s*mysqlTable\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{/g;
for (const m of src.matchAll(re)) {
  const dbName = m[2];
  // acha o fechamento do objeto de colunas contando chaves
  let i = m.index + m[0].length, depth = 1, body = "";
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) break; }
    body += ch;
    i++;
  }
  const cols = new Set();
  // chave de coluna no 1o nivel do objeto (o arquivo mistura 2 e 4 espacos)
  for (const c of body.matchAll(/^ {2,4}(\w+)\s*:/gm)) cols.add(c[1]);
  expected.set(dbName, cols);
}

const [actualCols] = await conn.query(
  `SELECT table_name AS tbl, column_name AS col, column_type AS typ, is_nullable AS nullable,
          column_default AS def
     FROM information_schema.columns
    WHERE table_schema = ?`, [cfg.database]
);
const actual = new Map();
for (const c of actualCols) {
  if (!actual.has(c.tbl)) actual.set(c.tbl, new Set());
  actual.get(c.tbl).add(c.col);
}

const missingTables = [];
const missingCols = [];
const extraTables = [];
const extraCols = [];

for (const [dbName, cols] of expected) {
  if (!actual.has(dbName)) { missingTables.push(dbName); continue; }
  const have = actual.get(dbName);
  for (const c of cols) if (!have.has(c)) missingCols.push(`${dbName}.${c}`);
}
for (const dbName of actual.keys()) if (!expected.has(dbName)) extraTables.push(dbName);

log(`  tabelas esperadas no codigo: ${expected.size} | existentes no banco: ${actual.size}`);
if (missingTables.length) log(`  !! TABELAS AUSENTES NO BANCO: ${missingTables.join(", ")}`);
if (missingCols.length) log(`  !! COLUNAS ESPERADAS E AUSENTES (=> SELECT * quebra com 500):\n     ${missingCols.join("\n     ")}`);
if (extraTables.length) log(`  .. tabelas no banco sem equivalente no codigo: ${extraTables.join(", ")}`);
for (const dbName of actual.keys()) {
  if (!expected.has(dbName)) continue;
  const have = actual.get(dbName), want = expected.get(dbName);
  const extra = [...have].filter((c) => !want.has(c));
  if (extra.length) log(`  .. ${dbName}: colunas so no banco: ${extra.join(", ")}`);
}if (!missingTables.length && !missingCols.length) log("  OK: nenhuma tabela/coluna esperada pelo codigo esta ausente.");

// ------------------------------------------------ 4. integridade referencial
log("\n=== 4. INTEGRIDADE REFERENCIAL (linhas orfas) ===");
const [fks] = await conn.query(
  `SELECT kcu.CONSTRAINT_NAME AS con, kcu.TABLE_NAME AS tbl, kcu.COLUMN_NAME AS col,
          kcu.REFERENCED_TABLE_NAME AS refTbl, kcu.REFERENCED_COLUMN_NAME AS refCol
     FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.CONSTRAINT_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`, [cfg.database]
);
let orphanTotal = 0;
for (const f of fks) {
  const [r] = await conn.query(
    `SELECT COUNT(*) n FROM \`${f.tbl}\` c
      LEFT JOIN \`${f.refTbl}\` p ON p.\`${f.refCol}\` = c.\`${f.col}\`
     WHERE c.\`${f.col}\` IS NOT NULL AND p.\`${f.refCol}\` IS NULL`
  );
  const n = Number(r[0].n);
  if (n > 0) { orphanTotal += n; log(`  !! ${n} orfa(s) em ${f.tbl}.${f.col} -> ${f.refTbl}.${f.refCol}`); }
}
if (!orphanTotal) log(`  OK: nenhuma linha orfa em ${fks.length} chaves estrangeiras.`);

// ------------------------------------------------ 5. PK / unique / indices
log("\n=== 5. CHAVES E INDICES ===");
const [idx] = await conn.query(
  `SELECT table_name AS tbl, index_name AS idx, non_unique AS nu,
          GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
     FROM information_schema.statistics
    WHERE table_schema = ? GROUP BY table_name, index_name, non_unique`, [cfg.database]
);
const byTbl = new Map();
for (const i of idx) {
  if (!byTbl.has(i.tbl)) byTbl.set(i.tbl, []);
  byTbl.get(i.tbl).push(i);
}
let noPk = [];
for (const [tbl, list] of byTbl) {
  if (!list.some((i) => i.idx === "PRIMARY")) noPk.push(tbl);
}
if (noPk.length) log(`  !! tabelas SEM chave primaria: ${noPk.join(", ")}`);
else log("  OK: todas as tabelas tem PRIMARY KEY.");

// ------------------------------------------------------- 6. resumo de dados
log("\n=== 6. CONTAGENS REAIS das tabelas de dominio ===");
for (const t of ["users", "projects", "wbs_nodes", "schedule_activities", "schedule_dependencies", "budget_versions", "budget_items", "project_plan_versions"]) {
  if (!actual.has(t)) { log(`  ${t.padEnd(24)} (tabela ausente)`); continue; }
  const [r] = await conn.query(`SELECT COUNT(*) n FROM \`${t}\``);
  log(`  ${t.padEnd(24)} ${r[0].n}`);
}

await conn.end();
process.stdout.write("\n=== FIM DA AUDITORIA (somente leitura) ===\n");
