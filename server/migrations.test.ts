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

// A cobertura do schema e verificada sobre a UNIAO de todas as migracoes, nao
// so sobre a primeira. Antes desta regra o teste lia apenas
// `journal.entries[0]`, o que dava cobertura gratis a DDL acrescentado depois
// dentro do proprio 0000_baseline.sql -- um arquivo que o migrator do drizzle
// jamais reexecuta num banco onde o baseline ja consta como aplicado. Era
// exatamente assim que as Ondas 0.2b e 0.4 "passavam" no teste local e
// quebrariam em producao com `Unknown column` / `Table doesn't exist`.
describe("as migracoes cobrem o schema declarado", () => {
  function criadasEmTodas(): Set<string> {
    const criadas = new Set<string>();
    for (const entry of journal.entries) {
      const sql = readMigration(entry.tag);
      for (const m of sql.matchAll(/CREATE TABLE `([^`]+)`/g)) criadas.add(m[1]);
    }
    return criadas;
  }

  function declaradasNoSchema(): Set<string> {
    const schema = readFileSync(join(MIGRATIONS_FOLDER, "schema.ts"), "utf-8");
    return new Set(
      [...schema.matchAll(/mysqlTable\(\s*["']([^"']+)["']/g)].map(m => m[1])
    );
  }

  it("existe e cria todas as tabelas do schema.ts", () => {
    const criadas = criadasEmTodas();
    const declaradas = declaradasNoSchema();
    const faltando = [...declaradas].filter(t => !criadas.has(t));
    expect(
      faltando,
      `tabelas de schema.ts ausentes das migracoes:\n  ${faltando.join("\n  ")}`
    ).toEqual([]);
  });

  it("nao cria tabelas que schema.ts nao declara", () => {
    const criadas = criadasEmTodas();
    const declaradas = declaradasNoSchema();
    const sobrando = [...criadas].filter(t => !declaradas.has(t));
    expect(
      sobrando,
      `tabelas nas migracoes que schema.ts nao declara:\n  ${sobrando.join("\n  ")}`
    ).toEqual([]);
  });
});

// Trava do defeito que a Onda 0.4 introduzia: DDL de schema novo dentro de
// um arquivo de migracao ja aplicado e o drizzle nunca o executa, porque so
// compara `created_at` (drizzle-orm/mysql-core/dialect.js). O pre-deploy passa
// verde e o app quebra em runtime.
describe("DDL novo nao depende de migracao ja aplicada", () => {
  const BASELINE_TAG = "0000_baseline";

  it("existe mais de uma migracao no journal", () => {
    expect(
      journal.entries.length,
      "So o 0000_baseline no journal: qualquer DDL novo acrescentado a ele " +
        "nunca sera aplicado num banco que ja rodou o baseline."
    ).toBeGreaterThan(1);
  });

  it("nenhuma migracao posterior ao baseline ALTERa tabela que ele cria", () => {
    // Uma tabela criada no 0000 e depois alterada na 0001 e legitimo (coluna
    // nova em tabela existente). O que nao pode e re-CREAR tabela do baseline
    // ou mexer em colunas que o schema.ts ja declarava na epoca do 0000.
    const baseline = readMigration(BASELINE_TAG);
    const criadasNoBaseline = new Set(
      [...baseline.matchAll(/CREATE TABLE `([^`]+)`/g)].map(m => m[1])
    );
    const posteriores = journal.entries.filter(e => e.tag !== BASELINE_TAG);
    const recriadas: string[] = [];
    for (const entry of posteriores) {
      const sql = readMigration(entry.tag);
      for (const m of sql.matchAll(/CREATE TABLE `([^`]+)`/g)) {
        if (criadasNoBaseline.has(m[1])) recriadas.push(`${entry.tag}: ${m[1]}`);
      }
    }
    expect(
      recriadas,
      `migracoes posteriores recriando tabela do baseline:\n  ${recriadas.join("\n  ")}`
    ).toEqual([]);
  });

  it("o DDL de 0001_planning nao repete colunas que o baseline ja cria", () => {
    const entry = journal.entries.find(e => e.tag === "0001_planning");
    expect(entry, "0001_planning ausente do journal").toBeDefined();
    const baseline = readMigration(BASELINE_TAG);
    const sql = readMigration(entry!.tag);
    // Colunas declaradas no CREATE TABLE do baseline para schedule_activities
    const bloco = baseline.match(/CREATE TABLE `schedule_activities` \(([\s\S]*?)\n\);/);
    expect(bloco, "nao encontrei o CREATE TABLE de schedule_activities").not.toBeNull();
    const colunasDoBaseline = new Set(
      [...bloco![1].matchAll(/^\s*`([^`]+)`/gm)].map(m => m[1])
    );
    const repetidas = [...sql.matchAll(/ADD COLUMN `([^`]+)`/g)]
      .map(m => m[1])
      .filter(c => colunasDoBaseline.has(c));
    expect(
      repetidas,
      `0001_planning repete coluna que o baseline ja cria ` +
        `(ALTER TABLE falharia com duplicate column):\n  ${repetidas.join("\n  ")}`
    ).toEqual([]);
  });
});

describe("DDL no MySQL e implicit-commit: a aplicacao precisa ser idempotente", () => {
  // Custo real desta trava: o deploy da Onda 0.4 rodou a 0001 e morreu em
  //   ER_DEFAULT_VAL_GENERATED_NAMED_FUNCTION_IS_NOT_ALLOWED (errno 3770)
  // no CREATE TABLE de work_calendars. Como DDL no MySQL faz implicit commit,
  // os tres ALTER TABLE anteriores JA estavam aplicados, mas a migracao nao
  // consta em __drizzle_migrations (o INSERT vem depois de todos os statements).
  // Reexecutar o script sem consertar isso repetiria os ALTER e estouraria com
  // duplicate column -- falha eterna a cada novo deploy.
  const script = readFileSync(join("scripts", "migrate-db.mjs"), "utf-8");

  function statementsDasMigracoes(): string[] {
    const out: string[] = [];
    for (const entry of journal.entries) {
      for (const s of readMigration(entry.tag).split("--> statement-breakpoint")) {
        if (s.trim()) out.push(s.trim());
      }
    }
    return out;
  }

  // Extrai a funcao real do script e a executa. Testar por grep no codigo-fonte
  // era fragil demais: basta uma refatoracao cosmetica (escape, quebra de linha)
  // para o teste passar sem a logica existir.
  function alvoDoStatement(stmt: string): { tipo: string; tabela: string; nome?: string } | null {
    const corpo = script.match(/function alvoDoStatement\(stmt\) \{[\s\S]*?\n\}/);
    if (!corpo) throw new Error("alvoDoStatement nao encontrada em scripts/migrate-db.mjs");
    const fn = eval(`(${corpo[0].replace("function alvoDoStatement", "function")})`);
    return fn(stmt);
  }

  it("o script nao importa nem chama migrate() do drizzle", () => {
    // migrate() do drizzle aplica tudo em uma transacao e aborta no primeiro
    // erro, sem tolerar DDL ja aplicado.
    expect(script).not.toMatch(/import\s*\{[^}]*\bmigrate\b[^}]*\}\s*from/);
    expect(script).not.toMatch(/await\s+migrate\s*\(/);
  });

  it("consulta INFORMATION_SCHEMA antes de aplicar cada statement", () => {
    expect(script).toMatch(/INFORMATION_SCHEMA/);
    expect(script).toMatch(/TABLE_SCHEMA\s*=\s*DATABASE\(\)/);
  });

  it("a checagem de existencia e de fato chamada, e nao apenas definida", () => {
    // Check de presenca de texto passaria mesmo com o call site removido: foi
    // exatamente o que aconteceu na primeira versao deste teste. Aqui conta-se
    // quantas vezes `jaExiste` aparece -- definicao + call site.
    const ocorrencias = (script.match(/jaExiste\s*\(/g) ?? []).length;
    expect(
      ocorrencias,
      "jaExiste aparece so na definicao: o loop de aplicacao nao esta " +
        "consultando o estado do banco, entao a migracao volta a ser nao " +
        "idempotente (falha eterna com duplicate column)"
    ).toBeGreaterThanOrEqual(2);
  });

  it("o loop de aplicacao pula o statement quando o alvo ja existe", () => {
    // O `continue` dentro da guarda de existencia e o que torna a aplicacao
    // idempotente. Sem ele, o statement e reexecutado.
    const laudo = script.match(/if\s*\(\s*alvo\s*&&[\s\S]{0,600}?continue;/);
    expect(
      laudo,
      "o loop de aplicacao nao pula statement ja aplicado " +
        "(falta `continue` na guarda de existencia)"
    ).not.toBeNull();
  });

  it.each([
    ["CREATE TABLE `x` (", "table", "x", undefined],
    ["ALTER TABLE `x` ADD COLUMN `c` timestamp NULL;", "coluna", "x", "c"],
    ["ALTER TABLE `x` ADD `c` timestamp NULL;", "coluna", "x", "c"],
    ["ALTER TABLE `x` ADD CONSTRAINT `fk` FOREIGN KEY (`a`) REFERENCES `y`(`id`);", "constraint", "x", "fk"],
    ["CREATE INDEX `i` ON `x` (`a`);", "index", "x", "i"],
    ["CREATE UNIQUE INDEX `i` ON `x` (`a`);", "index", "x", "i"],
  ])("reconhece %s", (stmt, tipo, tabela, nome) => {
    const alvo = alvoDoStatement(stmt as string)!;
    expect(alvo).not.toBeNull();
    expect(alvo.tipo).toBe(tipo);
    expect(alvo.tabela).toBe(tabela);
    expect(alvo.nome).toBe(nome);
  });

  it("devolve null para statement que nao e DDL rastreavel", () => {
    expect(alvoDoStatement("SELECT 1")).toBeNull();
  });

  it("todo statement das migracoes cai em um dos formatos reconhecidos", () => {
    // Se um statement novo nao for reconhecido, ele passa sem verificacao e
    // volta a ser falha-eterna: o statement silenciosamente nao idempotente.
    const naoReconhecidos = statementsDasMigracoes().filter(s => !alvoDoStatement(s));
    expect(
      naoReconhecidos,
      `statements que a idempotencia nao cobre (falha eterna em retry):\n  ` +
        naoReconhecidos.join("\n  ")
    ).toEqual([]);
  });

  it("nao usa DEFAULT (on_update_current_timestamp()), que o MySQL recusa", () => {
    // `ON UPDATE CURRENT_TIMESTAMP` e atributo de coluna, nao funcao. Como
    // DEFAULT, o MySQL responde ER_DEFAULT_VAL_GENERATED_NAMED_FUNCTION_IS_NOT_ALLOWED.
    const offenders = journal.entries
      .map(e => [e.tag, readMigration(e.tag)] as const)
      .filter(([, sql]) => /on_update_current_timestamp\s*\(\s*\)/i.test(sql))
      .map(([tag]) => tag);
    expect(
      offenders,
      `migracoes com default invalido (errno 3770):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("colunas updatedAt usam a forma DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP", () => {
    const sql = readMigration("0001_planning");
    const comUpdatedAt = [...sql.matchAll(/`updatedAt`[^,\n]*/g)].map(m => m[0]);
    for (const decl of comUpdatedAt) {
      expect(decl).toMatch(/DEFAULT\s+\(now\(\)\)\s+ON UPDATE CURRENT_TIMESTAMP/i);
    }
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
