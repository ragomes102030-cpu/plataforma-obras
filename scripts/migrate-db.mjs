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
 * Uso:
 *   node scripts/migrate-db.mjs             aplica
 *   node scripts/migrate-db.mjs --dry-run   relata e nao escreve nada
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createConnection } from "mysql2/promise";
import { readMigrationFiles } from "drizzle-orm/migrator";

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
for (const m of aAplicar) {
    console.log(`[migrate]   pendente ${m.folderMillis}`);
  }
}

if (dryRun) {
  console.log("[migrate] --dry-run: nada foi escrito no banco.");
  await conn.end();
  process.exit(0);
}

// ------------------------------------------------------------- aplicar ----
// DDL no MySQL faz implicit commit: se um statement falha no meio, os
// anteriores JA ficam aplicados, mas a migracao nao e registrada em
// `__drizzle_migrations` (o INSERT vem depois de todos os statements).
// Rodando o script de novo, os mesmos statements estourariam com
// `duplicate column` / `table already exists` -- falha eternal.
//
// Por isso cada statement e conferido contra INFORMATION_SCHEMA antes de
// executar, e o que ja existir e apenas logado e pulado.
function alvoDoStatement(stmt) {
  const criarTabela = stmt.match(
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/i
  );
  if (criarTabela) return { tipo: "table", tabela: criarTabela[1] };

  const addColuna = stmt.match(
    /^\s*ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+(?:COLUMN\s+)?`([^`]+)`/i
  );
  if (addColuna) return { tipo: "coluna", tabela: addColuna[1], nome: addColuna[2] };

  const addConstraint = stmt.match(
    /^\s*ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+(?:CONSTRAINT\s+)?`([^`]+)`/i
  );
  if (addConstraint)
    return { tipo: "constraint", tabela: addConstraint[1], nome: addConstraint[2] };

  const criarIndex = stmt.match(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i
  );
  if (criarIndex) return { tipo: "index", tabela: criarIndex[2], nome: criarIndex[1] };

  return null;
}

// Qual tabela do INFORMATION_SCHEMA responde por cada tipo, e por qual coluna.
// Estas colunas sao reais: consultar uma coluna que a tabela nao tem da
// ER_BAD_FIELD_ERROR, que matava o pre-deploy.
const CONSULTA_POR_TIPO = {
  table: { tabela: "TABLES", coluna: null },
  coluna: { tabela: "COLUMNS", coluna: "COLUMN_NAME" },
  constraint: { tabela: "TABLE_CONSTRAINTS", coluna: "CONSTRAINT_NAME" },
  index: { tabela: "STATISTICS", coluna: "INDEX_NAME" },
};

function alvoDeConsulta(alvo) {
  const def = CONSULTA_POR_TIPO[alvo.tipo];
  if (!def) throw new Error(`tipo de DDL nao mapeado: ${alvo.tipo}`);
  return def;
}

async function jaExiste(alvo) {
  const { tabela: infoTable, coluna } = alvoDeConsulta(alvo);
  const [rows] = await conn.query(
    `SELECT 1 AS found FROM INFORMATION_SCHEMA.${infoTable}` +
      ` WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?` +
      (coluna ? ` AND ${coluna} = ?` : "") +
      ` LIMIT 1`,
    coluna ? [alvo.tabela, alvo.nome] : [alvo.tabela]
  );
  return rows.length > 0;
}

// `pending` foi calculado antes do bloco do banco legado poder ter inserido
// registros em `__drizzle_migrations`. Rele o estado real aqui para nao
// reaplicar DDL que ja consta como aplicado.
let lastAppliedReal = null;
if (tableNames.has(MIGRATIONS_TABLE)) {
  const [rowsReal] = await conn.query(
    `SELECT created_at FROM \`${MIGRATIONS_TABLE}\` ORDER BY created_at DESC LIMIT 1`
  );
  if (rowsReal.length > 0) lastAppliedReal = Number(Object.values(rowsReal[0])[0]);
}
const aAplicar =
  lastAppliedReal === null
    ? migrations
    : migrations.filter(m => m.folderMillis > lastAppliedReal);
if (aAplicar.length !== pending.length) {
  console.log(
    `[migrate] releitura do journal: ${aAplicar.length} migracao(oes) a aplicar (antes: ${pending.length})`
  );
}

let aplicados = 0;
for (const m of aAplicar) {
  let executados = 0;
  let pulados = 0;
  for (const stmt of m.sql) {
    if (!stmt.trim()) continue;
    const alvo = alvoDoStatement(stmt);
    if (alvo && (await jaExiste(alvo))) {
      console.log(
        `[migrate]   ja aplicado, pulado: ${alvo.tipo} \`${alvo.nome ?? alvo.tabela}\` em \`${alvo.tabela}\``
      );
      pulados++;
      continue;
    }
    await conn.query(stmt);
    executados++;
  }
  await conn.query(
    "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
    [m.hash, m.folderMillis]
  );
  aplicados++;
  console.log(`[migrate] aplicada ${m.folderMillis}: ${executados} executado(s), ${pulados} ja existente(s)`);
}
if (aplicados === 0) console.log("[migrate] nada pendente; nenhum DDL executado.");

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
