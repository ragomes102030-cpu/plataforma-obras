/**
 * Auditoria de schema para o PostgreSQL — lê o catálogo e confronta com o que as
 * migrations deste repo declaram.
 *
 * POR QUE ELA BARRA (POLITICA ATUAL)
 *
 * A versao anterior informava e nao barrava, e desligava-se por completo quando
 * `USE_SUPABASE=1`. Agora ela BARRA: havendo divergencia, sai com codigo != 0.
 * Combinada com o `&&` do startCommand e com o healthcheck em `/readyz`, o
 * Render nao promove um deploy cujo schema nao confere — e o deploy anterior
 * continua servindo, entao a disponibilidade e preservada.
 *
 * Se a divergencia precisar ser tolerada pontualmente, o caminho e
 * `AUDIT_ALLOW_DIVERGENCE=1` (explicito e auditavel), nao desligar a auditoria.
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
import { pathToFileURL } from "node:url";

// A auditoria NAO se desliga em producao.
//
// Antes, com USE_SUPABASE=1 (o modo em que a aplicacao conecta como usuario
// read-only no Supabase), imprimia
// "auditoria de startup desativada" e saia com 0 — o passo de auditoria do
// startCommand nao auditava nada, e divergencia de schema subia como deploy
// verde. Agora ela roda, e divergencia faz o processo sair com codigo != 0.

const MIGRATIONS_FOLDER = "drizzle";
const JOURNAL = join(MIGRATIONS_FOLDER, "meta", "_journal.json");

export function runtimeDatabaseUrl() {
  return process.env.DATABASE_URL;
}

/** As entradas do journal, na ordem em que o drizzle as aplicaria. */
export function entradasDoJournal(pasta = MIGRATIONS_FOLDER) {
  const caminho = join(pasta, "meta", "_journal.json");
  if (!existsSync(caminho)) return [];
  const journal = JSON.parse(readFileSync(caminho, "utf-8"));
  return journal.entries ?? [];
}

/** Os arquivos de migration, na ordem do journal. */
export function migrationsDoJournal(pasta = MIGRATIONS_FOLDER) {
  return entradasDoJournal(pasta).map(e => `${e.tag}.sql`);
}

/**
 * Quais migrations do journal ainda não foram registradas em
 * `__drizzle_migrations`.
 *
 * A comparação é por TIMESTAMP (`when` do journal == `created_at` da tabela),
 * não por contagem. Contagem já mentiu neste projeto: havia 20 linhas para 10
 * migrations (duplicatas), e "número de linhas" batia por acidente enquanto a
 * `0012` nunca chegou ao banco.
 *
 * `registradas: null` significa "a tabela nem existe" — o que também é
 * pendência, e não "nada a verificar".
 */
export function migracoesPendentes({ journalEntries = [], registradas = null } = {}) {
  if (registradas === null) return journalEntries.map(e => e.tag);
  const gravadas = new Set(registradas.map(Number));
  return journalEntries.filter(e => !gravadas.has(Number(e.when))).map(e => e.tag);
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

    for (const m of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\);/g)) {
      const [, tabela, corpo] = m;
      const cols = out.get(tabela) ?? new Set();
      for (const c of corpo.matchAll(/^\s*"([^"]+)"/gm)) cols.add(c[1]);
      out.set(tabela, cols);
    }

    // A aspa tem de vir DEPOIS do `(?:ONLY\s+)?`: o DDL real escreve
    // `ALTER TABLE "projects" ADD COLUMN ...`, e a versão anterior exigia
    // `ALTER TABLE "` + `ONLY` — nunca casava, e as colunas criadas por
    // ALTER TABLE ficavam invisíveis para a auditoria (ela dizia "banco
    // confere" com a coluna faltando). Cobre também o `ALTER TABLE` com o
    // ADD COLUMN na linha seguinte (`\s+` casa a quebra de linha).
    for (const m of sql.matchAll(
      /ALTER TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi
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

  // As 40 sequences de identidade. Até 22/10/2026 esta conferência rodava no
  // BOOT: `scripts/migrate-pg.mjs` executava um bloco DO com `setval` a cada
  // start do container. Com o migrate fora do boot, ela passa a morar aqui — o
  // CI roda esta auditoria em todo PR, então uma sequence atrás do MAX(id) vira
  // erro legível no PR em vez de `duplicate key` no primeiro INSERT do cliente.
  // O risco real é carga/transferência de dados com id explícito: o Postgres
  // avança a sequence no INSERT com DEFAULT, nunca no INSERT com id.
  const seqRes = await conn.query(`
    SELECT c.relname AS tabela,
           a.attname AS coluna,
           COALESCE(s.last_value, 0) AS last_value,
           (xpath('/row/m/text()',
                  query_to_xml(
                    format('select coalesce(max(%I),0) as m from %I.%I', a.attname, n.nspname, c.relname),
                    false, true, '')))[1]::text::bigint AS max_id
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_sequences s
      ON s.schemaname = n.nspname
     AND s.sequencename = regexp_replace(
           pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname),
           '^.*\\.', '')
    WHERE n.nspname = current_schema()
      AND c.relkind = 'r'
      AND a.attidentity IN ('a', 'd')
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY 1, 2
  `);
  const sequencesAtrasadas = seqRes.rows
    .filter(r => Number(r.max_id) > Number(r.last_value))
    .map(r => `${r.tabela}.${r.coluna} (sequence ${r.last_value} < max ${r.max_id})`);

  const idxRes = await conn.query(
    "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema()"
  );
  const indices = [...new Set(idxRes.rows.map(r => `${r.tablename}.${r.indexname}`))].sort();

  // O journal diz o que o repositorio pede; `__drizzle_migrations` diz o que o
  // banco recebeu. Sob `USE_SUPABASE=1` o app conecta como `arquimedes_app`
  // (read-only, sem DDL), entao uma migration nova NAO e aplicada no boot — e o
  // `migrate-pg.mjs` sai com codigo 0 antes de tentar. Sem esta conferencia, a
  // 0013 nasceria no repo, nao no banco, e nada reclamaria: exatamente o
  // incidente de 12/10, so que sem sintoma.
  // A comparacao e por timestamp, e nao por quantidade, porque contagem ja
  // mentiu aqui (duplicatas deixavam o numero "certo").
  let journal = { registradas: 0, ultima: 0 };
  let pendentes = [];
  const entradas = entradasDoJournal(pasta);
  if (tabelasBanco.has("__drizzle_migrations")) {
    const jr = await conn.query(
      'SELECT COUNT(*) AS n, MAX(created_at) AS last FROM "__drizzle_migrations"'
    );
    journal = { registradas: Number(jr.rows[0].n), ultima: Number(jr.rows[0].last) };
    const datasRes = await conn.query('SELECT created_at FROM "__drizzle_migrations"');
    pendentes = migracoesPendentes({
      journalEntries: entradas,
      registradas: datasRes.rows.map(r => Number(r.created_at)),
    });
  } else {
    pendentes = migracoesPendentes({ journalEntries: entradas, registradas: null });
  }

  // "Tabela a mais no banco" entra como AVISO, nao como divergencia fatal. Das
  // cinco categorias, quatro sao de OBJETO AUSENTE — e ausencia e o que quebra a
  // aplicacao (foi a causa do incidente de 12/10: a 0012 nunca chegou ao banco).
  // Tabela sobrando nao derruba nada. Somadas na mesma lista, uma sobra benigna
  // de QA deixava o guard vermelho de forma cronica — e guard cronicamente
  // vermelho e o que ensina a ignorar o guard, que foi como a auditoria sumiu
  // da ultima vez. Removida a sobra (qa_eap_*_backup_20261014), este aviso some.
  const divergencias = [];
  const avisos = [];
  if (faltandoTabelas.length)
    divergencias.push(
      `${faltandoTabelas.length} tabela(s) ausente(s): ${faltandoTabelas.join(", ")}`
    );
  if (colunasFaltando.length)
    divergencias.push(
      `${colunasFaltando.length} coluna(s) ausente(s): ${colunasFaltando.slice(0, 10).join(", ")}`
    );
  if (sobrandoTabelas.length)
    avisos.push(
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
  if (sequencesAtrasadas.length)
    divergencias.push(
      `${sequencesAtrasadas.length} sequence(s) de identidade atrasada(s): ${sequencesAtrasadas.slice(0, 10).join(", ")}` +
        " — o proximo INSERT com DEFAULT vai colidir; sincronize com `pnpm db:migrate`"
    );
  if (pendentes.length)
    divergencias.push(
      `${pendentes.length} migration(oes) no repo que o banco NAO registrou: ${pendentes.join(", ")}` +
        " — o deploy nao aplica DDL (USE_SUPABASE=1); aplique como owner antes de subir"
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
    `sequences: ${seqRes.rows.length} de identidade` +
      (sequencesAtrasadas.length
        ? ` | ATRASADAS: ${sequencesAtrasadas.length}`
        : " | nenhuma atrasada"),
    `indices: ${indices.length}`,
    `journal: ${journal.registradas} migration(oes) registrada(s), ultima = ${journal.ultima}` +
      (pendentes.length ? ` | PENDENTES: ${pendentes.join(", ")}` : " | nenhuma pendente"),
    ...(colunasFaltando.length ? [`colunas: ${colunasFaltando.length} ausente(s)`] : []),
  ];

  return {
    ok: divergencias.length === 0,
    linhas,
    divergencias,
    avisos,
    tabelasNoBanco: tabelasBanco.size,
    enumsNoBanco: tiposBanco.size,
    triggersNoBanco: triggersBanco.size,
    journal,
    pendentes,
  };
}

// ------------------------------------------------------------------ main ----
// Este arquivo e um modulo: exporta as funcoes puras de conferencia E roda
// como programa quando invocado direto (`node scripts/audit-schema-pg.mjs`,
// que e o que `pnpm db:audit` faz). Antes so existia a parte de modulo, entao
// o comando rodava o arquivo e nao auditava nada.
//
// A saida de erro (codigo != 0) e o que permite o deploy falhar em vez de
// seguir com schema divergente.
async function main() {
  const { default: pg } = await import("pg");
  const raw = runtimeDatabaseUrl();
  if (!raw) {
    console.error("[audit] sem DATABASE_URL; nada a auditar.");
    process.exit(1);
  }
  // Mesma CA e mesma política TLS autenticada da regressão EAP.
  // Elimina divergências entre os dois jobs no GitHub Actions.
  const { configurarConexaoEap, diagnosticoCertificado } =
    await import("./aurora-eap-db-tls.mjs");
  const conn = new pg.Client(configurarConexaoEap(raw));

  try {
    await conn.connect();
  } catch (error) {
    console.error("[audit] falha ao conectar:", diagnosticoCertificado(error));
    process.exit(1);
  }

  const r = await auditarSchema({ conn });
  for (const linha of r.linhas) console.log(`[audit] ${linha}`);
  for (const aviso of r.avisos) console.warn(`[audit] AVISO (nao fatal): ${aviso}`);
  await conn.end();

  if (!r.ok) {
    console.warn("[audit] DIVERGENCIA: o banco nao confere com as migracoes deste repo.");
    for (const d of r.divergencias) console.warn(`[audit]   ${d}`);
    if (process.env.AUDIT_ALLOW_DIVERGENCE === "1") {
      console.warn("[audit] AUDIT_ALLOW_DIVERGENCE=1: divergencia tolerada por decisao explicita.");
      process.exit(0);
    }
    process.exit(1);
  }

  console.log(
    `[audit] banco confere com as migracoes (${r.tabelasNoBanco} tabela(s), ` +
      `${r.enumsNoBanco} enum(s), ${r.triggersNoBanco} trigger(s)).`
  );
  process.exit(0);
}

// Só executa quando invocado como programa — importá-lo (migrate-pg.mjs faz
// isso) não pode disparar a auditoria nem um process.exit.
const invocadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoDiretamente) {
  main().catch(error => {
    console.error("[audit] erro inesperado:", error?.message ?? String(error));
    process.exit(1);
  });
}
