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

describe("o Dockerfile encontra tudo que copia", () => {
  // Custo real desta trava: o pre-deploy passou de `bootstrap-db.mjs` para
  // `migrate-db.mjs`, o par `bootstrap-db.mjs` + `full-schema.sql` foi
  // removido, e o Dockerfile ainda fazia
  //   COPY scripts/bootstrap-db.mjs ./scripts/bootstrap-db.mjs
  //   COPY drizzle/full-schema.sql ./drizzle/full-schema.sql
  // O deploy de producao morreu em
  //   failed to calculate checksum: "/drizzle/full-schema.sql": not found
  // Nenhum teste local pegou: o unico sinal estava no build da Railway.
  const dockerfile = readFileSync("Dockerfile", "utf-8");

  function sourcesDeCopy(): Array<{ linha: number; fonte: string }> {
    const out: Array<{ linha: number; fonte: string }> = [];
    dockerfile.split(/\r?\n/).forEach((linha, i) => {
      const copia = linha.match(/^\s*COPY\s+(.*)$/);
      if (!copia) return;
      // `COPY --from=build ...` le de outro estagio, nao do disco do repo.
      if (copia[1].includes("--from")) return;
      // O ultimo token e o destino; o resto sao fontes.
      const tokens = copia[1].trim().split(/\s+/).slice(0, -1);
      for (const fonte of tokens) out.push({ linha: i + 1, fonte });
    });
    return out;
  }

  it("tem linhas COPY para verificar", () => {
    expect(sourcesDeCopy().length).toBeGreaterThan(0);
  });

  it.each(sourcesDeCopy().map(s => [s.fonte, s.linha] as const))(
    "a fonte %s (linha %i) existe no repo",
    (fonte, linha) => {
      // Glob (ex.: drizzle/*.sql) e diretorio com barra final.
      const limpo = fonte.replace(/\/+$/, "");
      if (/[*?[]/.test(limpo)) {
        const padre = limpo.split("/").slice(0, -1).join("/");
        expect(
          existeAlgum(limpo),
          `Dockerfile:${linha} — glob "${fonte}" nao casa com nada`
        ).toBe(true);
        return;
      }
      expect(
        existsSync(limpo),
        `Dockerfile:${linha} — fonte "${fonte}" nao existe. ` +
          `O build de producao falha com 'not found' e nenhum teste local acusa.`
      ).toBe(true);
    }
  );

  function existeAlgum(padrao: string): boolean {
    const partes = padrao.split("/");
    const nome = partes[partes.length - 1];
    const dir = partes.slice(0, -1).join("/") || ".";
    if (!existsSync(dir)) return false;
    const re = new RegExp(
      "^" + nome.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$"
    );
    return readdirSync(dir).some(f => re.test(f));
  }
});

describe("o runtime recebe o que o pre-deploy precisa", () => {
  it("o pre-deploy do Railway aponta para o script de migracao", () => {
    const railway = JSON.parse(readFileSync("railway.json", "utf-8")) as {
      deploy: { preDeployCommand?: string[] };
    };
    expect(railway.deploy.preDeployCommand).toEqual(["node scripts/migrate-db.mjs"]);
  });

  it("o script do pre-deploy esta na imagem de runtime", () => {
    const dockerfile = readFileSync("Dockerfile", "utf-8");
    expect(dockerfile).toMatch(/COPY\s+scripts\/migrate-db\.mjs\s/);
  });

  it("o runtime recebe o journal que o script le", () => {
    // O estagio de build copia `drizzle/` para compilar o bundle, mas o
    // pre-deploy roda no estagio de runtime. Se `drizzle/meta/` faltar la,
    // `migrate-db.mjs` aborta — o que e o comportamento desejado, desde que
    // o Dockerfile realmente entregue o arquivo.
    const runtime = readFileSync("Dockerfile", "utf-8").split(/FROM\s+node:22-slim\s+AS\s+runtime/)[1] ?? "";
    expect(runtime).toMatch(/COPY\s+drizzle\/\s+\.\/drizzle\//);
  });

  it("nao ha bootstrap em DDL no boot do servidor", () => {
    // `ensureUsersTable`/`ensurePlanVersionSchema` faziam DDL no start.
    // Se voltarem, a divergencia entre codigo e banco deixa de aparecer.
    const core = readFileSync(join("server", "_core", "index.ts"), "utf-8");
    const ddl = core.match(/CREATE\s+TABLE|ALTER\s+TABLE/gi);
    expect(ddl, `DDL no boot do servidor:\n  ${(ddl ?? []).join("\n  ")}`).toBeNull();
  });
});
