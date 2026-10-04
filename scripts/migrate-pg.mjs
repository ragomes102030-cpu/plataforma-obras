/**
 * Aplica as migrations do PostgreSQL e audita o resultado.
 *
 * Este é o script que o pre-deploy executa. Ele é separado de
 * `migrate-core-pg.mjs` para que o núcleo — a parte que decide o que já existe
 * e o que falta, statement a statement — possa ser importado e testado sem
 * subir banco nenhum.
 *
 * POR QUE UM SCRIPT NOVO, E NÃO UMA ADAPTAÇÃO
 *
 * Trocar o driver não é trocar uma linha. As seis migrations MySQL foram
 * removidas: o schema foi reescrito em `pgTable`, os 32 enums viraram tipos
 * nomeados, e `ON UPDATE CURRENT_TIMESTAMP` — que não existe no PostgreSQL —
 * virou trigger. Um `migrate-db.mjs` adaptado pela metade aplicaria DDL de
 * MySQL num banco PostgreSQL e falharia na primeira tabela.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { aplicarMigracoes, verificarSeDdlEstaNoBanco } from "./migrate-core-pg.mjs";
import { auditarSchema } from "./audit-schema-pg.mjs";

const MIGRATIONS_FOLDER = "drizzle";
const JOURNAL = join(MIGRATIONS_FOLDER, "meta", "_journal.json");
const MIGRATIONS_TABLE = "__drizzle_migrations";
const dryRun = process.argv.includes("--dry-run");

function fail(msg) {
  console.error(`[migrate] ERRO: ${msg}`);
  process.exit(1);
}

// ----------------------------------------------------------------- conexão --
const rawUrl = process.env.USE_SUPABASE === "1"
  ? (process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL_SUPABASE || process.env.SUPA_DB_URL)
  : process.env.DATABASE_URL;
const url = rawUrl ? (() => {
  const u = new URL(rawUrl);
  if (process.env.USE_SUPABASE === "1" && u.hostname === "db.tromrvfijbtihuilvnuk.supabase.co") {
    u.hostname = "aws-0-sa-east-1.pooler.supabase.com";
    u.port = "5432";
    if (u.username === "postgres") u.username = "postgres.tromrvfijbtihuilvnuk";
  }
  return u.toString();
})() : undefined;
if (!url) {
  fail("DATABASE_URL ausente. O banco e o PostgreSQL; sem esta variavel nao ha onde aplicar.");
}

// O `pg` le `sslmode` da propria connection string. `ssl-mode` com hifen e do
// MySQL e ficaria ali como parametro morto, achando que ainda diz alguma coisa.
const parsed = new URL(url);
parsed.searchParams.delete("ssl-mode");
parsed.searchParams.delete("charset");
const sslDesejado = (parsed.searchParams.get("sslmode") ?? "").toLowerCase();
const sslDesligado = sslDesejado === "disable";
if (sslDesligado) parsed.searchParams.delete("sslmode");

const conn = new Client({
  connectionString: parsed.toString(),
  ...(sslDesejado && !sslDesligado ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  await conn.connect();
} catch (error) {
  // A mensagem do `pg` costuma trazer host, usuario e as vezes a senha
  // truncada. Registrar o objeto inteiro e vazamento.
  console.error("[migrate] falha ao conectar:", error?.message ?? String(error));
  process.exit(1);
}

// ------------------------------------------------------------------ disco ----
if (!existsSync(JOURNAL)) {
  fail(`${JOURNAL} ausente. O journal e o que diz o que falta aplicar.`);
}

const journal = JSON.parse(readFileSync(JOURNAL, "utf-8"));
if (journal.dialect !== "postgresql") {
  fail(`o journal declara o dialeto "${journal.dialect}" e este script aplica PostgreSQL.`);
}

const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
if (migrations.length === 0) {
  fail("o journal existe mas nao tem entradas.");
}
console.log(
  `[migrate] ${migrations.length} migracao(oes) em disco; ultima = ${migrations[migrations.length - 1].folderMillis}`
);

// ------------------------------------------------------------- inventário ---
// O MySQL media por `INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`.
// No PostgreSQL nao existe `DATABASE()`, e um `DATABASE()` esquecido aqui e
// erro de sintaxe que derruba o pre-deploy inteiro.
const catalogos = await conn.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
);
const tableNames = new Set(catalogos.rows.map(r => r.table_name));
const userTables = [...tableNames].filter(n => n !== MIGRATIONS_TABLE && !n.startsWith("__"));
const hasMigrationTable = tableNames.has(MIGRATIONS_TABLE);

async function ultimaRegistrada() {
  if (!hasMigrationTable) return null;
  const r = await conn.query(`SELECT MAX(created_at) AS last FROM "${MIGRATIONS_TABLE}"`);
  const last = r.rows[0]?.last;
  return last === null || last === undefined ? null : Number(last);
}

let lastApplied = await ultimaRegistrada();

const isFresh = userTables.length === 0 && !hasMigrationTable;
const isLegacy = userTables.length > 0 && lastApplied === null;
const pending = lastApplied === null ? migrations : migrations.filter(m => m.folderMillis > lastApplied);

// --------------------------------------------------------------- baseline ---
if (isFresh) {
  console.log(
    `[migrate] banco vazio (0 tabela(s) de usuario): aplicando ${migrations.length} migracao(oes) do zero`
  );
} else if (isLegacy) {
  // Banco com tabelas e sem `__drizzle_migrations` veio de uma versao anterior
  // do runner. As tabelas ja estao la; falta o registro. Marcar como aplicadas
  // SEM reexecutar o DDL e o que impede `already exists` no primeiro retry.
  console.log(
    `[migrate] banco legado: ${userTables.length} tabela(s) de usuario e nenhum registro em ` +
      `${MIGRATIONS_TABLE}. O DDL das ${migrations.length} migracao(oes) ja esta no schema.`
  );
  console.log("[migrate] BASELINE: marcando-as como aplicadas sem reexecutar o DDL.");
  if (!dryRun) {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (` +
        "id serial primary key, hash text not null, created_at bigint)"
    );
    for (const m of migrations) {
      await conn.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES ($1, $2)`,
        [m.hash, m.folderMillis]
      );
    }
  }
} else {
  console.log(
    `[migrate] banco normal: ${migrations.length - pending.length} migration(oes) aplicada(s), ` +
      `${pending.length} pendente(s)`
  );
  for (const m of pending) console.log(`[migrate]   pendente ${m.folderMillis}`);
}

if (dryRun) {
  console.log("[migrate] --dry-run: nada foi escrito no banco.");
  await conn.end();
  process.exit(0);
}

// --------------------------------------------------------------- aplicar ----
const lastAppliedReal = (await ultimaRegistrada()) ?? lastApplied;

// O journal diz o que foi aplicado; ele nao diz se o DDL esta no banco. As duas
// coisas divergiram em producao e o estado nao se descrevia: 33 tabelas, 32 enums,
// journal completo, e 23 triggers declaradas e ausentes. `updatedAt` de 23
// tabelas parado, e o `/readyz` respondendo "ok" com 34 tabelas.
//
// A conferences statement a statement e o que impede isso de se repetir, e e
// barata: o `CREATE TRIGGER` e idempotente por natureza.
const conferencia = await verificarSeDdlEstaNoBanco({
  conn,
  migrations,
  jaAplicado: lastAppliedReal,
});
if (conferencia.pendentes.length > 0) {
  for (const p of conferencia.pendentes) {
    console.warn(
      `[migrate] DIVERGENCIA: a migration ${p.folderMillis} consta no journal, ` +
        `mas ${p.faltando.length} objeto(s) nao estao no banco. Reaplicando.`
    );
    for (const f of p.faltando.slice(0, 5)) {
      console.warn(`[migrate]   faltando: ${f.tipo} "${f.nome ?? f.tabela}" em "${f.tabela}"`);
    }
  }
}

await aplicarMigracoes({
  conn,
  migrations,
  jaAplicado: lastAppliedReal,
  reaplicarMarcadas: conferencia.pendentes.length > 0,
  migrationsTable: MIGRATIONS_TABLE,
  log: msg => console.log(msg),
});

// -------------------------------------------------------------- verificar ---
const after = await conn.query(
  `SELECT COUNT(DISTINCT created_at) AS n, MAX(created_at) AS last FROM "${MIGRATIONS_TABLE}"`
);
const expected = migrations[migrations.length - 1].folderMillis;
const ok =
  Number(after.rows[0].n) === migrations.length && Number(after.rows[0].last) === expected;

console.log(
  `[migrate] pos: ${after.rows[0].n}/${migrations.length} migration(oes) distintas registradas; ` +
    `ultima = ${after.rows[0].last} (esperado ${expected})`
);
if (!ok) {
  await conn.end();
  fail("o estado final do journal nao bate com o journal em disco.");
}

const finalTables = await conn.query(
  "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = current_schema()"
);
console.log(
  `[migrate] OK: ${finalTables.rows[0].n} tabela(s) no schema \`${parsed.pathname.replace(/^\//, "")}\`.`
);

// --------------------------------------------------------------- auditar ----
// A auditoria roda AQUI, com a mesma conexao, e nao como um segundo comando do
// pre-deploy: comandos separados abrem duas conexoes, e a segunda pode falhar
// sozinha com o pre-deploy ja tendo dado certo.
const auditoria = await auditarSchema({ conn });
for (const linha of auditoria.linhas) console.log(`[audit] ${linha}`);
if (!auditoria.ok) {
  console.warn("[audit] DIVERGENCIA: o banco nao confere com as migracoes deste repo.");
  for (const d of auditoria.divergencias) console.warn(`[audit]   ${d}`);
} else {
  console.log(
    `[audit] banco confere com as migracoes (${auditoria.tabelasNoBanco} tabela(s), ` +
      `${auditoria.enumsNoBanco} enum(s), ${auditoria.triggersNoBanco} trigger(s)).`
  );
}

await conn.end();
