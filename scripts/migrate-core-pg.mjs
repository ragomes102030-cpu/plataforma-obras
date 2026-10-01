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

/** O mesmo statement, sem as linhas de comentario. */
export function semComentarios(sql) {
  return sql
    .split("\n")
    .filter(linha => !linha.trim().startsWith("--"))
    .join("\n")
    .trim();
}

/**
 * Verifica, migration a migration, se o DDL declarado está INTEIRO no banco.
 *
 * POR QUE ISTO EXISTE
 *
 * O journal diz quais migrations JÁ FORAM aplicadas. Ele não diz se o que elas
 * declararam está no banco — e as duas coisas divergiram em produção:
 *
 *   [migrate] banco normal: 2 migration(oes) aplicada(s), 0 pendente(s)
 *   [audit] triggers: 23 declaradas, 0 no banco | AUSENTES: (todas)
 *
 * A migration 0001 estava registrada como aplicada e nenhuma das 23 triggers
 * existia. O motivo: o deploy anterior CRASHOU no `INSERT` de registro, depois
 * de o DDL ter executado; a tentativa seguinte leu o banco como legado e
 * baselineou as duas migrations sem reexecutar nada. O `/readyz` respondeu
 * "ok" com 34 tabelas.
 *
 * Nenhum teste via antes. O de DDL aplicava as migrations do zero, e nesse
 * caminho nada falta. O que falta é o MEIO: banco marcado como aplicado e DDL
 * ausente.
 *
 * O QUE ESTE FAZ
 *
 * Para cada migration que o journal considera aplicada, confere se TODOS os
 * alvos de DDL que ela declara existem. Se falta um, a migration é devolvida
 * como pendente de reaplicação — o verificador por statement dela pula o que já
 * está lá e cria só o que falta, que é exatamente o que `CREATE TRIGGER` faz
 * quando a tabela existe e a trigger não.
 */
export async function verificarSeDdlEstaNoBanco({ conn, migrations, jaAplicado }) {
  const jaExiste = criarVerificador(conn);
  const marcadas = migrations.filter(m => m.folderMillis <= jaAplicado);
  const pendentes = [];

  for (const m of marcadas) {
    const faltando = [];

    for (const stmt of m.sql) {
      // O comentario de cabecalho vem grudado no primeiro statement quando o
      // arquivo nao separa os dois por `--> statement-breakpoint`.
      //
      // Isso e o que crashed em producao. O `alvoDoStatement` devolvia `null`
      // para o bloco, e `null` significa "executar sem conferencia" — certo. Mas
      // na conferencia ele era tratado como "objeto sem alvo", e o primeiro
      // statement da 0000, que e `CREATE TYPE "users_role"`, ficava sem
      // conferida. A reaplicacao tentava todos os `CREATE TYPE` de novo e o
      // banco recusava com `42710 type "users_role" already exists`, derrubando o
      // deploy.
      //
      // O comentario nao e objeto, entao nao entra na pergunta ao catalogo.
      const limpo = semComentarios(stmt);
      if (!limpo) continue;

      const alvo = alvoDoStatement(limpo);
      // Um statement sem alvo reconhecivel nao pode ser conferido sem chutar.
      // Dizer que falta seria fabricar divergencia; dizer que esta inteiro seria
      // confiar. Fica de fora, e a auditoria reporta a lacuna.
      if (!alvo) continue;

      if (!(await jaExiste(alvo))) faltando.push(alvo);
    }

    if (faltando.length > 0) pendentes.push({ folderMillis: m.folderMillis, faltando });
  }

  return { pendentes, tags: pendentes.map(p => p.folderMillis) };
}

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
    /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i
  );
  if (addColuna) return { tipo: "coluna", tabela: addColuna[1] ?? addColuna[2], nome: addColuna[3] };

  // `ALTER COLUMN` muda a definição de uma coluna que já existe, então o alvo é
  // a coluna e a conferência de existência NÃO serve: a coluna está lá antes e
  // depois. Sem esta linha, o statement cairia em `null` e rodaria sem
  // conferência em todo retry — que é exatamente o defeito que a versão MySQL
  // já tinha e que estes testes existem para não voltar.
  const alteraColuna = stmt.match(
    /^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+ALTER\s+COLUMN\s+"([^"]+)"/i
  );
  if (alteraColuna) return { tipo: "coluna", tabela: alteraColuna[1] ?? alteraColuna[2], nome: alteraColuna[3] };

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
/**
 * Executa UMA migration, pulando o que o catálogo já contém.
 *
 * Chamada por `aplicarMigracoes` duas vezes, e a segunda é o que conserta o
 * estado do Render:
 *
 *   1. do zero, ou o que ainda não foi aplicado;
 *   2. de novo, quando a conferência disse que algum DDL declarado não está no
 *      banco. O verificador por statement pula o que existe e executa só o que
 *      falta.
 *
 * Por que a segunda passada é separada e não um `IF NOT EXISTS` em todo DDL:
 * `CREATE TYPE` e `CREATE TABLE` do PostgreSQL aceitam `IF NOT EXISTS`, mas
 * `CREATE INDEX` e `CREATE TRIGGER` do drizzle-kit não o recebem, e o
 * `CREATE TYPE "users_role" AS ENUM (...)` que já está no banco não pode ser
 * reescrito sem `DROP TYPE` — que derrubaria as colunas que o usam. Reescrever
 * o DDL para torná-lo idempotente é mudar a migration, e migration aplicada é
 * lei.
 *
 * O verificador por statement é a idempotência, e ele funciona porque cada
 *statement conhece o objeto que cria. Foi a única forma de reaplicar sem tocar
 * nas migrations.
 */
async function executarMigration(conn, m, jaExiste, log) {
  const executados = [];
  const pulados = [];

  for (const stmt of m.sql) {
    const limpo = semComentarios(stmt);
    if (!limpo) continue;

    const alvo = alvoDoStatement(limpo);
    if (alvo && (await jaExiste(alvo))) {
      pulados.push(alvo);
      log(
        `[migrate]   ja aplicado, pulado: ${alvo.tipo} "${alvo.nome ?? alvo.tabela}"` +
          (alvo.tabela ? ` em "${alvo.tabela}"` : "")
      );
      continue;
    }
    await conn.query(limpo);
    executados.push(limpo);
  }

  return { executados, pulados };
}

export async function aplicarMigracoes({
  conn,
  migrations,
  jaAplicado,
  reaplicarMarcadas = false,
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

  // Reaplicar uma migration JA registrada no journal so faz sentido quando o
  // verificador por statement esta ligado: sem ele, o `CREATE TABLE` rodaria de
  // novo e o banco recusaria com `already exists`.
  const aAplicar =
    jaAplicado === null || jaAplicado === undefined
      ? migrations
      : reaplicarMarcadas
        ? migrations
        : migrations.filter(m => m.folderMillis > jaAplicado);

  const jaExiste = criarVerificador(conn);
  const relatorio = [];

  for (const m of aAplicar) {
    const { executados, pulados } = await executarMigration(conn, m, jaExiste, log);

    // Registrar de novo so faz sentido para migration que NAO estava registrada.
    // Reaplicar uma ja registrada (o caminho do `reaplicarMarcadas`) deixaria
    // um registro duplicado, e a contagem do journal passaria a mentir sobre
    // quantas migrations existem.
    const jaRegistrada = (jaAplicado ?? 0) >= m.folderMillis;
    if (!jaRegistrada) {
      await conn.query(
        `INSERT INTO "${migrationsTable}" ("hash", "created_at") VALUES ($1, $2)`,
        [m.hash, m.folderMillis]
      );
    }
    relatorio.push({ folderMillis: m.folderMillis, executados, pulados });
    log(
      `[migrate] aplicada ${m.folderMillis}: ${executados.length} executado(s), ${pulados.length} ja existente(s)`
    );
  }

  if (relatorio.length === 0) log("[migrate] nada pendente; nenhum DDL executado.");

  return { aAplicar, relatorio };
}
