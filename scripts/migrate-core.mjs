/**
 * Nucleo da aplicacao de migracoes, sem I/O de rede e sem `process.exit`.
 *
 * Fica separado de `migrate-db.mjs` para poder ser importado e executado de
 * verdade nos testes, com uma conexao falsa. Isso nao e detalhe: tres deploys
 * seguidos quebraram por bugs que `node --check` nao ve e que teste baseado em
 * leitura de texto nao pegava --
 *
 *   1. `DEFAULT (on_update_current_timestamp())`, recusado pelo MySQL (errno 3770)
 *   2. TABLE_CONSTRAINTS consultado com COLUMN_NAME, coluna inexistente
 *   3. `const aAplicar` usado antes da declaracao (TDZ), que `node --check`
 *      aceita e so estoura em runtime
 *
 * As tres estavam em `migrate-db.mjs`, um script de topo com top-level await:
 * impossivel de exercitar sem subir um MySQL.
 */

/** Tabela do INFORMATION_SCHEMA e coluna de filtro para cada tipo de DDL. */
export const CONSULTA_POR_TIPO = {
  table: { tabela: "TABLES", coluna: null },
  coluna: { tabela: "COLUMNS", coluna: "COLUMN_NAME" },
  constraint: { tabela: "TABLE_CONSTRAINTS", coluna: "CONSTRAINT_NAME" },
  index: { tabela: "STATISTICS", coluna: "INDEX_NAME" },
};

/** Colunas reais de cada tabela do INFORMATION_SCHEMA, para teste cruzado. */
export const COLUNAS_INFORMATION_SCHEMA = {
  TABLES: ["TABLE_CATALOG", "TABLE_SCHEMA", "TABLE_NAME", "TABLE_TYPE"],
  COLUMNS: [
    "TABLE_SCHEMA",
    "TABLE_NAME",
    "COLUMN_NAME",
    "ORDINAL_POSITION",
    "COLUMN_DEFAULT",
  ],
  TABLE_CONSTRAINTS: [
    "CONSTRAINT_CATALOG",
    "CONSTRAINT_SCHEMA",
    "CONSTRAINT_NAME",
    "TABLE_SCHEMA",
    "TABLE_NAME",
    "CONSTRAINT_TYPE",
  ],
  STATISTICS: [
    "TABLE_SCHEMA",
    "TABLE_NAME",
    "NON_UNIQUE",
    "INDEX_NAME",
    "SEQ_IN_INDEX",
    "COLUMN_NAME",
  ],
};

/**
 * Reconhece os formatos de DDL que as migracoes deste repo usam e devolve o
 * alvo a conferir no INFORMATION_SCHEMA. Devolve `null` para o que nao for DDL
 * rastreavel, e nesses casos o statement e executado sem verificacao.
 */
export function alvoDoStatement(stmt) {
  const criarTabela = stmt.match(
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/i
  );
  if (criarTabela) return { tipo: "table", tabela: criarTabela[1] };

  const addColuna = stmt.match(
    /^\s*ALTER\s+TABLE\s+`([^`]+)`\s+ADD\s+(?:COLUMN\s+)?`([^`]+)`/i
  );
  if (addColuna) return { tipo: "coluna", tabela: addColuna[1], nome: addColuna[2] };

  // `MODIFY COLUMN` e `CHANGE COLUMN` mudam a definicao de uma coluna que
  // ja existe, entao o alvo e a coluna, e a verificacao de existencia nao
  // serve: a coluna la esta antes e depois.
  //
  // Sem esta linha, `MODIFY COLUMN` caia em `null` e o statement era
  // executado sem verificacao em todo retry. O teste de migracoes reprova
  // isso ("statements sem verificacao"), e com razao: a garantia de que o
  // retry termina e a mesma que sustenta o resto do runner.
  const alteraColuna = stmt.match(
    /^\s*ALTER\s+TABLE\s+`([^`]+)`\s+(?:MODIFY|CHANGE|ALTER)\s+(?:COLUMN\s+)?`([^`]+)`/i
  );
  if (alteraColuna) return { tipo: "coluna", tabela: alteraColuna[1], nome: alteraColuna[2] };

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

export function alvoDeConsulta(alvo) {
  const def = CONSULTA_POR_TIPO[alvo.tipo];
  if (!def) throw new Error(`tipo de DDL nao mapeado: ${alvo.tipo}`);
  return def;
}

/** Monta a query de verificacao. Exportada para o teste poder ler o SQL. */
export function queryDeExistencia(alvo) {
  const { tabela, coluna } = alvoDeConsulta(alvo);
  return {
    sql:
      `SELECT 1 AS found FROM INFORMATION_SCHEMA.${tabela}` +
      ` WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?` +
      (coluna ? ` AND ${coluna} = ?` : "") +
      ` LIMIT 1`,
    params: coluna ? [alvo.tabela, alvo.nome] : [alvo.tabela],
  };
}

export function criarVerificador(conn) {
  return async function jaExiste(alvo) {
    const { sql, params } = queryDeExistencia(alvo);
    const [rows] = await conn.query(sql, params);
    return rows.length > 0;
  };
}

/**
 * Aplica as migracoes que ainda nao constam no journal.
 *
 * DDL no MySQL faz implicit commit: se um statement falha no meio, os anteriores
 * JA ficam no banco, mas a migracao nao e registrada (o INSERT vem depois de
 * todos os statements). Sem a checagem por statement, reexecutar o script
 * repetiria os ja aplicados e estouraria com `duplicate column` -- falha eterna
 * a cada novo deploy.
 *
 * @param jaAplicado ultimo `created_at` registrado, ou null se nenhuma
 * @returns o que foi aplicado, statement a statement
 */
export async function aplicarMigracoes({
  conn,
  migrations,
  jaAplicado,
  migrationsTable = "__drizzle_migrations",
  log = () => {},
}) {
  const aAplicar =
    jaAplicado === null || jaAplicado === undefined
      ? migrations
      : migrations.filter(m => m.folderMillis > jaAplicado);

  const jaExiste = criarVerificador(conn);
  const relatorio = [];

  for (const m of aAplicar) {
    const executados = [];
    const pulados = [];
    for (const stmt of m.sql) {
      if (!stmt.trim()) continue;
      const alvo = alvoDoStatement(stmt);
      if (alvo && (await jaExiste(alvo))) {
        pulados.push(alvo);
        log(
          `[migrate]   ja aplicado, pulado: ${alvo.tipo} \`${alvo.nome ?? alvo.tabela}\` em \`${alvo.tabela}\``
        );
        continue;
      }
      await conn.query(stmt);
      executados.push(stmt);
    }
    await conn.query(
      `INSERT INTO \`${migrationsTable}\` (\`hash\`, \`created_at\`) VALUES (?, ?)`,
      [m.hash, m.folderMillis]
    );
    relatorio.push({ folderMillis: m.folderMillis, executados, pulados });
    log(
      `[migrate] aplicada ${m.folderMillis}: ${executados.length} executado(s), ${pulados.length} ja existente(s)`
    );
  }

  if (relatorio.length === 0) log("[migrate] nada pendente; nenhum DDL executado.");

  return { aAplicar, relatorio };
}
