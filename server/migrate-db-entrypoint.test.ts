import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";

// O entrypoint e um script de topo com top-level await, conexao real e
// `process.exit`. Aqui o `mysql2` e simulado para roda-lo de verdade.
//
// Isso nao e preciosismo: o bug do 3o deploy foi um `const` usado antes da
// declaracao (TDZ) no laco diagnostico do entrypoint. `node --check` aceita
// TDZ, e o teste que so lia o arquivo como texto nao podia pegar. So a
// execucao pega.
const alvos = vi.hoisted(() => ({ conn: null as unknown }));

vi.mock("mysql2/promise", () => ({
  createConnection: async () => alvos.conn,
}));

const MIGRATIONS_TABLE = "__drizzle_migrations";
const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
const ultimo = migrations[migrations.length - 1].folderMillis;

type Cenario = {
  /** "vazio" | "normal" | "legado" */
  banco: "vazio" | "normal" | "legado";
  jaAplicado: number | null;
  /** DDL que ja esta no banco, em `tipo:tabela[.nome]` */
  presentes: string[];
};

function conexaoFake(cenario: Cenario) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const presentes = new Set(cenario.presentes);
  // O journal reflete o que o banco ja registrou: todas as migracoes ate
  // `jaAplicado`, nao so a ultima.
  const registradas: number[] =
    cenario.jaAplicado === null
      ? []
      : migrations
          .map(m => m.folderMillis)
          .filter(f => f <= (cenario.jaAplicado as number));

  const log = () => {};

  function chaveDe(sql: string, params: unknown[]): string | null {
    if (/INFORMATION_SCHEMA\.(COLUMNS|TABLE_CONSTRAINTS|STATISTICS)/.test(sql)) {
      const tipo = sql.includes("COLUMNS")
        ? "coluna"
        : sql.includes("TABLE_CONSTRAINTS")
          ? "constraint"
          : "index";
      return `${tipo}:${params[0]}.${params[1]}`;
    }
    // "esta tabela existe?" e a unica consulta em TABLES com `AS found`.
    // Sem este caso, CREATE TABLE de tabela ja existente era reexecutado.
    if (/INFORMATION_SCHEMA\.TABLES/.test(sql) && /AS found/.test(sql)) {
      return `table:${params[0]}`;
    }
    return null;
  }

  return {
    queries,
    registradas,
    log,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });

      if (/CREATE TABLE IF NOT EXISTS `__drizzle_migrations`/.test(sql)) {
        return [[], []];
      }
      if (new RegExp(`INSERT INTO \`${MIGRATIONS_TABLE}\``).test(sql)) {
        registradas.push(Number(params[1]));
        return [{ affectedRows: 1 }, []];
      }
      if (new RegExp(`SELECT COUNT\\(\\*\\) AS n, MAX\\(created_at\\) AS last`).test(sql)) {
        return [
          [
            {
              n: registradas.length,
              last: registradas.length ? Math.max(...registradas) : null,
            },
          ],
          [],
        ];
      }
      if (new RegExp(`SELECT created_at FROM \`${MIGRATIONS_TABLE}\``).test(sql)) {
        // No cenario legado a PRIMEIRA leitura vem vazia (e o que define o
        // caminho). A releitura, feita depois das insercoes, tem de devolver o
        // que foi gravado — senao o entrypoint acha que nada foi registrado.
        const ehReleitura = /LIMIT 1/.test(sql);
        if (cenario.banco === "legado" && !ehReleitura) return [[], []];
        return [
          registradas.length
            ? registradas.map(c => ({ created_at: c })).reverse()
            : [],
          [],
        ];
      }
      if (/SELECT COUNT\(\*\) AS n FROM INFORMATION_SCHEMA.TABLES/.test(sql)) {
        return [[{ n: 40 }], []];
      }
      // A listagem inicial de tabelas NAO e a consulta de "esta tabela existe?".
      // As duas batem em INFORMATION_SCHEMA.TABLES; o que as separa e o
      // `AS found ... LIMIT 1` da segunda.
      if (
        /INFORMATION_SCHEMA\.TABLES WHERE TABLE_SCHEMA/.test(sql) &&
        !/AS found/.test(sql)
      ) {
        const nomes =
          cenario.banco === "vazio"
            ? []
            : ["projects", "schedule_activities", MIGRATIONS_TABLE];
        return [nomes.map(TABLE_NAME => ({ TABLE_NAME })), []];
      }

      const chave = chaveDe(sql, params);
      if (chave) return [presentes.has(chave) ? [{ found: 1 }] : [], []];

      return [[], []];
    },
    async end() {},
  };
}

const logs: string[] = [];

async function rodar(cenario: Cenario) {
  logs.length = 0;
  const conn = conexaoFake(cenario);
  (alvos as { conn: unknown }).conn = conn;
  vi.resetModules();
  process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/testdb";
  await import("../scripts/migrate-db.mjs");
  return conn;
}

beforeAll(() => {
  // O entrypoint escreve tudo via console.log.
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    logs.push(a.map(x => String(x)).join(" "));
  });
  // E chama process.exit(1) em falha; num teste isso aborta o runner inteiro.
  // Nenhum cenario aqui deveria chegar la, mas se um dia chegar a suíte nao
  // pode morrer junto.
  const original = process.exit;
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code}) — o entrypoint falhou`);
  }) as never);
  return () => original;
});

afterAll(() => {
  vi.restoreAllMocks();
  delete process.env.DATABASE_URL;
});

describe("migrate-db.mjs roda do inicio ao fim", () => {
  it("banco normal com a 0001 pendente conclui sem ReferenceError", async () => {
    const conn = await rodar({
      banco: "normal",
      jaAplicado: 1790603791243,
      presentes: [],
    });
    // o laudo diagnostico do entrypoint roda com `pending`; se voltasse a usar
    // `aAplicar` (declarado mais abaixo) estouraria TDZ aqui.
    expect(logs.join("\n")).toContain("banco normal");
    expect(conn.registradas).toContain(1790776191243);
  });

  it("estado real de producao: pula o que ja foi aplicado e conclui o resto", async () => {
    const conn = await rodar({
      banco: "normal",
      jaAplicado: 1790603791243,
      presentes: [
        "coluna:schedule_activities.mustStartOn",
        "coluna:schedule_activities.finishNoLaterThan",
        "coluna:schedule_activities.freeFloat",
        "table:work_calendars",
      ],
    });
    expect(conn.registradas).toContain(1790776191243);
    const saida = logs.join("\n");
    if (process.env.DUMP) { process.stderr.write("SAIDA:\n" + saida); process.stderr.write("DDL:\n" + ddl); }
    expect(saida).toMatch(/4 ja existente\(s\)/);
    // a FK e o CREATE da segunda tabela foram executados
    const ddl = conn.queries.map(q => q.sql).join("\n");
    expect(ddl).toContain("work_calendars_projectId_projects_id_fk");
    expect(ddl).toContain("CREATE TABLE `calendar_exceptions`");
  });

  it("banco vazio aplica tudo do zero", async () => {
    const conn = await rodar({ banco: "vazio", jaAplicado: null, presentes: [] });
    expect(conn.registradas).toHaveLength(migrations.length);
  });

  it("banco legado marca as migracoes sem reexecutar DDL", async () => {
    const conn = await rodar({ banco: "legado", jaAplicado: null, presentes: [] });
    if (process.env.DUMP) { process.stderr.write("SAIDA LEGADO:\n" + logs.join("\n")); process.stderr.write("DDL LEGADO:\n" + conn.queries.map(q=>q.sql.slice(0,60)).join("\n")); }
    expect(logs.join("\n")).toContain("BASELINE");
    expect(conn.registradas).toHaveLength(migrations.length);
    const ddl = conn.queries.map(q => q.sql).join("\n");
    expect(ddl).not.toContain("CREATE TABLE `projects`");
  });

  it("nada pendente nao escreve DDL nem registra", async () => {
    const jaRegistradas = migrations.map(m => m.folderMillis);
    const conn = await rodar({ banco: "normal", jaAplicado: ultimo, presentes: [] });
    expect(conn.registradas).toEqual(jaRegistradas);
    expect(logs.join("\n")).toContain("nada pendente");
  });
});
