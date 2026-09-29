import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Toda migration com mais de um statement precisa do separador.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * O `readMigrationFiles` do drizzle-orm separa os statements por
 * `--> statement-breakpoint` e mais nada. Sem o marcador, o arquivo inteiro vai
 * como UMA query, e o mysql2 rejeita a segunda sentencia com
 * `ER_PARSE_ERROR ... at line 2`.
 *
 * Aconteceu em 29/09/2026 com a `0003_local_e_unidade`: dois `ALTER TABLE` no
 * mesmo arquivo. O deploy `2d92eb5c` FAILED — e o build passou, porque build não
 * executa migration; o runtime executa, no boot do container. A imagem subiu, o
 * container morreu na inicialização, e a producao ficou servindo a versao
 * anterior sem ninguem notar.
 *
 * As migrations que ja estavam aplicadas tem um statement cada, e por isso o
 * problema passou despercebido ate agora.
 */
const SEPARADOR = "--> statement-breakpoint";

function migrations() {
  return readdirSync("drizzle")
    .filter(f => f.endsWith(".sql"))
    .map(f => ({ nome: f, sql: readFileSync(`drizzle/${f}`, "utf-8") }));
}

/**
 * Quantos SQL executáveis o arquivo tem, olhando o QUE está entre statements e
 * não o separador.
 *
 * A primeira versão deste teste dividia pelo separador e comparava o tamanho
 * do resultado — o que faz com que um arquivo SEM separador conte como "um
 * statement só" e passe. A guarda nunca falhava, que é a forma mais silenciosa
 * de um teste de guarda não existir. Aqui conta por `;`, que é o que o banco
 * vê.
 */
function statementsDoArquivo(sql: string): string[] {
  return sql
    .split("\n")
    .filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith("--");
    })
    .join("\n")
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

describe("migrations do drizzle", () => {
  it("migration com mais de um statement tem o separador do drizzle", () => {
    const infratores: string[] = [];
    for (const m of migrations()) {
      const n = statementsDoArquivo(m.sql).length;
      if (n > 1 && !m.sql.includes(SEPARADOR)) {
        infratores.push(`${m.nome} (${n} statements, sem separador)`);
      }
    }
    expect(
      infratores,
      "sem `--> statement-breakpoint` o drizzle envia o arquivo inteiro como uma " +
        "query e o mysql2 rejeita o segundo statement com ER_PARSE_ERROR"
    ).toEqual([]);
  });

  it("a contagem de statement enxerga dois ALTER no mesmo arquivo", () => {
    // Autoteste da guarda acima. Sem ele, um erro na contagem faz a primeira
    // verificacao passar sempre — e foi exatamente o que aconteceu na primeira
    // versao deste arquivo.
    const dois = statementsDoArquivo(
      "ALTER TABLE `t` ADD COLUMN `a` int NULL;\nALTER TABLE `t` ADD COLUMN `b` int NULL;\n"
    );
    expect(dois).toHaveLength(2);
    const um = statementsDoArquivo("ALTER TABLE `t` ADD COLUMN `a` int NULL;\n");
    expect(um).toHaveLength(1);
    // Comentário de linha não é statement.
    const comComentario = statementsDoArquivo(
      "-- uma nota\nALTER TABLE `t` ADD COLUMN `a` int NULL;\n"
    );
    expect(comComentario).toHaveLength(1);
  });

  it("todo .sql esta no journal, e toda entrada do journal tem arquivo", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf-8"));
    const noJournal = new Set(
      journal.entries.map((e: { tag: string }) => `${e.tag}.sql`)
    );
    const emDisco = new Set(migrations().map(m => m.nome));

    const orfaos = [...emDisco].filter(n => !noJournal.has(n));
    expect(orfaos, "arquivo .sql fora do journal nunca e aplicado").toEqual([]);

    const semArquivo = [...noJournal].filter(n => !emDisco.has(n));
    expect(semArquivo, "entrada do journal sem arquivo em disco").toEqual([]);
  });

  it("o journal esta em ordem, e indices e timestamps nao se repetem", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf-8"));
    const indices = journal.entries.map((e: { idx: number }) => e.idx);
    const quintes = journal.entries.map((e: { when: number }) => e.when);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(quintes).toEqual([...quintes].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
    expect(new Set(quintes).size).toBe(quintes.length);
  });
});
