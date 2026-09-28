#!/usr/bin/env node
/**
 * Aplica as migracoes do Drizzle no banco.
 *
 * A situacao e decidida pelo estado real do banco, nunca por flag. Tres casos:
 *
 *   BANCO VAZIO   -> aplica 0000..N em ordem. Caminho de maquina nova e de
 *                    recuperacao de desastre.
 *
 *   BANCO LEGADO  -> as tabelas existem mas nao ha `__drizzle_migrations`,
 *                    porque o schema foi criado por `bootstrap-db.mjs` a
 *                    partir do arquivo achatado `drizzle/full-schema.sql`.
 *                    Nesse caso o DDL das migracoes JA esta refletido no
 *                    schema: o certo e marcar as migracoes como aplicadas,
 *                    nunca reexecutar o DDL delas (que tentaria recriar
 *                    tabelas existentes e abortaria no pre-deploy).
 *
 *   BANCO NORMAL  -> aplica apenas as pendentes.
 *
 * Este script substitui `bootstrap-db.mjs`, que era um remendo: ele criava o
 * schema a partir de um arquivo unico e nunca acompanhava as migracoes, de
 * modo que 22 migracoes do Drizzle jamais chegavam a um banco em uso.
 *
 * A logica de aplicacao esta em `migrate-core.mjs`, separada deste arquivo para
 * poder ser executada de verdade nos testes com uma conexao falsa.
 *
 * Uso:
 *   node scripts/migrate-db.mjs             aplica
 *   node scripts/migrate-db.mjs --dry-run   relata e nao escreve nada
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createConnection } from "mysql2/promise";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { aplicarMigracoes } from "./migrate-core.mjs";

const MIGRATIONS_FOLDER = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";
const dryRun = process.argv.slice(2).some(a => a === "--dry-run" || a === "--status");

function fail(message) {
  console.error(`[migrate] ERRO: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- conexao --
const url = process.env.DATABASE_URL;
if (!url) {
  fail("DATABASE_URL ausente. Sem isso nao ha como decidir o estado do banco.");
}
const parsed = new URL(url);
const sslMode = parsed.searchParams.get("ssl-mode");
parsed.searchParams.delete("ssl-mode");
const conn = await createConnection({
  uri: parsed.toString(),
  ...(sslMode && sslMode !== "disabled" ? { ssl: { rejectUnauthorized: false } } : {}),
});

// ------------------------------------------------- migracoes em disco -----
// Falha alto e cedo se a imagem de deploy nao contiver as migracoes. Sem
// este teste o script poderia rodar "com sucesso" sem aplicar nada, e o
// pre-deploy passaria verde com o schema errado.
if (!existsSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) {
  fail(
    `drizzle/meta/_journal.json ausente em ${resolve(MIGRATIONS_FOLDER)}. ` +
      `A imagem de deploy nao contem as migracoes — verifique o builder e o .gitignore.`
  );
}
const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
if (migrations.length === 0) {
  fail("drizzle/meta/_journal.json existe mas nao tem entradas.");
}
console.log(
  `[migrate] ${migrations.length} migracao(oes) em disco; ultima = ${migrations[migrations.length - 1].folderMillis}`
);

// ------------------------------------------------------- estado do banco --
const [tableRows] = await conn.query(
  "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()"
);
const tableNames = new Set(tableRows.map(r => Object.values(r)[0]));
const userTables = [...tableNames].filter(n => n !== MIGRATIONS_TABLE && !n.startsWith("__"));
const hasMigrationTable = tableNames.has(MIGRATIONS_TABLE);

let lastApplied = null;
let appliedCount = 0;
if (hasMigrationTable) {
  const [rows] = await conn.query(
    `SELECT created_at FROM \`${MIGRATIONS_TABLE}\` ORDER BY created_at DESC`
  );
  appliedCount = rows.length;
  if (rows.length > 0) lastApplied = Number(Object.values(rows[0])[0]);
}

const isFresh = userTables.length === 0 && !hasMigrationTable;
const isLegacy = userTables.length > 0 && appliedCount === 0;
const pending = lastApplied === null ? migrations : migrations.filter(m => m.folderMillis > lastApplied);

// ------------------------------------------------------------- Baseline ---
if (isFresh) {
  console.log(
    `[migrate] banco vazio (0 tabela(s) de usuario): aplicando ${migrations.length} migracao(oes) do zero`
  );
} else if (isLegacy) {
  console.log(
    `[migrate] banco legado: ${userTables.length} tabela(s) de usuario e nenhum registro em ` +
      `${MIGRATIONS_TABLE}. O DDL das ${migrations.length} migracao(oes) ja esta no schema.`
  );
  console.log("[migrate] BASELINE: marcando-as como aplicadas sem reexecutar o DDL.");
  if (!dryRun) {
    // DDL identico ao que drizzle cria (mysql-core/dialect.js).
    await conn.query(
      `CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
         id serial primary key,
         hash text not null,
         created_at bigint
       )`
    );
    for (const m of migrations) {
      await conn.query(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (\`hash\`, \`created_at\`) VALUES (?, ?)`,
        [m.hash, m.folderMillis]
      );
    }
  }
} else {
  console.log(
    `[migrate] banco normal: ${appliedCount} migracao(oes) aplicada(s), ${pending.length} pendente(s)`
  );
  for (const m of pending) {
    console.log(`[migrate]   pendente ${m.folderMillis}`);
  }
}

if (dryRun) {
  console.log("[migrate] --dry-run: nada foi escrito no banco.");
  await conn.end();
  process.exit(0);
}

// ------------------------------------------------------------- aplicar ----
// O nucleo decide, statement a statement, o que ja existe e o que ainda falta.
// DDL no MySQL faz implicit commit, entao um deploy que falhou no meio deixou
// parte do DDL aplicada sem ter registrado a migracao; sem essa checagem o
// proximo deploy estouraria com `duplicate column`.

// O `lastApplied` acima foi lido ANTES do bloco de banco legado, que pode ter
// inserido registros. Rele aqui, senao um banco legado receberia de novo o DDL
// que ja tem e o pre-deploy morreria com `table already exists`.
let lastAppliedReal = lastApplied;
if (hasMigrationTable) {
  const [rowsReal] = await conn.query(
    `SELECT created_at FROM \`${MIGRATIONS_TABLE}\` ORDER BY created_at DESC LIMIT 1`
  );
  if (rowsReal.length > 0) lastAppliedReal = Number(Object.values(rowsReal[0])[0]);
}

await aplicarMigracoes({
  conn,
  migrations,
  jaAplicado: lastAppliedReal,
  migrationsTable: MIGRATIONS_TABLE,
  log: msg => console.log(msg),
});

// ------------------------------------------------------------ verificar ---
const [after] = await conn.query(
  `SELECT COUNT(*) AS n, MAX(created_at) AS last FROM \`${MIGRATIONS_TABLE}\``
);
const expected = migrations[migrations.length - 1].folderMillis;
const ok = Number(after[0].n) === migrations.length && Number(after[0].last) === expected;

console.log(
  `[migrate] pos: ${after[0].n}/${migrations.length} migracao(oes) registradas; ultima = ${after[0].last} (esperado ${expected})`
);
if (!ok) {
  await conn.end();
  fail("o estado final do journal nao bate com o journal em disco.");
}

const [finalTables] = await conn.query(
  "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()"
);
console.log(`[migrate] OK: ${finalTables[0].n} tabela(s) no schema \`${parsed.pathname.replace(/^\//, "")}\`.`);

await conn.end();
