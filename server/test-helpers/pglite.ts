import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";

/**
 * PostgreSQL de verdade, em WASM, com o schema do repo aplicado.
 *
 * POR QUE ISTO EXISTE, E POR QUE UM FAKE NAO SERVE
 *
 * O defeito do `versionId` era invisivel para um fake de banco. A causa nao era
 * "o codigo esqueceu um `if`": era o SQL. `WHERE "versionId" IN (1)` devolve
 * `NULL` — nem verdadeiro, nem falso — quando a coluna e nula, e por isso o
 * no orfao nunca entrava no `GROUP BY`. Um mock que devolve um array de linhas ja
 * resolvidas nunca produz essa semantica, porque o `NULL` some dentro do driver
 * de rede antes de anyone ver. O painel dizia zero, e o zero estava certo para a
 * consulta que ele fez: a consulta estava errada.
 *
 * PGlite e o mesmo parser e o mesmo executor do PostgreSQL, compilados para
 * WebAssembly. Nao e emulador. Se o `IN` nao casa com `NULL` aqui, ele nao casa
 * em producao tambem — e o teste reprova pelo motivo certo.
 *
 * POR QUE O APLICADOR VIVE AQUI, E NAO DENTRO DE UM TESTE
 *
 * Duas suites precisam do mesmo schema (o DDL das migrations e a regra de
 * versao do plano). Copiar o aplicador para dentro de cada uma criaria duas
 * versoes do mesmo passo, e uma delas pararia de casar com o journal sem ninguem
 * perceber: o teste continuaria verde sobre um schema que nao e mais o do repo.
 */

const PASTA = "drizzle";
const JOURNAL = join(PASTA, "meta", "_journal.json");

type Journal = {
  dialect: string;
  entries: { idx: number; tag: string; when: number }[];
};

/**
 * Os arquivos de migration, na ordem do journal.
 *
 * A ordem vem do journal e nao do `readdir`: o journal e a unica fonte que o
 * migrador de producao respeita, e um teste que lesse o disco em ordem alfabetica
 * estaria testando uma ordem que ninguem executa.
 */
export function migrationsEmDisco(): string[] {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf-8")) as Journal;
  expect(
    journal.dialect,
    "o journal ainda declara um dialeto que nao e PostgreSQL"
  ).toBe("postgresql");
  return journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map(entrada => {
      const caminho = join(PASTA, `${entrada.tag}.sql`);
      expect(
        readdirSync(PASTA).includes(`${entrada.tag}.sql`),
        `${entrada.tag}.sql ausente`
      ).toBe(true);
      return readFileSync(caminho, "utf-8");
    });
}

/**
 * Aplica um arquivo inteiro, respeitando o separador `--> statement-breakpoint`.
 *
 * As linhas de comentario sao removidas porque o driver do PGlite nao aceita
 * um `--` solto no fim de um lote. O migrador real tem o mesmo cuidado, em
 * `semComentarios`.
 */
export async function aplicarMigrations(pg: PGlite, sql: string): Promise<void> {
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

/** Um PGlite novo com TODAS as migrations aplicadas, do zero. */
export async function pgliteComSchema(): Promise<PGlite> {
  const pg = await PGlite.create();
  for (const sql of migrationsEmDisco()) await aplicarMigrations(pg, sql);
  return pg;
}
