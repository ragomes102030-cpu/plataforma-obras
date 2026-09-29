// Descobre colunas reais das tabelas com nomes incertos e re-audita.
import { createConnection } from "mysql2/promise";

function normalize(databaseUrl) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("ssl-mode")?.toLowerCase();
  url.searchParams.delete("ssl-mode");
  return {
    uri: url.toString(),
    ...(sslMode && sslMode !== "disabled" ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

async function q(conn, sqlText) {
  const [rows] = await conn.execute(sqlText);
  return rows;
}

async function main() {
  const conn = await createConnection({ ...normalize(process.env.DATABASE_URL), connectTimeout: 15000 });
  console.log("== COLUNAS REAIS ==");

  for (const t of ["budget_items", "production_entries", "wbs_nodes", "activity_resource_allocations"]) {
    console.log(`\n[${t}]`);
    const cols = await q(
      conn,
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${t}' ORDER BY ORDINAL_POSITION`
    );
    console.log("  " + cols.map((c) => c.COLUMN_NAME).join(", "));
  }

  console.log("\n== RE-VERIFICACAO ORFAOS ==");
  const checks = [
    ["budget_items -> projects (auto-detect)", ""],
    ["production_entries -> projects/units (auto-detect)", ""],
  ];
  // budget_items: tenta achar coluna de projeto
  const biCols = (await q(conn, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budget_items'`)).map(c => c.COLUMN_NAME);
  const peCols = (await q(conn, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'production_entries'`)).map(c => c.COLUMN_NAME);
  const wbsCols = (await q(conn, `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wbs_nodes'`)).map(c => c.COLUMN_NAME);

  const findProjCol = (cols) => cols.find((c) => /project/i.test(c) && !/id/i.test(c)) || cols.find((c) => /project/i.test(c));

  if (biCols.length > 0) {
    const col = biCols.find((c) => /project/i.test(c));
    if (col) {
      const r = await q(conn, `SELECT COUNT(*) c FROM budget_items b LEFT JOIN projects p ON ${col.startsWith("`") ? col : `\`${col}\``} = p.id WHERE ${col.startsWith("`") ? col : `\`${col}\``} IS NOT NULL AND p.id IS NULL`);
      console.log(`  budget_items.${col} -> projects: ${r[0].c} orphans`);
    } else console.log("  budget_items: sem coluna project*");
  }
  if (peCols.length > 0) {
    const pCol = peCols.find((c) => /project/i.test(c));
    if (pCol) {
      const r = await q(conn, `SELECT COUNT(*) c FROM production_entries pe LEFT JOIN projects p ON pe.\`${pCol}\` = p.id WHERE pe.\`${pCol}\` IS NOT NULL AND p.id IS NULL`);
      console.log(`  production_entries.${pCol} -> projects: ${r[0].c} orphans`);
    }
    const wCol = peCols.find((c) => /wbs/i.test(c));
    if (wCol) {
      const r = await q(conn, `SELECT COUNT(*) c FROM production_entries pe LEFT JOIN wbs_nodes w ON pe.\`${wCol}\` = w.id WHERE pe.\`${wCol}\` IS NOT NULL AND w.id IS NULL`);
      console.log(`  production_entries.${wCol} -> wbs_nodes: ${r[0].c} orphans`);
    }
    const uCol = peCols.find((c) => /unit/i.test(c));
    if (uCol) {
      const r = await q(conn, `SELECT COUNT(*) c FROM production_entries pe LEFT JOIN production_units u ON pe.\`${uCol}\` = u.id WHERE pe.\`${uCol}\` IS NOT NULL AND u.id IS NULL`);
      console.log(`  production_entries.${uCol} -> production_units: ${r[0].c} orphans`);
    }
  }
  // wbs duplicatas (coluna de ref interna, auto-detect por candidatos)
  const refCandidates = wbsCols.filter((c) => /eap|ref|code|uid/i.test(c));
  for (const c of refCandidates) {
    try {
      const r = await q(conn, `SELECT projectId, \`${c}\` v, COUNT(*) cnt FROM wbs_nodes WHERE \`${c}\` IS NOT NULL GROUP BY projectId, \`${c}\` HAVING cnt > 1 LIMIT 5`);
      if (r.length === 0) console.log(`  wbs_nodes: sem duplicatas por ${c}`);
      else { console.log(`  !! wbs duplicatas por ${c}:`); for (const d of r) console.log(`     project=${d.projectId} ${c}=${d.v} x${d.cnt}`); }
    } catch {
      console.log(`  ${c}: nao consultavel`);
    }
  }

  await conn.end();
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });