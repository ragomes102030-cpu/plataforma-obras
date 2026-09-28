#!/usr/bin/env node
/**
 * AUDITORIA DE SCHEMA — le o INFORMATION_SCHEMA do banco real e confronta com o
 * que as migracoes deste repo declaram.
 *
 * A fonte da verdade e o DDL de drizzle/0000_baseline.sql + drizzle/0001_*.sql,
 * nao o schema.ts: o baseline e o que foi efetivamente enviado ao MySQL, e tem
 * forma de DDL estritamente parseavel (uma coluna por linha, delimitada por
 * crase). Um parser de TypeScript seria silenciosamente incompleto — ja
 * aconteceu de extrair colunas de so 10 das 33 tabelas e ainda assim "passar".
 *
 * Roda DENTRO do container: le a mesma DATABASE_URL do pre-deploy. Leitura
 * pura, nao escreve nada.
 *
 *   node scripts/audit-schema.mjs          relatorio legivel
 *   node scripts/audit-schema.mjs --json   saida em JSON
 *
 * Sai com codigo 1 em caso de divergencia, o que a torna usavel em checagem
 * automatica.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";

const MIGRATIONS_FOLDER = "drizzle";
const asJson = process.argv.includes("--json");

/** Colunas por tabela, tal como o DDL das migracoes declara. */
function colunasPorTabela() {
  const out = new Map();
  for (const arq of ["0000_baseline.sql", "0001_planning.sql"]) {
    let sql;
    try {
      sql = readFileSync(join(MIGRATIONS_FOLDER, arq), "utf-8");
    } catch {
      continue; // 0001 pode nao existir em branches antigos
    }
    for (const m of sql.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\);/g)) {
      const [, tabela, corpo] = m;
      const cols = out.get(tabela) ?? new Set();
      for (const c of corpo.matchAll(/^\s*`([^`]+)`\s/gm)) cols.add(c[1]);
      out.set(tabela, cols);
    }
    // Colunas adicionadas depois por ALTER TABLE. Sem esta parte a auditoria
    // diria que a Onda 0.4 nao foi aplicada quando ela foi — exatamente o tipo
    // de falso negativo que inutiliza uma auditoria.
    for (const m of sql.matchAll(
      /ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/gi
    )) {
      const cols = out.get(m[1]) ?? new Set();
      cols.add(m[2]);
      out.set(m[1], cols);
    }
  }
  return out;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[audit] DATABASE_URL ausente. Rode dentro do container de deploy.");
  process.exit(1);
}
const parsed = new URL(url);
const sslMode = parsed.searchParams.get("ssl-mode");
parsed.searchParams.delete("ssl-mode");
const conn = await createConnection({
  uri: parsed.toString(),
  ...(sslMode && sslMode !== "disabled" ? { ssl: { rejectUnauthorized: false } } : {}),
});

const declaradas = colunasPorTabela();

const [tabelasRows] = await conn.query(
  `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()`
);
const tabelasBanco = new Set(tabelasRows.map(r => r.TABLE_NAME ?? Object.values(r)[0]));

const faltandoTabelas = [...declaradas.keys()].filter(t => !tabelasBanco.has(t)).sort();
const sobrandoTabelas = [...tabelasBanco]
  .filter(t => !declaradas.has(t) && t !== "__drizzle_migrations")
  .sort();

const colunasFaltando = [];
for (const [tabela, cols] of declaradas) {
  if (!tabelasBanco.has(tabela)) continue;
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tabela]
  );
  const noBanco = new Set(rows.map(r => r.COLUMN_NAME ?? Object.values(r)[0]));
  for (const c of cols) if (!noBanco.has(c)) colunasFaltando.push(`${tabela}.${c}`);
}

const [chaveRows] = await conn.query(
  `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME IN ('mustStartOn','finishNoLaterThan','freeFloat')`
);
const onda04 = chaveRows.map(r => `${r.TABLE_NAME}.${r.COLUMN_NAME}`).sort();

const [idxRows] = await conn.query(
  `SELECT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('work_calendars','calendar_exceptions')`
);
const idx = [...new Set(idxRows.map(r => `${r.TABLE_NAME}.${r.INDEX_NAME}`))].sort();

const [jr] = await conn.query(
  `SELECT COUNT(*) AS n, MAX(created_at) AS last FROM __drizzle_migrations`
);
const journal = { registradas: Number(jr[0].n), ultima: Number(jr[0].last) };

const divergencias = [];
if (faltandoTabelas.length) divergencias.push(`${faltandoTabelas.length} tabela(s) ausente(s)`);
if (colunasFaltando.length) divergencias.push(`${colunasFaltando.length} coluna(s) ausente(s)`);
if (sobrandoTabelas.length) divergencias.push(`${sobrandoTabelas.length} tabela(s) a mais no banco`);
if (onda04.length !== 3) divergencias.push(`Onda 0.4: ${onda04.length}/3 coluna(s) presentes`);

const relatorio = {
  banco: parsed.pathname.replace(/^\//, ""),
  tabelas: {
    declaradas: declaradas.size,
    noBanco: tabelasBanco.size,
    faltando: faltandoTabelas,
    sobrando: sobrandoTabelas,
  },
  colunasFaltando,
  colunasOnda04: onda04,
  indicesCalendario: idx,
  journal,
  divergencias,
};

const ok = divergencias.length === 0;

if (asJson) {
  console.log(JSON.stringify({ ...relatorio, ok }, null, 2));
} else {
  console.log(`banco: ${relatorio.banco}`);
  console.log();
  console.log(`tabelas declaradas nas migracoes: ${relatorio.tabelas.declaradas}`);
  console.log(`tabelas existentes no banco     : ${relatorio.tabelas.noBanco}`);
  console.log(`  faltando: ${faltandoTabelas.length ? faltandoTabelas.join(", ") : "nenhuma"}`);
  console.log(`  sobrando: ${sobrandoTabelas.length ? sobrandoTabelas.join(", ") : "nenhuma"}`);
  console.log();
  console.log(
    `colunas declaradas e ausentes: ${colunasFaltando.length ? colunasFaltando.join(", ") : "nenhuma"}`
  );
  console.log();
  console.log("colunas da Onda 0.4:");
  for (const c of onda04) console.log(`  ${c}`);
  console.log();
  console.log("indices do calendario:");
  for (const i of idx) console.log(`  ${i}`);
  console.log();
  console.log(`journal: ${journal.registradas} migracao(oes), ultima created_at = ${journal.ultima}`);
  console.log();
  console.log(ok ? "RESULTADO: banco confere com as migracoes do repo" : "RESULTADO: DIVERGENCIA\n  " + divergencias.join("\n  "));
}

await conn.end();
process.exit(ok ? 0 : 1);
