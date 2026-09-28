// Verificacao de Onda 0.1: provar que as migracoes do Drizzle produzem, do
// zero, um schema EQUIVALENTE ao que o banco real tem — nao apenas com as
// mesmas tabelas, mas as mesmas colunas, os mesmos indices e as mesmas
// chaves estrangeiras.
//
// Sem essa equivalencia nao da para apagar o caminho antigo (o
// `full-schema.sql`, que era o unico que funcionava) com seguranca.
//
// Cria um schema descartavel, aplica as migracoes, compara, e remove o
// schema no fim — inclusive em caso de erro.
import { createConnection } from "mysql2/promise";
import { spawnSync } from "node:child_process";

const TEST_SCHEMA = "mig_test_onda0";
const REF = "railway";

if (!process.env.ROOT_URL || !process.env.APP_URL_TEMPLATE) {
  console.error("[verify] ROOT_URL ou APP_URL_TEMPLATE ausentes");
  process.exit(1);
}

const root = await createConnection({ uri: process.env.ROOT_URL });

async function describe(schema) {
  const [cols] = await root.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_KEY
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [schema]
  );
  const [idx] = await root.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    [schema]
  );
  const [fks] = await root.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
            REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
    [schema]
  );

  return {
    tabelas: new Set(cols.map(r => r.TABLE_NAME)),
    colunas: cols.map(r =>
      [r.TABLE_NAME, r.COLUMN_NAME, r.COLUMN_TYPE, r.IS_NULLABLE, String(r.COLUMN_DEFAULT), r.EXTRA, r.COLUMN_KEY].join("|")
    ),
    indices: idx.map(r =>
      [r.TABLE_NAME, r.INDEX_NAME, r.NON_UNIQUE, r.SEQ_IN_INDEX, r.COLUMN_NAME].join("|")
    ),
    fks: fks.map(r =>
      [r.TABLE_NAME, r.CONSTRAINT_NAME, r.COLUMN_NAME, r.REFERENCED_TABLE_NAME, r.REFERENCED_COLUMN_NAME].join("|")
    ),
  };
}

function diff(label, a, b) {
  const setB = new Set(b);
  const soEmA = a.filter(x => !setB.has(x));
  if (soEmA.length === 0) {
    console.log(`  ${label}: identico (${a.length})`);
    return 0;
  }
  console.log(`  ${label}: ${soEmA.length} divergencia(s) no banco real:`);
  for (const x of soEmA.slice(0, 25)) console.log(`    - ${x}`);
  if (soEmA.length > 25) console.log(`    ... e mais ${soEmA.length - 25}`);
  return soEmA.length;
}

const real = await describe(REF);
console.log(
  `[verify] banco real: ${real.tabelas.size} tabelas, ${real.colunas.length} colunas, ` +
    `${real.indices.length} entradas de indice, ${real.fks.length} chaves estrangeiras`
);

await root.query(`DROP DATABASE IF EXISTS ${TEST_SCHEMA}`);
await root.query(`CREATE DATABASE ${TEST_SCHEMA}`);
await root.query(`GRANT ALL PRIVILEGES ON ${TEST_SCHEMA}.* TO 'plataforma_obras_app'@'%'`);
await root.query("FLUSH PRIVILEGES");

let divergences = 0;
let ok = false;
try {
  const res = spawnSync(process.execPath, ["scripts/migrate-db.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.APP_URL_TEMPLATE.replace("{schema}", TEST_SCHEMA),
    },
    encoding: "utf-8",
  });
  process.stdout.write((res.stdout ?? "").split("\n").filter(l => l.startsWith("[migrate]")).join("\n") + "\n");
  if (res.status !== 0) {
    process.stderr.write((res.stderr ?? "").split("\n").slice(0, 12).join("\n") + "\n");
    throw new Error(`migrate-db.mjs saiu com codigo ${res.status}`);
  }

  const novo = await describe(TEST_SCHEMA);
  console.log(
    `[verify] banco novo: ${novo.tabelas.size} tabelas, ${novo.colunas.length} colunas, ` +
      `${novo.indices.length} entradas de indice, ${novo.fks.length} chaves estrangeiras`
  );
  console.log("[verify] comparando banco real x banco recem-criado:");

  const tabelasSoNoReal = [...real.tabelas].filter(t => !novo.tabelas.has(t));
  if (tabelasSoNoReal.length) {
    console.log(`  tabelas: ${tabelasSoNoReal.length} so no banco real -> ${tabelasSoNoReal.join(", ")}`);
  } else {
    console.log(`  tabelas: identico (${real.tabelas.size})`);
  }

  divergences += tabelasSoNoReal.length;
  divergences += diff("colunas", real.colunas, novo.colunas);
  divergences += diff("indices", real.indices, novo.indices);
  divergences += diff("chaves estrangeiras", real.fks, novo.fks);

  ok = divergences === 0;
  console.log(
    ok
      ? "[verify] OK: os dois schemas sao equivalentes."
      : `[verify] DIVERGENCIA TOTAL: ${divergences} item(ns).`
  );
} finally {
  await root.query(`DROP DATABASE IF EXISTS ${TEST_SCHEMA}`);
  console.log(`[verify] schema ${TEST_SCHEMA} removido`);
  await root.end();
}

process.exit(ok ? 0 : 1);
