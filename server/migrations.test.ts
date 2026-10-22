// Guarda de regressao das migracoes.
//
// A guarda nasceu de um problema do MySQL: as 22 migracoes antigas do Drizzle
// NUNCA FUNCIONARAM, porque o drizzle gerava nomes de chave estrangeira como
// `activity_resource_allocations_activityId_schedule_activities_id_fk` (67
// caracteres) e o MySQL aborta acima de 64 com ER_TOO_LONG_IDENT. O unico schema
// que existiu veio de `full-schema.sql`, corrigido a mao — e o pre-deploy achava
// que as migracoes eram a fonte da verdade.
//
// O banco agora e PostgreSQL e as migrations foram reescritas, mas a razao
// permanece: uma migration gerada so e verificada localmente, em segundos, e
// nao no pre-deploy de producao.
//
// E ha uma segunda razao, que e desta porta: o `drizzle-kit generate` emitiu as
// 33 tabelas e NENHUM `CREATE TYPE`, com as colunas de enum apontando para
// tipos que o arquivo nunca criava. Aplicado num banco vazio, o PostgreSQL
// recusaria na primeira tabela. Os testes de cobertura de tabelas nao pegaram
// isso — as tabelas estavam todas la, faltava o que estava entre elas.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_FOLDER = "drizzle";
const JOURNAL = join(MIGRATIONS_FOLDER, "meta", "_journal.json");

// PostgreSQL: `NAMEDATALEN` e 64, e o limite utilizavel e 63 — um caractere a
// menos que o MySQL. Acima disso o PostgreSQL nao aborta: ele TRUNCA o
// identificador e emite um NOTICE. Por isso o teste existe: um nome truncado
// silenciosamente faz o `CREATE TRIGGER` mirar numa tabela que nao existe.
const POSTGRES_MAX_IDENTIFIER = 63;

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

/**
 * O mesmo SQL, sem os comentarios de linha.
 *
 * Necessario porque os proprios cabecalhos das migrations CITAM a sintaxe que
 *-was evitada. A 0001 abre explicando que `ON UPDATE CURRENT_TIMESTAMP` e recurso
 * do MySQL e por isso virou trigger — e o teste que proibe aquela sintaxe
 * acusava o arquivo por causa da explicacao. Um teste que nao distingue o que o
 * banco vai ler do que o humano escreveu ensina a nao explicar.
 *
 * Nao ha aspa simples nem aspa dupla em comentario nestas migrations, entao
 * cortar em `--` ate o fim da linha nao corta conteudo de literal.
 */
function sqlSemComentarios(tag: string): string {
  return readMigration(tag)
    .split(/\r?\n/)
    .map(linha => linha.replace(/--.*$/, ""))
    .join("\n");
}

describe("migracoes do drizzle", () => {
  it("o journal declara o dialeto postgresql", () => {
    expect(journal.dialect).toBe("postgresql");
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
    "%s nao tem identificador acima de 63 caracteres",
    file => {
      const sql = readMigration(file.replace(/\.sql$/, ""));
      // Aspas duplas: o drizzle-kit sempre entreaspalha identificador no
      // PostgreSQL, e o MySQL usava crase.
      const identificadores = [...sql.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      const longos = [...new Set(identificadores)]
        .filter(id => id.length > POSTGRES_MAX_IDENTIFIER)
        .sort();
      expect(
        longos,
        `identificadores longos demais (o PostgreSQL trunca e emite NOTICE):\n` +
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
      for (const m of sql.matchAll(/CREATE TABLE "([^"]+)"/g)) criadas.add(m[1]);
    }
    return criadas;
  }

  function declaradasNoSchema(): Set<string> {
    const schema = readFileSync(join(MIGRATIONS_FOLDER, "schema.ts"), "utf-8");
    return new Set(
      [...schema.matchAll(/pgTable\(\s*["']([^"']+)["']/g)].map(m => m[1])
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

  it("nenhuma migration posterior repete coluna que o baseline ja cria", () => {
    // Este teste nasceu preso a `0001_planning`, uma migration do MySQL que nao
    // existe mais. A intencao dele e geral e vale para qualquer historico: um
    // `ADD COLUMN` de coluna que o `CREATE TABLE` do baseline ja criou faz o
    // `ALTER TABLE` falhar com `column "x" of relation "y" already exists`.
    // Preso ao nome da migration, ele sumiria junto com ela — e o defeito
    // voltaria a passar verde.
    const baseline = readMigration(BASELINE_TAG);

    // Colunas que o baseline cria, por tabela.
    const colunasPorTabela = new Map<string, Set<string>>();
    for (const m of baseline.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
      const colunas = new Set(
        [...m[2]!.matchAll(/^\s*"([^"]+)"/gm)].map(c => c[1]!)
      );
      colunasPorTabela.set(m[1]!, colunas);
    }

    const posteriores = journal.entries.filter(e => e.tag !== BASELINE_TAG);
    expect(posteriores.length, "so existe o baseline, e nao ha o que comparar").toBeGreaterThan(0);

    const repetidas: string[] = [];
    for (const entry of posteriores) {
      const sql = readMigration(entry.tag);
      for (const m of sql.matchAll(/ALTER TABLE "([^"]+)"[\s\S]{0,200}?ADD COLUMN "([^"]+)"/g)) {
        if (colunasPorTabela.get(m[1]!)?.has(m[2]!)) {
          repetidas.push(`${entry.tag}: ${m[1]}.${m[2]}`);
        }
      }
    }
    expect(
      repetidas,
      `migration repetindo coluna que o baseline ja cria ` +
        `(o ALTER TABLE falharia):\n  ${repetidas.join("\n  ")}`
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
// O `drizzle-kit generate` produz DDL que passa em revisao visual e quebra
// no banco. Estes testes pegam isso em segundos, e nao no pre-deploy:
//
//   1. `ON UPDATE CURRENT_TIMESTAMP`    -> nao existe no PostgreSQL
//   2. coluna de enum sem `CREATE TYPE`  -> `type "x" does not exist`
//   3. `updatedAt` sem trigger           -> a coluna para de mudar
describe("o SQL das migracoes e valido para o PostgreSQL", () => {
  it("nenhuma migracao usa ON UPDATE CURRENT_TIMESTAMP", () => {
    // Recurso do MySQL. No PostgreSQL e erro de sintaxe, e a coluna ficaria
    // parada para sempre se alguem contornasse.
    const offenders = journal.entries
      .map(e => [e.tag, sqlSemComentarios(e.tag)] as const)
      .filter(([, sql]) => /ON UPDATE CURRENT_TIMESTAMP/i.test(sql))
      .map(([tag]) => tag);
    expect(offenders, `migracoes com sintaxe de MySQL:\n  ${offenders.join("\n  ")}`).toEqual([]);
  });

  it("todo tipo de enum usado por uma coluna tem o seu CREATE TYPE", () => {
    // Este e o teste que teria pegado o baseline gerado pelo drizzle-kit: ele
    // emitiu 33 `CREATE TABLE` e ZERO `CREATE TYPE`, com as colunas de enum
    // apontando para tipos que o arquivo nunca criava. O banco recusaria na
    // primeira tabela. A cobertura de tabelas nao acusou nada, porque as 33
    // tabelas estavam todas la — o que faltava era o que estava ENTRE elas.
    const criadas = new Set<string>();
    const usadas = new Set<string>();

    for (const entry of journal.entries) {
      const sql = readMigration(entry.tag);
      for (const m of sql.matchAll(/CREATE TYPE "([^"]+)"/g)) criadas.add(m[1]);
      // Linha de coluna cujo tipo e um identificador entre aspas:
      // `"status" "projects_status" NOT NULL`.
      for (const m of sql.matchAll(/^\t"[^"]+" "([^"]+)"[^\n]*$/gm)) usadas.add(m[1]);
    }

    const faltando = [...usadas].filter(t => !criadas.has(t)).sort();
    expect(
      faltando,
      `tipos usados e nunca criados (o banco recusaria com type does not exist):\n` +
        faltando.map(t => `  ${t}`).join("\n")
    ).toEqual([]);
  });

  it("toda tabela com updatedAt no schema tem trigger que a atualiza", () => {
    const schema = readFileSync(join(MIGRATIONS_FOLDER, "schema.ts"), "utf-8");
    const cabecalhos = [...schema.matchAll(/pgTable\(\s*\n?\s*"([A-Za-z0-9_]+)"/g)];
    const comUpdatedAt: string[] = [];
    for (let i = 0; i < cabecalhos.length; i++) {
      const m = cabecalhos[i]!;
      const prox = i + 1 < cabecalhos.length ? cabecalhos[i + 1]!.index! : schema.length;
      if (/\bupdatedAt:\s*timestamp\(/.test(schema.slice(m.index!, prox))) {
        comUpdatedAt.push(m[1]!);
      }
    }

    // Sanidade: lista vazia faria o teste passar por vacuo e dizer que nao falta
    // trigger quando nao existe trigger nenhuma.
    expect(comUpdatedAt.length).toBe(29);

    const sql = journal.entries.map(e => sqlSemComentarios(e.tag)).join("\n");
    const semTrigger = comUpdatedAt.filter(
      tabela => !new RegExp(`CREATE TRIGGER[^;]*BEFORE UPDATE ON "${tabela}"`).test(sql)
    );
    expect(
      semTrigger,
      `tabelas com updatedAt e sem trigger (a coluna ficaria parada):\n` +
        semTrigger.map(t => `  ${t}`).join("\n")
    ).toEqual([]);
  });

  it("todo DEFAULT de timestamp e now()", () => {
    // A captura precisa ser da expressao do DEFAULT, e nao de tudo que vem
    // depois. A primeira versao pegava `now() NOT NULL`, comparava com `now()` e
    // acusava as 72 colunas de timestamp de um baseline que estava correto —
    // um teste que reprova a coisa certa nao trava nada, so cansa.
    const offenders: string[] = [];
    for (const entry of journal.entries) {
      const sql = sqlSemComentarios(entry.tag);
      for (const m of sql.matchAll(
        /"([A-Za-z]+)"\s+timestamp[^,\n]*?DEFAULT\s+(\([^()]*\)|[A-Za-z0-9_]+(?:\(\))?)/gi
      )) {
        // Tira o parêntese que ENVOLVE a expressao, como em `(now())`, e nao o
        // parêntese da propria chamada. Um `replace` de borda solta tirava o `)`
        // de `now()` e produzia `now(`, que reprovava as 72 colunas de um
        // baseline correto.
        const crua = m[2]!.trim().toLowerCase();
        const expressao = (crua.startsWith("(") && crua.endsWith(")")
          ? crua.slice(1, -1)
          : crua
        ).trim();
        if (expressao !== "now()") {
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

describe("o runtime recebe o que a migracao precisa", () => {
  // Hoje a plataforma (Render) builda a partir deste Dockerfile e sobe por
  // `npm start` (runtime docker, ver docs/DEPLOY.md). Ja houve um periodo em que
  // o deploy era Nixpacks e o processo subia pelo `Start Command` do painel —
  // tambem `npm start`.
  //
  // Por isso a cadeia de boot mora em `scripts.start`: e o unico ponto que os
  // DOIS caminhos executam — o `npm start` da plataforma e o `pnpm start` do
  // Dockerfile. Antes ela vivia so no `CMD` do Dockerfile, que nao rodava quando
  // o build era Nixpacks: a migracao e a auditoria nao eram executadas de
  // verdade.
  function scriptStart(): string {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const start = pkg?.scripts?.start;
    if (typeof start !== "string") throw new Error("package.json sem scripts.start");
    return start;
  }

  function cmdDaImagem(): string {
    const dockerfile = readFileSync("Dockerfile", "utf-8");
    const linha = dockerfile.split("\n").find(l => l.trimStart().startsWith("CMD "));
    if (!linha) throw new Error("Dockerfile sem CMD");
    return linha.trim();
  }

  it("o boot nao faz trabalho de banco", () => {
    // Ate 22/10/2026 `start` era `migrate && audit && node dist/index.js` e
    // aplicava DDL a cada start de container. Isso foi tirado do caminho
    // critico: quem aplica DDL e a Management API do Supabase, fora do
    // container, com a credencial de administrador.
    //
    // O que se ganha: um deploy nao pode mais falhar por causa de um script de
    // banco, e o servico nao abre conexao de escrita para subir.
    const cmd = scriptStart();
    expect(cmd).not.toMatch(/migrate-pg\.mjs/);
    expect(cmd).not.toMatch(/audit-schema-pg\.mjs/);
    expect(cmd).toMatch(/node dist\/index\.js/);
  });

  it("a guarda de schema roda no CI, contra o banco de producao", () => {
    // Tirar a auditoria do boot so e seguro se ela continuar rodando ANTES do
    // merge. O job `schema-audit` do ci.yml roda `pnpm db:audit` a cada PR e a
    // cada push na main, com `SUPABASE_DB_URL` real.
    const ci = readFileSync(join(".github", "workflows", "ci.yml"), "utf-8");
    expect(ci).toMatch(/schema-audit:/);
    expect(ci).toMatch(/run:\s*pnpm db:audit/);
    expect(ci).toMatch(/secrets\.SUPABASE_DB_URL/);
  });

  it("o Dockerfile delega para o mesmo `start`, em vez de repetir a cadeia", () => {
    // Duas copias da cadeia divergem: foi assim que o `CMD` do Dockerfile e o
    // `start` do package.json viveram diferentes por meses.
    expect(cmdDaImagem()).toMatch(/pnpm start/);
    expect(cmdDaImagem(), "cadeia duplicada no CMD").not.toMatch(/migrate-pg\.mjs/);
  });

  it("o parser do audit enxerga as colunas que o ALTER TABLE cria", async () => {
    // Este teste IMPORTA a funcao real. O teste vizinho ("migration repetindo
    // coluna") reimplementa o parser localmente — e por isso passou verde
    // enquanto o audit tinha um regex que NUNCA casava: a aspa estava fechada
    // antes do grupo opcional (`ALTER TABLE "(?:ONLY\s+)?"`), entao o padrao
    // exigia `ALTER TABLE "` seguido de `ONLY`. O DDL real escreve
    // `ALTER TABLE "projects" ADD COLUMN ...` e nao casava.
    //
    // Consequencia do defeito: as colunas criadas por ALTER TABLE ficavam
    // invisiveis para a auditoria, e ela imprimia "banco confere" com a coluna
    // faltando no banco. Foi assim que um deploy subiu lendo 4 colunas que nao
    // existiam em producao.
    const { colunasPorTabela } = await import("../scripts/audit-schema-pg.mjs");
    const declaradas = colunasPorTabela() as Map<string, Set<string>>;

    // Toda coluna que uma migration cria por ALTER TABLE ADD COLUMN tem de
    // aparecer no mapa. Comparar contra o mesmo regex, mas escrito de forma
    // independente ([\\s\\S] em vez de \\s), para nao repetir o defeito.
    const esperadas: string[] = [];
    for (const entry of journal.entries) {
      const caminho = join(MIGRATIONS_FOLDER, `${entry.tag}.sql`);
      if (!existsSync(caminho)) continue;
      const sql = readFileSync(caminho, "utf-8");
      for (const m of sql.matchAll(
        /ALTER TABLE\s+(?:ONLY\s+)?"([^"]+)"[\s\S]{0,200}?ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi
      )) {
        esperadas.push(`${m[1]}.${m[2]}`);
      }
    }

    expect(esperadas.length, "nenhum ALTER TABLE ADD COLUMN no historico").toBeGreaterThan(0);
    const invisiveis = esperadas.filter(c => {
      const [tabela, coluna] = c.split(".");
      return !declaradas.get(tabela!)?.has(coluna!);
    });
    expect(
      invisiveis,
      `o audit nao enxerga colunas criadas por ALTER TABLE ` +
        `(ele diria "banco confere" com a coluna ausente):\n  ${invisiveis.join("\n  ")}`
    ).toEqual([]);
  });

  it("o /readyz olha o banco, nao apenas o processo", () => {
    // `/healthz` responde 200 sem consultar o banco. Com ele como healthcheck,
    // um deploy com schema divergente e promovido como saudavel. `/readyz`
    // consulta o banco e responde 503 quando ele esta inacessivel, entao a
    // plataforma nao promove o deploy ruim — e o anterior continua servindo.
    //
    // O caminho do healthcheck e configuracao do Render e nao vive no repo; o que
    // o repo pode garantir e que a ROTA existe, consulta o banco e falha fechado.
    // As duas ultimas garantias sao o que um healthcheck precisa ter — e o
    // servico estava apontando para `/healthz`, que nao consulta o banco. Foi
    // alinhado para `/readyz` em 2026-10-21 (ver docs/DEPLOY.md).
    const src = readFileSync(join("server", "_core", "index.ts"), "utf-8");
    const i = src.indexOf('app.get("/readyz"');
    expect(i, "nao achei a rota /readyz em server/_core/index.ts").toBeGreaterThan(-1);
    const trecho = src.slice(i, i + 1600);
    expect(trecho, "o /readyz nao consulta o banco").toMatch(/SELECT 1/);
    expect(trecho, "o /readyz nao responde 503 quando o banco cai").toMatch(/status\(503\)/);
  });

  it("a auditoria de schema so escreve: so executa SELECT", () => {
    // Ela roda no pre-deploy de producao. Se um dia alguem "melhorar" o
    // relatorio e acrescentar uma escrita, isto acusa.
    //
    // A deteccao usa o indice de cada `conn.query(` e a proxima aspa
    // delimitadora, nao um unico regex. Regex com quantifiedor guloso ou
    // preguicoso erra o alvo em silencio e o teste vaza: foi o que aconteceu
    // duas vezes aqui, com o teste VERDE enquanto a mutacao estava presente.
    const src = readFileSync(join("scripts", "audit-schema-pg.mjs"), "utf-8");
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
      "audit-schema-pg.mjs executa algo que nao e SELECT - ela e de leitura pura " +
        "e roda antes do servico subir:\n  " + escritas.join("\n  ")
    ).toEqual([]);
  });

  it("a imagem de runtime nao carrega o que o boot nao executa", () => {
    // Ate 22/10/2026 a imagem carregava migrate-pg.mjs, migrate-core-pg.mjs,
    // audit-schema-pg.mjs e drizzle/ porque o `start` os executava. Com o boot
    // sem passo de banco, carregar isso so engorda a imagem e sugere que existe
    // DDL automatico — o que nao existe mais (o runtime usa o usuario
    // arquimedes_app, que nao tem permissao de DDL).
    const runtime =
      readFileSync("Dockerfile", "utf-8").split(/FROM\s+node:22-slim\s+AS\s+runtime/)[1] ?? "";
    expect(runtime).not.toMatch(/COPY\s+scripts\/migrate-pg\.mjs/);
    expect(runtime).not.toMatch(/COPY\s+scripts\/audit-schema-pg\.mjs/);
    expect(runtime).not.toMatch(/COPY\s+drizzle\//);
  });

  it("as ferramentas de banco continuam existindo como comando explicito", () => {
    // Tirar do boot nao pode significar perder a ferramenta: aplicar migracao e
    // auditar schema continuam sendo operacoes de uma linha, so que agora
    // conscientes (alguem digitou) em vez de escondidas no start.
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(pkg.scripts["db:migrate"]).toMatch(/scripts\/migrate-pg\.mjs/);
    expect(pkg.scripts["db:audit"]).toMatch(/scripts\/audit-schema-pg\.mjs/);
  });

  it("nao ha bootstrap em DDL no boot do servidor", () => {
    // `ensureUsersTable`/`ensurePlanVersionSchema` faziam DDL no start.
    // Se voltarem, a divergencia entre codigo e banco deixa de aparecer.
    const core = readFileSync(join("server", "_core", "index.ts"), "utf-8");
    const ddl = core.match(/CREATE\s+TABLE|ALTER\s+TABLE/gi);
    expect(ddl, `DDL no boot do servidor:\n  ${(ddl ?? []).join("\n  ")}`).toBeNull();
  });
});
