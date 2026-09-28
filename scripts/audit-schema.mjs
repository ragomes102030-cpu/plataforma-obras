#!/usr/bin/env node
/**
 * AUDITORIA DE SCHEMA — le o INFORMATION_SCHEMA e confronta com o que as
 * migracoes deste repo declaram.
 *
 * Roda DENTRO do container, na rede da Railway: o MySQL so responde em
 * mysql.railway.internal, que da ENOTFOUND de fora. E chamada como funcao por
 * migrate-db.mjs no fim do pre-deploy, reusing a conexao ja aberta, e tambem
 * pode rodar sozinha com `node scripts/audit-schema.mjs`.
 *
 * A fonte da verdade e o DDL de drizzle/0000_baseline.sql + drizzle/0001_*.sql,
 * nao o schema.ts: o baseline e o que foi enviado ao MySQL e tem forma de DDL
 * estritamente parseavel (uma coluna por linha, delimitada por crase). Um
 * parser de TypeScript seria silenciosamente incompleto — ja extraiu colunas de
 * so 10 das 33 tabelas e ainda assim teria dito "verde". Falso verde e pior que
 * nao ter teste.
 *
 * Leitura pura: nao escreve nada. Sai com codigo 1 em divergencia quando roda
 * standalone; chamada como funcao, apenas informa.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";

const MIGRATIONS_FOLDER = "drizzle";
const ARQS = ["0000_baseline.sql", "0001_planning.sql"];

/** Colunas por tabela, tal como o DDL das migracoes declara. */
export function colunasPorTabela(pasta = MIGRATIONS_FOLDER) {
  const out = new Map();
  for (const arq of ARQS) {
    let sql;
    try {
      sql = readFileSync(join(pasta, arq), "utf-8");
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
    for (const m of sql.matchAll(/ALTER TABLE `([^`]+)` ADD COLUMN `([^`]+)`/gi)) {
      const cols = out.get(m[1]) ?? new Set();
      cols.add(m[2]);
      out.set(m[1], cols);
    }
  }
  return out;
}

/**
 * Compara o banco com as migracoes. `conn` precisa ter `query(sql, params)`.
 * So executa SELECT.
 */
export async function auditarSchema({ conn, pasta = MIGRATIONS_FOLDER }) {
  const declaradas = colunasPorTabela(pasta);

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
    // Uma query por tabela, listando as colunas existentes. Consultar coluna a
    // coluna com `TABLE_NAME = ? AND COLUMN_NAME = ?` seria N queries e ainda
    // assim nao provaria nada que esta nao prove.
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
  const indices = [...new Set(idxRows.map(r => `${r.TABLE_NAME}.${r.INDEX_NAME}`))].sort();

  const [jr] = await conn.query(
    `SELECT COUNT(*) AS n, MAX(created_at) AS last FROM __drizzle_migrations`
  );
  const journal = { registradas: Number(jr[0].n), ultima: Number(jr[0].last) };

  const divergencias = [];
  if (faltandoTabelas.length) divergencias.push(`${faltandoTabelas.length} tabela(s) ausente(s): ${faltandoTabelas.join(", ")}`);
  if (colunasFaltando.length) divergencias.push(`${colunasFaltando.length} coluna(s) ausente(s): ${colunasFaltando.slice(0, 10).join(", ")}`);
  if (sobrandoTabelas.length) divergencias.push(`${sobrandoTabelas.length} tabela(s) a mais no banco: ${sobrandoTabelas.join(", ")}`);
  if (onda04.length !== 3) divergencias.push(`Onda 0.4: ${onda04.length}/3 coluna(s) presentes (${onda04.join(", ") || "nenhuma"})`);

  const linhas = [
    `tabelas: ${declaradas.size} declaradas, ${tabelasBanco.size} no banco` +
      (faltandoTabelas.length ? ` | AUSENTES: ${faltandoTabelas.join(", ")}` : " | nenhuma ausente") +
      (sobrandoTabelas.length ? ` | A MAIS: ${sobrandoTabelas.join(", ")}` : ""),
    `colunas: ${colunasFaltando.length ? `AUSENTES: ${colunasFaltando.join(", ")}` : "todas as declaradas existem"}`,
    `onda 0.4: ${onda04.length}/3 coluna(s) — ${onda04.join(", ") || "nenhuma"}`,
    `indices do calendario: ${indices.length ? indices.join(", ") : "nenhum"}`,
    `journal: ${journal.registradas} migracao(oes), ultima created_at = ${journal.ultima}`,
  ];

  return {
    ok: divergencias.length === 0,
    divergencias,
    linhas,
    tabelasDeclaradas: declaradas.size,
    tabelasNoBanco: tabelasBanco.size,
    faltandoTabelas,
    sobrandoTabelas,
    colunasFaltando,
    onda04,
    indices,
    journal,
  };
}

// ------------------------------------------------------------------ CLI ----
const executadoDireto =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "");

if (executadoDireto) {
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

  const r = await auditarSchema({ conn });
  const asJson = process.argv.includes("--json");
  if (asJson) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`banco: ${parsed.pathname.replace(/^\//, "")}`);
    for (const l of r.linhas) console.log(l);
    console.log();
    console.log(
      r.ok
        ? "RESULTADO: banco confere com as migracoes do repo"
        : "RESULTADO: DIVERGENCIA\n  " + r.divergencias.join("\n  ")
    );
  }
  await conn.end();
  process.exit(r.ok ? 0 : 1);
}
