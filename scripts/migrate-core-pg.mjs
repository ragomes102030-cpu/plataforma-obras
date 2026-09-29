/**
 * Núcleo da aplicação de migrações no PostgreSQL, sem I/O de rede e sem
 * `process.exit`.
 *
 * Fica separado de `migrate-pg.mjs` para poder ser importado e executado de
 * verdade nos testes, com uma conexão falsa. A versão MySQL deste arquivo
 * nasceu do mesmo jeito: o `migrate-db.mjs` era um script de topo com
 * top-level await, impossível de exercitar sem subir um banco.
 *
 * O QUE MUDA EM RELAÇÃO AO MySQL
 *
 *   1. `information_schema` devolve os nomes das colunas em minúscula. O
 *      `TABLE_SCHEMA = DATABASE()` não existe: o schema corrente é
 *      `current_schema()`.
 *   2. Índice não está em `information_schema`. O MySQL tem `STATISTICS`; no
 *      PostgreSQL o caminho é a view `pg_indexes`.
 *   3. O parametro posicional é `$1`, e não `?`.
 *   4. Aparece um alvo que não existia: o TIPO de enum. `CREATE TYPE` cria um
 *      tipo nomeado no schema, e conferi-lo exige `pg_type`.
 *   5. Aparece a TRIGGER, que substitui o `ON UPDATE CURRENT_TIMESTAMP` do MySQL.
 *   6. `conn.query` no `pg` devolve um `QueryResult` com `.rows`; o `mysql2`
 *      devolvia a tupla `[rows, fields]`.
 *
 * O que NÃO muda é a ideia: cada statement é conferido antes de rodar, para que
 * um deploy interrompido no meio não repita o que já entrou.
 */

/**
 * Consulta de existência por tipo de DDL.
 *
 * Cada entrada é `{ sql, params }` com a ORDEM dos parâmetros já decidida aqui.
 * A ordem não é uniforme — `pg_indexes` filtra por tabela e depois por índice,
 * `information_schema.triggers` também — e centralizar isso aqui evita que cada
 * chamada invente a sua.
 */
export const CONSULTA_POR_TIPO = {
  table: {
    sql:
      "SELECT 1 FROM information_schema.tables" +
      " WHERE table_schema = current_schema() AND table_name = $1",
    params: alvo => [alvo.tabela],
  },
  coluna: {
    sql:
      "SELECT 1 FROM information_schema.columns" +
      " WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2",
    params: alvo => [alvo.tabela, alvo.nome],
  },
  constraint: {
    sql:
      "SELECT 1 FROM information_schema.table_constraints" +
      " WHERE constraint_schema = current_schema() AND table_name = $1 AND constraint_name = $2",
    params: alvo => [alvo.tabela, alvo.nome],
  },
  index: {
    // `information_schema` não expõe índice no PostgreSQL. A view `pg_indexes`
    // é o caminho oficial e devolve `schemaname`, `tablename` e `indexname`.
    sql:
      "SELECT 1 FROM pg_indexes" +
      " WHERE schemaname = current_schema() AND tablename = $1 AND indexname = $2",
    params: alvo => [alvo.tabela, alvo.nome],
  },
  type: {
    // Alvo novo desta porta. `CREATE TYPE` cria um tipo nomeado no schema, e a
    // coluna que o usa só existe se o tipo existir. Sem esta conferência, um
    // baseline interrompido entre o `CREATE TYPE` e a tabela reexecutaria o tipo
    // e falharia com `type "x" already exists`.
    sql:
      "SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace" +
      " WHERE t.typname = $1 AND n.nspname = current_schema()",
    params: alvo => [alvo.nome],
  },
  trigger: {
    sql:
      "SELECT 1 FROM information_schema.triggers" +
      " WHERE trigger_schema = current_schema()" +
      " AND event_object_table = $1 AND trigger_name = $2",
    params: alvo => [alvo.tabela, alvo.nome],
  },
  funcao: {
    sql:
      "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace" +
      " WHERE p.proname = $1 AND n.nspname = current_schema()",
    params: alvo => [alvo.nome],
  },
};

/**
 * Reconhece o DDL que as migrations deste repo usam e devolve o alvo a conferir.
 * Devolve `null` para o que não for DDL rastreável, e nesses casos o statement é
 * executado sem conferência.
 */
export function alvoDoStatement(stmt) {
  const criarTabela = stmt.match(
    /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/
  );
  if (criarTabela) return { tipo: "table", tabela: criarTabela[1] };

  // O `AS ENUM` é o que distingue o tipo nomeado de uma tabela. Um `CREATE TYPE`
  // sem ele (tipo composto, dominio) não existe nas migrations deste repo, e
  // cair em `null` manteria a semântica de "executa sem conferência".
  const criarTipo = stmt.match(
    /^\s*CREATE\s+TYPE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s+AS\s+ENUM/i
  );
  if (criarTipo) return { tipo: "type", nome: criarTipo[1] };

  const addColuna = stmt.match(
    /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i
  );
  if (addColuna) return { tipo: "coluna", tabela: addColuna[1], nome: addColuna[2] };

  // `ALTER COLUMN` muda a definição de uma coluna que já existe, então o alvo é
  // a coluna e a conferência de existência NÃO serve: a coluna está lá antes e
  // depois. Sem esta linha, o statement cairia em `null` e rodaria sem
  // conferência em todo retry — que é exatamente o defeito que a versão MySQL
  // já tinha e que estes testes existem para não voltar.
  const alteraColuna = stmt.match(
    /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+ALTER\s+COLUMN\s+"([^"]+)"/i
  );
  if (alteraColuna) return { tipo: "coluna", tabela: alteraColuna[1], nome: alteraColuna[2] };

  const addConstraint = stmt.match(
    /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+ADD\s+(?:CONSTRAINT\s+)?"([^"]+)"/i
  );
  if (addConstraint)
    return { tipo: "constraint", tabela: addConstraint[1], nome: addConstraint[2] };

  const criarIndex = stmt.match(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+|IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:ONLY\s+)?"([^"]+)"/i
  );
  if (criarIndex) return { tipo: "index", tabela: criarIndex[2], nome: criarIndex[1] };

  // `CREATE TRIGGER` carrega o nome antes do `ON`, e o `BEFORE UPDATE` vem
  // depois. O nome vem primeiro porque é assim que o PostgreSQL escreve.
  const criarTrigger = stmt.match(
    /^\s*CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+"([^"]+)"[\s\S]*?\bON\s+"([^"]+)"/i
  );
  if (criarTrigger) return { tipo: "trigger", tabela: criarTrigger[2], nome: criarTrigger[1] };

  const criarFuncao = stmt.match(
    /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"([^"]+)"\s*\(/i
  );
  if (criarFuncao) return { tipo: "funcao", nome: criarFuncao[1] };

  return null;
}

export function alvoDeConsulta(alvo) {
  const def = CONSULTA_POR_TIPO[alvo.tipo];
  if (!def) throw new Error(`tipo de DDL nao mapeado: ${alvo.tipo}`);
  return def;
}

/** Monta a consulta de verificação. Exportada para o teste poder ler o SQL. */
export function queryDeExistencia(alvo) {
  const def = alvoDeConsulta(alvo);
  return { sql: def.sql, params: def.params(alvo) };
}

export function criarVerificador(conn) {
  return async function jaExiste(alvo) {
    const { sql, params } = queryDeExistencia(alvo);
    const resultado = await conn.query(sql, params);
    // O `pg` devolve um `QueryResult` com `.rows`. Desestruturar como
    // `[rows]` — o jeito do `mysql2` — daria `undefined`, e `undefined.length`
    // estoura. Pior: se algum dia virar `resultado.length`, daria `undefined > 0`
    // e a conferência passaria a dizer que NADA existe, reexecutando tudo.
    const linhas = resultado?.rows;
    return Array.isArray(linhas) && linhas.length > 0;
  };
}

/**
 * Aplica as migrations que ainda não constam no journal.
 *
 * O PostgreSQL tem transação como o MySQL, e DDL é transacional como o MySQL
 * não é: um `CREATE TABLE` falha junto com o resto do statement. Isso parece
 * mais seguro, e é a razão de o verificador por statement continuar necessário
 * aqui — não pela atomicidade, mas porque a 0001 cria a função e 23 triggers em
 * statements separados, e um deploy interrompido entre eles deixa o banco num
 * estado que o próximo deploy precisa reconhecer.
 *
 * @param jaAplicado último `created_at` registrado, ou null se nenhuma
 * @returns o que foi aplicado, statement a statement
 */
export async function aplicarMigracoes({
  conn,
  migrations,
  jaAplicado,
  migrationsTable = "__drizzle_migrations",
  log = () => {},
}) {
  // A tabela de registro e criada AQUI, e nao no entrypoint.
  //
  // No primeiro deploy ela faltava no caminho de banco VAZIO, e o efeito foi
  // este, inteiro, em producao:
  //
  //   [migrate] banco vazio: aplicando 2 migracao(oes) do zero
  //   error: relation "__drizzle_migrations" does not exist      (code 42P01)
  //
  // As 33 tabelas tinham nascido. O container reiniciou, a segunda tentativa
  // caiu no caminho de banco legado — que sempre teve o `CREATE TABLE` — e
  // baselineou. O servico subiu e o caminho, errado. Um banco novo, que e o
  // primeiro deploy de qualquer projeto novo, era justamente o que quebrava.
  //
  // Fica dentro desta funcao por invariante, e nao por convenience: quem grava
  // o que aplicou e quem garante que a tabela onde grava existe. Se o entrypoint
  // precisar lembrar, a proxima chamada que esquecer quebra o deploy do zero.
  // `IF NOT EXISTS` torna isso seguro nos dois caminhos e a cada retry.
  await conn.query(
    `CREATE TABLE IF NOT EXISTS "${migrationsTable}" (` +
      "id serial primary key, hash text not null, created_at bigint)"
  );

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
          `[migrate]   ja aplicado, pulado: ${alvo.tipo} "${alvo.nome ?? alvo.tabela}" em "${alvo.tabela}"`
        );
        continue;
      }
      await conn.query(stmt);
      executados.push(stmt);
    }
    await conn.query(
      `INSERT INTO "${migrationsTable}" ("hash", "created_at") VALUES ($1, $2)`,
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
