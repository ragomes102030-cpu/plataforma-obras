import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  CONSULTA_POR_TIPO,
  alvoDoStatement,
  aplicarMigracoes,
  asegurarTabelaDeMigracoes,
  criarVerificador,
  queryDeExistencia,
} from "../scripts/migrate-core-pg.mjs";

/**
 * O núcleo do migrador, executado de verdade.
 *
 * A versão MySQL deste teste existe porque o `migrate-db.mjs` era um script de
 * topo com top-level await: impossível de exercitar sem subir um banco. Aqui a
 * conexão é falsa e o núcleo roda de verdade, inclusive contra as MIGRATIONS
 * REAIS do repositório.
 *
 * O teste que mais importa é o último. Um `alvoDoStatement` que devolve `null`
 * não quebrou nada de imediato: o statement roda sem conferência. O defeito
 * só aparece no segundo deploy, quando o statement já aplicado é repetido e
 * estoura com `already exists`. Verificar só os formatos conhecidos deixaria
 * passar um formato novo que o drizzle inventar.
 */

describe("alvoDoStatement", () => {
  it("reconhece CREATE TABLE", () => {
    expect(alvoDoStatement(`CREATE TABLE "users" ("id" integer);`)).toEqual({
      tipo: "table",
      tabela: "users",
    });
  });

  it("reconhece CREATE TYPE AS ENUM", () => {
    // Alvo novo desta porta. Sem ele, o baseline reexecutaria os 32 tipos a
    // cada deploy e falharia com `type "users_role" already exists`.
    expect(alvoDoStatement(`CREATE TYPE "users_role" AS ENUM ('user', 'admin');`)).toEqual({
      tipo: "type",
      nome: "users_role",
    });
  });

  it("reconhece CREATE INDEX", () => {
    expect(
      alvoDoStatement(`CREATE UNIQUE INDEX "users_openId_unique" ON "users" USING btree ("openId");`)
    ).toEqual({ tipo: "index", tabela: "users", nome: "users_openId_unique" });
  });

  it("reconhece CREATE TRIGGER, com o nome antes do ON", () => {
    expect(
      alvoDoStatement(
        `CREATE TRIGGER "trg_users_updated_at"\n\tBEFORE UPDATE ON "users"\n\tFOR EACH ROW\n\tEXECUTE FUNCTION "set_updated_at"();`
      )
    ).toEqual({ tipo: "trigger", tabela: "users", nome: "trg_users_updated_at" });
  });

  it("reconhece CREATE OR REPLACE FUNCTION", () => {
    expect(
      alvoDoStatement(`CREATE OR REPLACE FUNCTION "set_updated_at"() RETURNS trigger AS $$`)
    ).toEqual({ tipo: "funcao", nome: "set_updated_at" });
  });

  it("reconhece ALTER TABLE ADD COLUMN", () => {
    expect(
      alvoDoStatement(`ALTER TABLE "users" ADD COLUMN "nickname" varchar(40);`)
    ).toEqual({ tipo: "coluna", tabela: "users", nome: "nickname" });
  });

  it("reconhece ALTER TABLE ALTER COLUMN como coluna, e nao como null", () => {
    // A coluna existe antes e depois, então a conferência de existência não
    // resolve: o alvo tem de ser reconhecido para o verificador não pulá-lo.
    expect(
      alvoDoStatement(`ALTER TABLE "users" ALTER COLUMN "nickname" TYPE varchar(80);`)
    ).toEqual({ tipo: "coluna", tabela: "users", nome: "nickname" });
  });

  it("reconhece ALTER TABLE ADD CONSTRAINT", () => {
    expect(
      alvoDoStatement(`ALTER TABLE "budget_items" ADD CONSTRAINT "fk_wbs" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id");`)
    ).toEqual({ tipo: "constraint", tabela: "budget_items", nome: "fk_wbs" });
  });

  it("devolve null para o que nao e DDL rastreavel", () => {
    expect(alvoDoStatement(`SELECT 1;`)).toBeNull();
    expect(alvoDoStatement(`INSERT INTO "x" VALUES (1);`)).toBeNull();
  });
});

describe("queryDeExistencia", () => {
  it("usa parametro posicional do PostgreSQL, e nao interrogacao", () => {
    const { sql, params } = queryDeExistencia({ tipo: "table", tabela: "users" });
    expect(sql).toContain("$1");
    expect(sql).not.toContain("?");
    expect(sql).toContain("current_schema()");
    expect(params).toEqual(["users"]);
  });

  it("ordena os parametros pelo que a consulta filtra", () => {
    // `pg_indexes` filtra por tabela e depois por índice; inverter a ordem faria
    // a consulta comparar índice com tabela e nunca achar nada — que é
    // silencioso: o verificador diria que nada existe e reexecutaria tudo.
    const index = queryDeExistencia({ tipo: "index", tabela: "users", nome: "idx_a" });
    expect(index.params).toEqual(["users", "idx_a"]);

    const trigger = queryDeExistencia({ tipo: "trigger", tabela: "users", nome: "trg_a" });
    expect(trigger.params).toEqual(["users", "trg_a"]);

    // O tipo e a função não têm tabela: só o nome.
    expect(queryDeExistencia({ tipo: "type", nome: "users_role" }).params).toEqual([
      "users_role",
    ]);
  });

  it("todo tipo mapeado tem sql e params", () => {
    for (const [tipo, def] of Object.entries(CONSULTA_POR_TIPO)) {
      expect(typeof def.sql, `${tipo} sem sql`).toBe("string");
      expect(typeof def.params, `${tipo} sem params`).toBe("function");
    }
  });
});

describe("criarVerificador", () => {
  it("le .rows do QueryResult, e nao desestrutura como tupla", () => {
    // O `mysql2` devolvia `[rows, fields]`; o `pg` devolve `{ rows }`. Se o
    // código continuar desestruturando, `rows` fica `undefined` e o
    // verificador passa a afirmar que NADA existe — reexecutando o DDL inteiro a
    // cada deploy.
    const chamadas: unknown[] = [];
    const conn = {
      query: async (sql: string, params: unknown) => {
        chamadas.push([sql, params]);
        return { rows: [{ found: 1 }], rowCount: 1 };
      },
    };
    const jaExiste = criarVerificador(conn as never);
    return expect(jaExiste({ tipo: "table", tabela: "users" })).resolves.toBe(true);
  });

  it("devolve false quando o resultado nao tem rows", () => {
    const conn = { query: async () => ({ rowCount: 0 }) };
    const jaExiste = criarVerificador(conn as never);
    return expect(jaExiste({ tipo: "table", tabela: "users" })).resolves.toBe(false);
  });
});

describe("as MIGRATIONS REAIS sao reconhecidas", () => {
  const PASTA = "drizzle";
  const arquivos = readdirSync(PASTA)
    .filter(f => f.endsWith(".sql"))
    .sort();

  function statementsDe(arquivo: string): string[] {
    // Só pelo separador `--> statement-breakpoint`, e NUNCA por linha: o
    // `CREATE TRIGGER` ocupa quatro linhas, e quebrar por linha deixava o
    // `BEFORE UPDATE ON "users"` órfão num "statement" separado. O teste
    // acusava zero trigger num arquivo com 23.
    //
    // E não por `;`, porque o corpo da função tem `NEW."updatedAt" := now();`
    // e o corte no ponto e virgula partiria a função ao meio.
    return readFileSync(join(PASTA, arquivo), "utf-8")
      .split("--> statement-breakpoint")
      .map(bloco =>
        bloco
          .split("\n")
          .filter(linha => !linha.trim().startsWith("--"))
          .join("\n")
          .trim()
      )
      .filter(Boolean);
  }

  it("ha migrations para olhar", () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it("nenhum statement de DDL cai em null", () => {
    // Este e o teste que segura a porta. Um `alvoDoStatement` que devolve `null`
    // nao falha agora: o statement roda sem conferência, e o defeito so
    // aparece no deploy seguinte, quando o DDL ja aplicado e repetido.
    const naoReconhecidos: string[] = [];
    for (const arquivo of arquivos) {
      for (const stmt of statementsDe(arquivo)) {
        if (!/^\s*(CREATE|ALTER)\s/i.test(stmt)) continue;
        if (!alvoDoStatement(stmt)) naoReconhecidos.push(`${arquivo}: ${stmt.slice(0, 90)}`);
      }
    }
    expect(
      naoReconhecidos,
      `DDL sem alvo, executado sem conferencia a cada retry:\n  ${naoReconhecidos.join("\n  ")}`
    ).toEqual([]);
  });

  it("reconhece as 33 tabelas, os 32 tipos e as 23 triggers", () => {
    const conta = { table: 0, type: 0, trigger: 0 };
    for (const arquivo of arquivos) {
      for (const stmt of statementsDe(arquivo)) {
        const alvo = alvoDoStatement(stmt);
        if (alvo && alvo.tipo in conta) conta[alvo.tipo as keyof typeof conta] += 1;
      }
    }
    expect(conta).toEqual({ table: 33, type: 32, trigger: 23 });
  });
});

/**
 * O ENTRYPOINT contra um banco vazio de verdade.
 *
 * Este bloco é o teste que faltava no primeiro deploy, e ele existe porque o
 * deploy quebrou de um jeito que nenhum teste anterior viu.
 *
 * O DDL das migrations ja era testado contra PGlite e passava. O que nao era
 * testado era o `aplicarMigracoes`: ele grava o que aplicou com
 * `INSERT INTO "__drizzle_migrations"`, e no caminho de banco VAZIO aquela
 * tabela nunca era criada. O resultado em producao foi o seguinte:
 *
 *   [migrate] banco vazio: aplicando 2 migracao(oes) do zero
 *   error: relation "__drizzle_migrations" does not exist     (code 42P01)
 *
 * As 33 tabelas tinham nascido. O container reiniciou, a segunda tentativa caiu
 * no caminho de banco legado — que sempre teve o `CREATE TABLE` — e completou.
 * O servico ficou no ar e o caminho, errado. Um banco novo, que e o primeiro
 * deploy de qualquer projeto novo, era justamente o que quebrava.
 */
describe("aplicarMigracoes num banco vazio", () => {
  /** Conexao com a forma que o nucleo espera: `query(sql, params) -> { rows }`. */
  function conexao(pg: PGlite) {
    return {
      query: async (sql: string, params?: unknown[]) => {
        const r = await pg.query(sql, params as never[]);
        return { rows: r.rows, rowCount: r.affectedRows };
      },
    };
  }

  function migrationsDoDisco() {
    const pasta = "drizzle";
    const journal = JSON.parse(
      readFileSync(join(pasta, "meta", "_journal.json"), "utf-8")
    ) as { entries: { tag: string; when: number }[] };
    return journal.entries.map(e => {
      const sql = readFileSync(join(pasta, `${e.tag}.sql`), "utf-8");
      return {
        folderMillis: e.when,
        hash: `hash-${e.tag}`,
        sql: sql
          .split("--> statement-breakpoint")
          .map(b =>
            b
              .split("\n")
              .filter(l => !l.trim().startsWith("--"))
              .join("\n")
              .trim()
          )
          .filter(Boolean),
      };
    });
  }

  it("cria a tabela de registro, aplica tudo e nao quebra", async () => {
    const pg = await PGlite.create();
    try {
      const conn = conexao(pg);

      await aplicarMigracoes({
        conn: conn as never,
        migrations: migrationsDoDisco(),
        jaAplicado: null,
      });

      const registradas = await pg.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM "__drizzle_migrations"'
      );
      expect(registradas.rows[0]!.n).toBe(2);

      const tabelas = await pg.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM information_schema.tables" +
          " WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      // 33 do schema + a de registro.
      expect(tabelas.rows[0]!.n).toBe(34);
    } finally {
      await pg.close();
    }
  });

  it("rodar de novo nao reaplica DDL e nao duplica registro", async () => {
    const pg = await PGlite.create();
    try {
      const conn = conexao(pg);
      const migrations = migrationsDoDisco();

      await aplicarMigracoes({ conn: conn as never, migrations, jaAplicado: null });

      // O segundo deploy. E o que prova que o verificador por statement existe:
      // sem ele, os 33 CREATE TABLE rodariam de novo e o banco recusaria com
      // `already exists`.
      const segunda = await aplicarMigracoes({
        conn: conn as never,
        migrations,
        jaAplicado: migrations[migrations.length - 1]!.folderMillis,
      });
      expect(segunda.relatorio).toEqual([]);

      const registradas = await pg.query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM "__drizzle_migrations"'
      );
      expect(registradas.rows[0]!.n).toBe(2);
    } finally {
      await pg.close();
    }
  });
});
