/**
 * Auditoria de schema para o PostgreSQL — lê o catálogo e confronta com o que as
 * migrations deste repo declaram.
 *
 * POR QUE ELA INFORMA E NÃO BARRE
 *
 * Divergência de schema é motivo para investigar, não para impedir deploy
 * automático. Quem decide é o time. A auditoria existiu para transformar
 * "acho que o banco está certo" em contagem — e é isso que ela faz.
 *
 * DUAS MUDANÇAS EM RELAÇÃO AO MySQL
 *
 * 1. A lista de migrations vem do JOURNAL, e não de uma constante
 *    `["0000_baseline.sql", "0001_planning.sql"]`. A constante foi escrita na
 *    época do MySQL e apontava para arquivos que não existem mais; com ela
 *    quebrada, a auditoria comparava o banco com um conjunto vazio e dizia que
 *    estava tudo em dia.
 * 2. `information_schema` devolve as colunas em minúscula, e índice não está
 *    lá: no PostgreSQL o caminho é a view `pg_indexes`.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_FOLDER = "drizzle";
const JOURNAL = join(MIGRATIONS_FOLDER, "meta", "_journal.json");

export function runtimeDatabaseUrl() {
  const raw = process.env.USE_SUPABASE === "1"
    ? (process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL_SUPABASE || process.env.SUPA_DB_URL)
    : process.env.DATABASE_URL;
  if (!raw) return undefined;
  const u = new URL(raw);
  if (process.env.USE_SUPABASE === "1" && u.hostname === "db.tromrvfijbtihuilvnuk.supabase.co") {
    u.hostname = "aws-0-sa-east-1.pooler.supabase.com";
    u.port = "5432";
    if (u.username === "postgres") u.username = "postgres.tromrvfijbtihuilvnuk";
  }
  return u.toString();
}

/** Os arquivos de migration, na ordem do journal. */
export function migrationsDoJournal(pasta = MIGRATIONS_FOLDER) {
  const caminho = join(pasta, "meta", "_journal.json");
  if (!existsSync(caminho)) return [];
  const journal = JSON.parse(readFileSync(caminho, "utf-8"));
  return (journal.entries ?? []).map(e => `${e.tag}.sql`);
}

/**
 * Colunas por tabela, tal como o DDL das migrations declara.
 *
 * Lê o journal em vez de uma lista fixa, e inclui também as colunas que
 * apareceram por `ALTER TABLE` — sem essa parte a auditoria diria que a coluna
 * não existe quando existe, que é o tipo de falso negativo que inutiliza uma
 * auditoria.
 */
export function colunasPorTabela(pasta = MIGRATIONS_FOLDER) {
  const out = new Map();
  for (const arq of migrationsDoJournal(pasta)) {
    const caminho = join(pasta, arq);
    if (!existsSync(caminho)) continue;
    const sql = readFileSync(caminho, "utf-8");

    for (const m of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
      const [, tabela, corpo] = m;
      const cols = out.get(tabela) ?? new Set();
      for (const c of corpo.matchAll(/^\s*"([^"]+)"/gm)) cols.add(c[1]);
      out.set(tabela, cols);
    }

    for (const m of sql.matchAll(
      /ALTER TABLE "(?:ONLY\s+)?"([^"]+)"\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi
    )) {
      const cols = out.get(m[1]) ?? new Set();
      cols.add(m[2]);
      out.set(m[1], cols);
    }
  }
  return out;
}

/** Os tipos de enum declarados pelas migrations, para conferir no catálogo. */
export function tiposDeclarados(pasta = MIGRATIONS_FOLDER) {
  const out = new Set();
  for (const arq of migrationsDoJournal(pasta)) {
    const caminho = join(pasta, arq);
    if (!existsSync(caminho)) continue;
    const sql = readFileSync(caminho, "utf-8");
    for (const m of sql.matchAll(/CREATE TYPE "([^"]+)"\s+AS\s+ENUM/gi)) out.add(m[1]);
  }
  return out;
}

/** As triggers declaradas pelas migrations, como `tabela.nome`. */
export function triggersDeclaradas(pasta = MIGRATIONS_FOLDER) {
  const out = new Set();
  for (const arq of migrationsDoJournal(pasta)) {
    const caminho = join(pasta, arq);
    if (!existsSync(caminho)) continue;
    const sql = readFileSync(caminho, "utf-8");
    for (const m of sql.matchAll(
      /CREATE\s+TRIGGER\s+"([^"]+)"[\s\S]*?\bON\s+"([^"]+)"/gi
    )) {
      out.add(`${m[2]}.${m[1]}`);
    }
  }
  return out;
}

/**
 * Compara o banco com as migrations. `conn` precisa ter `query(sql, params)`
 * no formato do `pg`, isto é, devolvendo `{ rows }`.
 */
export async function auditarSchema({ conn, pasta = MIGRATIONS_FOLDER }) {
  const declaradas = colunasPorTabela(pasta);
  const tipos = tiposDeclarados(pasta);
  const triggers = triggersDeclaradas(pasta);

  const tabelasRes = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
  );
  const tabelasBanco = new Set(tabelasRes.rows.map(r => r.table_name));

  const faltandoTabelas = [...declaradas.keys()].filter(t => !tabelasBanco.has(t)).sort();
  const sobrandoTabelas = [...tabelasBanco]
    .filter(t => !declaradas.has(t) && t !== "__drizzle_migrations")
    .sort();

  // Uma consulta por tabela, listando as colunas existentes. Consultar coluna a
  // coluna seria N consultas e não provaria nada a mais que esta.
  const colunasFaltando = [];
  for (const [tabela, cols] of declaradas) {
    if (!tabelasBanco.has(tabela)) continue;
    const res = await conn.query(
      "SELECT column_name FROM information_schema.columns" +
        " WHERE table_schema = current_schema() AND table_name = $1",
      [tabela]
    );
    const noBanco = new Set(res.rows.map(r => r.column_name));
    for (const c of cols) if (!noBanco.has(c)) colunasFaltando.push(`${tabela}.${c}`);
  }

  // Os 32 tipos de enum. Esta conferência não existia na versão MySQL porque lá
  // o enum vivia dentro do DDL da coluna; aqui ele é um tipo nomeado do schema,
  // e uma coluna que o referencia sem que ele exista quebra no primeiro INSERT.
  const tiposRes = await conn.query(
    "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace" +
      " WHERE n.nspname = current_schema() AND t.typtype = 'e'"
  );
  const tiposBanco = new Set(tiposRes.rows.map(r => r.typname));
  const tiposFaltando = [...tipos].filter(t => !tiposBanco.has(t)).sort();

  // As 23 triggers. Sem elas o `updatedAt` para de se atualizar, e nada no
  // banco denuncia: a coluna continua lá, apenas parada.
  const triggersRes = await conn.query(
    "SELECT trigger_name, event_object_table FROM information_schema.triggers" +
      " WHERE trigger_schema = current_schema()"
  );
  const triggersBanco = new Set(
    triggersRes.rows.map(r => `${r.event_object_table}.${r.trigger_name}`)
  );
  const triggersFaltando = [...triggers].filter(t => !triggersBanco.has(t)).sort();

  const idxRes = await conn.query(
    "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema()"
  );
  const indices = [...new Set(idxRes.rows.map(r => `${r.tablename}.${r.indexname}`))].sort();

  let journal = { registradas: 0, ultima: 0 };
  if (tabelasBanco.has("__drizzle_migrations")) {
    const jr = await conn.query(
      'SELECT COUNT(*) AS n, MAX(created_at) AS last FROM "__drizzle_migrations"'
    );
    journal = { registradas: Number(jr.rows[0].n), ultima: Number(jr.rows[0].last) };
  }

  const divergencias = [];
  if (faltandoTabelas.length)
    divergencias.push(
      `${faltandoTabelas.length} tabela(s) ausente(s): ${faltandoTabelas.join(", ")}`
    );
  if (colunasFaltando.length)
    divergencias.push(
      `${colunasFaltando.length} coluna(s) ausente(s): ${colunasFaltando.slice(0, 10).join(", ")}`
    );
  if (sobrandoTabelas.length)
    divergencias.push(
      `${sobrandoTabelas.length} tabela(s) a mais no banco: ${sobrandoTabelas.join(", ")}`
    );
  if (tiposFaltando.length)
    divergencias.push(
      `${tiposFaltando.length} tipo(s) de enum ausente(s): ${tiposFaltando.join(", ")}`
    );
  if (triggersFaltando.length)
    divergencias.push(
      `${triggersFaltando.length} trigger(s) ausente(s): ${triggersFaltando.join(", ")}`
    );

  const linhas = [
    `tabelas: ${declaradas.size} declaradas, ${tabelasBanco.size} no banco` +
      (faltandoTabelas.length
        ? ` | AUSENTES: ${faltandoTabelas.join(", ")}`
        : " | nenhuma ausente"),
    `enums: ${tipos.size} declarados, ${tiposBanco.size} no banco` +
      (tiposFaltando.length ? ` | AUSENTES: ${tiposFaltando.join(", ")}` : " | nenhum ausente"),
    `triggers: ${triggers.size} declaradas, ${triggersBanco.size} no banco` +
      (triggersFaltando.length ? ` | AUSENTES: ${triggersFaltando.join(", ")}` : " | nenhuma ausente"),
    `indices: ${indices.length}`,
    `journal: ${journal.registradas} migration(oes) registrada(s), ultima = ${journal.ultima}`,
    ...(colunasFaltando.length ? [`colunas: ${colunasFaltando.length} ausente(s)`] : []),
  ];

  return {
    ok: divergencias.length === 0,
    linhas,
    divergencias,
    tabelasNoBanco: tabelasBanco.size,
    enumsNoBanco: tiposBanco.size,
    triggersNoBanco: triggersBanco.size,
    journal,
  };
}
