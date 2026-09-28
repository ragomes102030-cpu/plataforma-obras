// Guarda de regressao das migracoes.
//
// Existe porque as 22 migracoes antigas do Drizzle NUNCA FUNCIONARAM. Aplicadas
// do zero, quebravam com ER_TOO_LONG_IDENT: o drizzle gerava nomes de chave
// estrangeira como
// `activity_resource_allocations_activityId_schedule_activities_id_fk`
// (67 caracteres) e o MySQL aceita no maximo 64. O unico schema que existiu
// veio de `full-schema.sql`, corrigido a mao — e o pre-deploy achava que as
// migracions eram a fonte da verdade. Ninguem discovered isso porque as
// migracoes nunca foram executadas.
//
// Estes testes existem para que a proxima migracao gerada seja verificada
// localmente, em segundos, em vez de no pre-deploy de producao.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_FOLDER = "drizzle";
const JOURNAL = join(MIGRATIONS_FOLDER, "meta", "_journal.json");

// MySQL: maximum identifier length is 64 characters. Exceeding it is
// ER_TOO_LONG_IDENT (errno 1059), and it aborts the whole migration.
const MYSQL_MAX_IDENTIFIER = 64;

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

const journal = JSON.parse(readFileSync(JOURNAL, "utf-8")) as {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

const migrationFilesOnDisk = readdirSync(MIGRATIONS_FOLDER)
  .filter(f => f.endsWith(".sql"))
  .sort();

function readMigration(tag: string): string {
  return readFileSync(join(MIGRATIONS_FOLDER, `${tag}.sql`), "utf-8");
}

describe("migracoes do drizzle", () => {
  it("o journal declara o dialeto mysql", () => {
    expect(journal.dialect).toBe("mysql");
  });

  it("tem pelo menos uma migracao", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("cada entrada do journal tem o arquivo .sql correspondente", () => {
    const faltando = journal.entries
      .map(e => `${e.tag}.sql`)
      .filter(f => !existsSync(join(MIGRATIONS_FOLDER, f)));
    expect(faltando).toEqual([]);
  });

  it("nao ha arquivo .sql orfao (fora do journal)", () => {
    const referenciados = new Set(journal.entries.map(e => `${e.tag}.sql`));
    const orfaos = migrationFilesOnDisk.filter(f => !referenciados.has(f));
    expect(orfaos).toEqual([]);
  });

  it("os timestamps `when` sao estritamente crescentes", () => {
    // O migrator do drizzle so compara `folderMillis` com o MAX(created_at)
    // ja registrado. Se o `when` nao cresce, migracoes novas ficam
    // silenciosamente pendentes para sempre.
    const whens = journal.entries.map(e => e.when);
    const ordenados = [...whens].sort((a, b) => a - b);
    expect(whens).toEqual(ordenados);
    expect(new Set(whens).size).toBe(whens.length);
  });

  it("os idx sao sequenciais a partir de zero", () => {
    expect(journal.entries.map(e => e.idx)).toEqual(
      journal.entries.map((_, i) => i)
    );
  });
});

describe("identificadores das migracoes", () => {
  it.each(migrationFilesOnDisk.map(f => [f] as const))(
    "%s nao tem identificador acima de 64 caracteres",
    file => {
      const sql = readMigration(file.replace(/\.sql$/, ""));
      const identificadores = [...sql.matchAll(/`([^`]+)`/g)].map(m => m[1]);
      const longos = [...new Set(identificadores)]
        .filter(id => id.length > MYSQL_MAX_IDENTIFIER)
        .sort();
      expect(
        longos,
        `identificadores longos demais (MySQL aborta com ER_TOO_LONG_IDENT):\n` +
          longos.map(id => `  ${id.length}  ${id}`).join("\n")
      ).toEqual([]);
    }
  );
});

describe("a migracao baseline cobre o schema declarado", () => {
  const baseline = journal.entries[0];

  it("existe e cria todas as tabelas do schema.ts", () => {
    const sql = readMigration(baseline.tag);
    const criadas = new Set(
      [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map(m => m[1])
    );
    const schema = readFileSync(join(MIGRATIONS_FOLDER, "schema.ts"), "utf-8");
    const declaradas = new Set(
      [...schema.matchAll(/mysqlTable\(\s*["']([^"']+)["']/g)].map(m => m[1])
    );
    const faltando = [...declaradas].filter(t => !criadas.has(t));
    expect(
      faltando,
      `tabelas de schema.ts ausentes no baseline:\n  ${faltando.join("\n  ")}`
    ).toEqual([]);
  });

  it("nao cria tabelas que schema.ts nao declara", () => {
    const sql = readMigration(baseline.tag);
    const criadas = new Set(
      [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map(m => m[1])
    );
    const schema = readFileSync(join(MIGRATIONS_FOLDER, "schema.ts"), "utf-8");
    const declaradas = new Set(
      [...schema.matchAll(/mysqlTable\(\s*["']([^"']+)["']/g)].map(m => m[1])
    );
    const sobrando = [...criadas].filter(t => !declaradas.has(t));
    expect(
      sobrando,
      `tabelas no baseline que schema.ts nao declara:\n  ${sobrando.join("\n  ")}`
    ).toEqual([]);
  });
});
