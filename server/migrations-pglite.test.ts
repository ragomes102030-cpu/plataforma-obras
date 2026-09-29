import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * As migrations aplicadas num PostgreSQL DE VERDADE.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * Até aqui o DDL das migrations nunca tinha executado. Tudo era leitura, teste
 * de regex e opinião do compilador — e o baseline ja tinha ensinado o que isso
 * custa: o `drizzle-kit generate` emitiu 33 `CREATE TABLE` e zero `CREATE TYPE`,
 * com as colunas apontando para tipos inexistentes. Nenhum teste acusou, porque
 * os testes olhavam o TEXTO do arquivo e conferiam nomes de tabela, e as 33
 * tabelas estavam todas escritas. O que faltava era o que estava entre elas.
 *
 * O PGlite e PostgreSQL compilado para WebAssembly: o mesmo parser, o mesmo
 * executor, as mesmas triggers. Nao e emulador e nao e mock. Se este teste
 * passar, o DDL e valido — nao "plausivel".
 *
 * POR QUE O QUE ESTE TESTE FAZ, E O QUE ELE NAO FAZ
 *
 * Ele aplica os arquivos na ordem do journal, com o mesmo separador
 * `--> statement-breakpoint` que o migrador usa. Ele NAO exercita
 * `migrate-pg.mjs`, que precisa de uma conexao `pg` de rede; o que ele garante
 * e que o DDL e aceito e produz o schema que o codigo espera.
 */

const PASTA = "drizzle";
const JOURNAL = join(PASTA, "meta", "_journal.json");

type Journal = {
  dialect: string;
  entries: { idx: number; tag: string; when: number }[];
};

function migrations(): string[] {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf-8")) as Journal;
  expect(journal.dialect).toBe("postgresql");
  return journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map(e => {
      const caminho = join(PASTA, `${e.tag}.sql`);
      expect(readdirSync(PASTA).includes(`${e.tag}.sql`), `${e.tag}.sql ausente`).toBe(true);
      return readFileSync(caminho, "utf-8");
    });
}

/** Aplica um arquivo inteiro, respeitando o separador do drizzle. */
async function aplicar(pg: PGlite, sql: string) {
  for (const bruto of sql.split("--> statement-breakpoint")) {
    const stmt = bruto
      .split("\n")
      .filter(linha => !linha.trim().startsWith("--"))
      .join("\n")
      .trim();
    if (!stmt) continue;
    await pg.exec(stmt);
  }
}

describe("as migrations constroem um schema utilizavel", () => {
  it("aplica do zero, sem erro de SQL", async () => {
    const pg = await PGlite.create();
    try {
      for (const [i, sql] of migrations().entries()) {
        await aplicar(pg, sql);
        // Se a enésima migration falhar, o nome dela e o unico lugar onde o
        // erro faz sentido. Sem esta anotação, a falha sai como "erro de
        // sintaxe" sem dizer de onde.
        expect(true, `migration ${i} aplicada`).toBe(true);
      }
    } finally {
      await pg.close();
    }
  });

  it("cria as 33 tabelas e os 32 tipos de enum", async () => {
    const pg = await PGlite.create();
    try {
      for (const sql of migrations()) await aplicar(pg, sql);

      const tabelas = await pg.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM information_schema.tables" +
          " WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      // 33, e nao 34. A tabela `__drizzle_migrations` NAO vem de migration: e o
      // migrador que a cria, para registrar o que ja aplicou. Contar ela aqui
      // seria esperar que o arquivo criasse a propria ficha de controle.
      expect(tabelas.rows[0]!.n).toBe(33);

      const enums = await pg.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM pg_type t" +
          " JOIN pg_namespace n ON n.oid = t.typnamespace" +
          " WHERE n.nspname = 'public' AND t.typtype = 'e'"
      );
      expect(enums.rows[0]!.n).toBe(32);
    } finally {
      await pg.close();
    }
  });

  it("as 23 triggers de updatedAt existem e NAO sao decorativas", async () => {
    // Este e o teste que a migracao nao podia provar sozinha. Uma trigger
    // `CREATE TRIGGER ... EXECUTE FUNCTION` que aponta para uma funcao ausente
    // e aceita na criacao e so falha quando alguém faz UPDATE. A coluna ficaria
    // parada para sempre, e nada no banco denunciaria.
    const pg = await PGlite.create();
    try {
      for (const sql of migrations()) await aplicar(pg, sql);

      const triggers = await pg.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM information_schema.triggers" +
          " WHERE trigger_schema = 'public'"
      );
      expect(triggers.rows[0]!.n).toBe(23);

      // Insere, altera, e confere que o updatedAt andou. Uma trigger que nao
      // dispara e uma trigger que nao existe, com a desvantagem de existir.
      await pg.exec(
        `INSERT INTO "users" ("openId", "role", "name")
         VALUES ('teste-openid', 'user', 'antes')`
      );
      const antes = await pg.query<{ updatedAt: Date }>(
        `SELECT "updatedAt" FROM "users" WHERE "openId" = 'teste-openid'`
      );

      await pg.exec(`UPDATE "users" SET "name" = 'depois' WHERE "openId" = 'teste-openid'`);
      const depois = await pg.query<{ updatedAt: Date }>(
        `SELECT "updatedAt" FROM "users" WHERE "openId" = 'teste-openid'`
      );

      expect(
        new Date(depois.rows[0]!.updatedAt).getTime(),
        "updatedAt nao mudou depois do UPDATE: a trigger nao disparou"
      ).toBeGreaterThan(new Date(antes.rows[0]!.updatedAt).getTime());
    } finally {
      await pg.close();
    }
  });

  it("um enum rejeita valor que nao pertence a ele", async () => {
    // A razao de o enum ser tipo nativo e nao texto: o banco recusa. Se este
    // INSERT passar, o contrato de dado enfraqueceu e ninguem avisa.
    const pg = await PGlite.create();
    try {
      for (const sql of migrations()) await aplicar(pg, sql);

      await expect(
        pg.exec(
          `INSERT INTO "users" ("openId", "role") VALUES ('x', 'superusuario')`
        )
      ).rejects.toThrow();

      await expect(
        pg.exec(`INSERT INTO "users" ("openId", "role") VALUES ('x', 'admin')`)
      ).resolves.toBeDefined();
    } finally {
      await pg.close();
    }
  });
});
