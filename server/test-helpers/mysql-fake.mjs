const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Conexao falsa de INFORMATION_SCHEMA. `presentes` usa `tipo:tabela[.nome]`.
 * Cada query e registrada, para o teste poder ler o SQL gerado.
 */
export function conexaoFake({
  banco = "normal",
  jaAplicado = null,
  presentes = [],
  tabelas = null,
} = {}) {
  const queries = [];
  const set = new Set(presentes);
  const registradas =
    jaAplicado === null ? [] : [jaAplicado];

  async function query(sql, params = []) {
    queries.push({ sql: String(sql), params: params.map(String) });

    if (/CREATE TABLE IF NOT EXISTS/.test(sql)) return [[], []];
    if (new RegExp("INSERT INTO `" + MIGRATIONS_TABLE + "`").test(sql)) {
      registradas.push(Number(params[1]));
      return [{ affectedRows: 1 }, []];
    }
    if (/SELECT COUNT\(\*\) AS n, MAX\(created_at\) AS last/.test(sql)) {
      return [
        [{ n: registradas.length, last: registradas.length ? Math.max(...registradas) : null }],
        [],
      ];
    }
    if (new RegExp("SELECT created_at FROM `" + MIGRATIONS_TABLE + "`").test(sql)) {
      const ehReleitura = /LIMIT 1/.test(sql);
      if (banco === "legado" && !ehReleitura) return [[], []];
      return [registradas.length ? registradas.map(c => ({ created_at: c })).reverse() : [], []];
    }
    if (/SELECT COUNT\(\*\) AS n FROM INFORMATION_SCHEMA.TABLES/.test(sql)) {
      return [[{ n: tabelas ? tabelas.length : 34 }], []];
    }
    if (
      /INFORMATION_SCHEMA\.TABLES WHERE TABLE_SCHEMA/.test(sql) &&
      !/AS found/.test(sql) &&
      /TABLE_NAME FROM/.test(sql)
    ) {
      const nomes =
        banco === "vazio"
          ? []
          : tabelas ?? ["projects", "schedule_activities", MIGRATIONS_TABLE];
      return [nomes.map(TABLE_NAME => ({ TABLE_NAME })), []];
    }
    // As 3 colunas da Onda 0.4, em qualquer tabela.
    if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql) && /mustStartOn/.test(sql)) {
      const onda = [
        "mustStartOn",
        "finishNoLaterThan",
        "freeFloat",
      ].filter(c => set.has(`coluna:schedule_activities.${c}`));
      return [onda.map(COLUMN_NAME => ({ TABLE_NAME: "schedule_activities", COLUMN_NAME })), []];
    }

    // Lista as colunas de UMA tabela: TABLE_NAME = ? com 1 param.
    if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql) && /TABLE_NAME = \?/.test(sql)) {
      const tabela = params[0];
      const nomes = [...set]
        .filter(k => k.startsWith(`coluna:${tabela}.`))
        .map(k => k.slice(`coluna:${tabela}.`.length));
      return [nomes.map(COLUMN_NAME => ({ COLUMN_NAME })), []];
    }
    // Consulta de "esta constraint/indice existe?"
    if (/INFORMATION_SCHEMA\.(TABLE_CONSTRAINTS|STATISTICS)/.test(sql)) {
      const tipo = sql.includes("TABLE_CONSTRAINTS") ? "constraint" : "index";
      const chave = `${tipo}:${params[0]}.${params[1]}`;
      return [set.has(chave) ? [{ found: 1 }] : [], []];
    }
    // Consulta de "esta tabela existe?"
    if (/INFORMATION_SCHEMA\.TABLES/.test(sql) && /AS found/.test(sql)) {
      const chave = `table:${params[0]}`;
      return [set.has(chave) ? [{ found: 1 }] : [], []];
    }
    return [[], []];
  }

  return { query, queries, registradas };
}

/** Tabelas e colunas que o repo declara, para montar um banco "saudavel". */
export function tabelasDoRepo(declaradas) {
  return [...declaradas.keys()];
}
