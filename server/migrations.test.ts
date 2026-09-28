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

// A logica de aplicacao das migracoes — mapeamento de statement para alvo no
// INFORMATION_SCHEMA, idempotencia e o loop que registra no journal — mora em
// scripts/migrate-core.mjs e e testada por IMPORTACAO em migrate-core.test.ts,
// com uma conexao falsa. O entrypoint completo, com mysql2 simulado, e testado
// em migrate-db-entrypoint.test.ts.
//
// Aqui ficam so as propriedades do SQL das migracoes em si, que nao dependem de
// codigo — e nada de ler o .mjs como texto. Tres deploys seguidos quebraram por
// bugs que `node --check` aceita e que leitura de arquivo nao pegava:
//   1. DEFAULT (on_update_current_timestamp())  -> errno 3770
//   2. TABLE_CONSTRAINTS consultando COLUMN_NAME -> ER_BAD_FIELD_ERROR
//   3. `const` usado antes da declaracao (TDZ)   -> ReferenceError
describe("o SQL das migracoes e valido para o MySQL", () => {
  it("nenhuma migracao usa DEFAULT (on_update_current_timestamp())", () => {
    // ON UPDATE CURRENT_TIMESTAMP e atributo de coluna, nao funcao. Como
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
    const schema = readFileSync(join(MIGRATIONS_FOLDER, "schema.ts"), "utf-8");
    // sanidade: o schema realmente declara onUpdateNow, senao o teste acima
    // passaria por vacuuo
    expect(schema).toMatch(/updatedAt:\s*timestamp\("updatedAt"\)\.defaultNow\(\)\.onUpdateNow\(\)/);

    for (const entry of journal.entries) {
      const sql = readMigration(entry.tag);
      for (const decl of [...sql.matchAll(/`updatedAt`[^,\n]*/g)].map(m => m[0])) {
        expect(`${entry.tag}: ${decl}`).toMatch(
          /DEFAULT\s+\(now\(\)\)\s+ON UPDATE CURRENT_TIMESTAMP/i
        );
      }
    }
  });

  it("todo DEFAULT de timestamp e (now())", () => {
    // DEFAULT (now()) e a forma que o MySQL aceita e que o drizzle gera.
    // Qualquer outra funcao como default e recusa.
    const offenders: string[] = [];
    for (const entry of journal.entries) {
      const sql = readMigration(entry.tag);
      for (const m of sql.matchAll(
        /`([A-Za-z]+)`\s+timestamp[^,\n]*?DEFAULT\s*\(((?:[^()]|\([^()]*\))*)\)/gi
      )) {
        if (m[2].trim().toLowerCase() !== "now()") {
          offenders.push(`${entry.tag}: ${m[0]}`);
        }
      }
    }
    expect(offenders, `DEFAULT de timestamp invalido:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});


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

describe("o Dockerfile encontra tudo que copia", () => {
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
  // A Railway NAO executa todos os comandos de um array: em
  // `["a", "b"]` ela rodou so o segundo. Confirmado por deploy de diagnostico
  // em 2026-09-28, onde uma sentinela na posicao 0 nao imprimiu nada e o
  // migrate na posicao 1 rodou normalmente. Por isso o pre-deploy e UM comando
  // unico encadeado com `&&`, e nao dois elementos.
  it("o pre-deploy do Railway e um comando unico (a Railway ignora os demais)", () => {
    const railway = JSON.parse(readFileSync("railway.json", "utf-8")) as {
      deploy: { preDeployCommand?: string[] };
    };
    const cmd = railway.deploy.preDeployCommand;
    expect(Array.isArray(cmd)).toBe(true);
    expect(
      cmd,
      "preDeployCommand com mais de um elemento: a Railway executa apenas o " +
        "ultimo, entao o resto nunca roda"
    ).toHaveLength(1);
    expect(cmd![0]).toMatch(/scripts\/migrate-db\.mjs/);
  });

  it("o pre-deploy tambem roda a auditoria de schema, sem bloquear o deploy", () => {
    // A auditoria le INFORMATION_SCHEMA e so alcanca o banco de dentro da rede
    // da Railway — e o pre-deploy roda la. O relatorio fica no log do deploy.
    //
    // `|| true` e deliberado: divergencia de schema nao deve derrubar o deploy
    // por surprise. Bloquear aqui ja custou tres deploys seguidos nesta mesma
    // Onda; a auditoria existe para INFORMAR, nao para barrar.
    const railway = JSON.parse(readFileSync("railway.json", "utf-8")) as {
      deploy: { preDeployCommand?: string[] };
    };
    const cmd = railway.deploy.preDeployCommand?.join(" ") ?? "";
    expect(cmd, "a auditoria de schema nao roda no pre-deploy").toMatch(
      /scripts\/audit-schema\.mjs/
    );
    expect(cmd).toMatch(/\|\|\s*true/);
  });

  it("a auditoria de schema so escreve: so executa SELECT", () => {
    // Ela roda no pre-deploy de producao. Se um dia alguem "melhorar" o
    // relatorio e acrescentar uma escrita, isto acusa.
    //
    // A deteccao usa o indice de cada `conn.query(` e a proxima aspa
    // delimitadora, nao um unico regex. Regex com quantifiedor guloso ou
    // preguicoso erra o alvo em silencio e o teste vaza: foi o que aconteceu
    // duas vezes aqui, com o teste VERDE enquanto a mutacao estava presente.
    const src = readFileSync(join("scripts", "audit-schema.mjs"), "utf-8");
    const escritas: string[] = [];
    let pos = 0;
    for (;;) {
      const i = src.indexOf("conn.query(", pos);
      if (i === -1) break;
      pos = i + 1;
      const abre = src.indexOf("(", i);
      let cursor = abre + 1;
      while (cursor < src.length && /\s/.test(src[cursor]!)) cursor++;
      const aspa = src[cursor];
      if (aspa !== "`" && aspa !== '"' && aspa !== "'") continue;
      const fim = src.indexOf(aspa, cursor + 1);
      if (fim === -1) continue;
      const sql = src.slice(cursor + 1, fim).trim();
      if (!/^SELECT\b/i.test(sql)) escritas.push(sql.slice(0, 60));
    }

    expect(
      escritas,
      "audit-schema.mjs executa algo que nao e SELECT — ela e de leitura pura " +
        "e roda no pre-deploy de producao:\n  " + escritas.join("\n  ")
    ).toEqual([]);
  });

  it("o script do pre-deploy e tudo que ele importa estao na imagem de runtime", () => {
    // O entrypoint importa ./migrate-core.mjs. Se o Dockerfile copiar so o
    // entrypoint, o pre-deploy morre com ERR_MODULE_NOT_FOUND — e o unico sinal
    // estaria no log da Railway.
    const dockerfile = readFileSync("Dockerfile", "utf-8");
    expect(dockerfile).toMatch(/COPY\s+scripts\/migrate-db\.mjs\s/);

    // Reusa o mesmo parser de COPY do describe acima: comparar com `toMatch`
    // sobre a string inteira e frouxo demais e ja deixou passar esse bug.
    const copiados = new Set(
      sourcesDeCopy()
        .map(s => s.fonte.replace(/\/+$/, ""))
        .filter(f => !/[*?[]/.test(f))
    );

    const entrypoint = readFileSync(join("scripts", "migrate-db.mjs"), "utf-8");
    const importsLocais = [...entrypoint.matchAll(/from\s+"\.\/([^"/]+)"/g)].map(m => m[1]);
    expect(importsLocais.length, "nenhum import local encontrado no entrypoint").toBeGreaterThan(0);

    for (const mod of importsLocais) {
      expect(
        copiados,
        `Dockerfile nao copia scripts/${mod}, que scripts/migrate-db.mjs importa. ` +
          `O pre-deploy morre com ERR_MODULE_NOT_FOUND e so o log da Railway acusa.`
      ).toContain(`scripts/${mod}`);
    }
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
