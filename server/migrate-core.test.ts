import { describe, expect, it } from "vitest";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  CONSULTA_POR_TIPO,
  COLUNAS_INFORMATION_SCHEMA,
  alvoDoStatement,
  alvoDeConsulta,
  queryDeExistencia,
  aplicarMigracoes,
} from "../scripts/migrate-core.mjs";

const MIGRATIONS_FOLDER = "drizzle";
const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
const umMil = migrations.find(m => m.folderMillis === 1790776191243)!;

function statements(): string[] {
  const out: string[] = [];
  for (const m of migrations) {
    for (const s of m.sql) if (s.trim()) out.push(s.trim());
  }
  return out;
}

/**
 * Conexao falsa. `presentes` e o conjunto de "chaves" que ja existem no banco,
 * no formato `tipo:tabela.nome` (ou `tipo:tabela` para tabela). Toda query e
 * registrada, para o teste poder conferir o SQL que iria ao MySQL.
 */
function connFalsa(presentes: Set<string>) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (/INFORMATION_SCHEMA\./.test(sql)) {
        const tabela = sql.match(/INFORMATION_SCHEMA\.(\w+)/)![1];
        const coluna = sql.includes("CONSTRAINT_NAME")
          ? "CONSTRAINT_NAME"
          : sql.includes("INDEX_NAME")
            ? "INDEX_NAME"
            : sql.includes("COLUMN_NAME")
              ? "COLUMN_NAME"
              : null;
        const alvo = params[0] as string;
        const chave = coluna
          ? `${tabela === "COLUMNS" ? "coluna" : tabela === "TABLE_CONSTRAINTS" ? "constraint" : "index"}:${alvo}.${params[1]}`
          : `table:${alvo}`;
        return [presentes.has(chave) ? [{ found: 1 }] : []];
      }
      return [[]];
    },
  };
}

describe("alvoDoStatement", () => {
  it.each([
    ["CREATE TABLE `x` (", "table", "x", undefined],
    ["ALTER TABLE `x` ADD COLUMN `c` timestamp NULL;", "coluna", "x", "c"],
    ["ALTER TABLE `x` ADD `c` timestamp NULL;", "coluna", "x", "c"],
    ["ALTER TABLE `x` ADD CONSTRAINT `fk` FOREIGN KEY (`a`) REFERENCES `y`(`id`);", "constraint", "x", "fk"],
    ["CREATE INDEX `i` ON `x` (`a`);", "index", "x", "i"],
    ["CREATE UNIQUE INDEX `i` ON `x` (`a`);", "index", "x", "i"],
  ])("reconhece %s", (stmt, tipo, tabela, nome) => {
    const a = alvoDoStatement(stmt as string)!;
    expect(a).not.toBeNull();
    expect(a.tipo).toBe(tipo);
    expect(a.tabela).toBe(tabela);
    expect(a.nome).toBe(nome);
  });

  it("devolve null para o que nao e DDL rastreavel", () => {
    expect(alvoDoStatement("SELECT 1")).toBeNull();
    expect(alvoDoStatement("DROP TABLE `x`")).toBeNull();
  });

  it("todo statement das migracoes cai em formato reconhecido", () => {
    const naoReconhecidos = statements().filter(s => !alvoDoStatement(s));
    expect(
      naoReconhecidos,
      `statements sem verificacao (falha eterna em retry):\n  ${naoReconhecidos.join("\n  ")}`
    ).toEqual([]);
  });
});

describe("a consulta de existencia usa colunas que existem", () => {
  it.each(Object.keys(CONSULTA_POR_TIPO))("a consulta de %s", tipo => {
    const { tabela, coluna } = alvoDeConsulta({ tipo });
    expect(COLUNAS_INFORMATION_SCHEMA[tabela]).toBeDefined();
    if (coluna !== null) {
      expect(
        COLUNAS_INFORMATION_SCHEMA[tabela],
        `INFORMATION_SCHEMA.${tabela} nao tem ${coluna} — ER_BAD_FIELD_ERROR no pre-deploy`
      ).toContain(coluna);
    }
  });

  it("todo tipo emitido por alvoDoStatement tem consulta mapeada", () => {
    for (const s of statements()) {
      const a = alvoDoStatement(s);
      if (!a) continue;
      expect(() => alvoDeConsulta(a)).not.toThrow();
    }
  });

  it("constraint consulta CONSTRAINT_NAME, nao COLUMN_NAME", () => {
    // Este foi o bug do 2o deploy: TABLE_CONSTRAINTS nao tem COLUMN_NAME.
    const q = queryDeExistencia({ tipo: "constraint", tabela: "x", nome: "fk" });
    expect(q.sql).toContain("TABLE_CONSTRAINTS");
    expect(q.sql).toContain("CONSTRAINT_NAME = ?");
    expect(q.sql).not.toContain("COLUMN_NAME = ?");
  });

  it("a query filtra por TABLE_SCHEMA = DATABASE()", () => {
    expect(queryDeExistencia({ tipo: "table", tabela: "x" }).sql).toContain(
      "TABLE_SCHEMA = DATABASE()"
    );
  });
});

describe("aplicarMigracoes executa de verdade", () => {
  // Estes testes rodam o codigo, em vez de le-lo como texto. Os tres deploys
  // quebrados por bugs que `node --check` aceita e que teste por leitura de
  // arquivo nao pegava provam que ler o fonte nao e verificar.

  it("nao estoura TDZ: o laudo roda do inicio ao fim", async () => {
    const conn = connFalsa(new Set());
    await aplicarMigracoes({ conn, migrations, jaAplicado: null });
    expect(conn.queries.length).toBeGreaterThan(0);
  });

  it("banco vazio executa tudo", async () => {
    const conn = connFalsa(new Set());
    const { relatorio } = await aplicarMigracoes({ conn, migrations, jaAplicado: null });
    expect(relatorio).toHaveLength(migrations.length);
    for (const r of relatorio) {
      expect(r.pulados).toHaveLength(0);
      expect(r.executados.length).toBeGreaterThan(0);
    }
  });

  it("reproduz o estado real de producao: 0-3 aplicados e migracao nao registrada", async () => {
    // Foi o que o 2o deploy deixou no banco: implicit commit aplicou os 3
    // ALTER TABLE e o CREATE TABLE, mas a FK Abortou e nada foi registrado.
    const presentes = new Set([
      "coluna:schedule_activities.mustStartOn",
      "coluna:schedule_activities.finishNoLaterThan",
      "coluna:schedule_activities.freeFloat",
      "table:work_calendars",
    ]);
    const conn = connFalsa(presentes);
    const { relatorio } = await aplicarMigracoes({
      conn,
      migrations,
      jaAplicado: 1790603791243,
    });

    expect(relatorio).toHaveLength(1);
    const r = relatorio[0];
    expect(r.folderMillis).toBe(1790776191243);
    // pula exatamente os 4 ja aplicados
    expect(r.pulados.map(p => p.nome ?? p.tabela).sort()).toEqual([
      "finishNoLaterThan",
      "freeFloat",
      "mustStartOn",
      "work_calendars",
    ]);
    // e executa o resto
    const executados = r.executados.join("\n");
    expect(executados).toContain("work_calendars_projectId_projects_id_fk");
    expect(executados).toContain("CREATE TABLE `calendar_exceptions`");
    expect(executados).toContain("calendar_exceptions_calendarId_idx");
    // nenhum ALTER repetido
    expect(executados).not.toContain("mustStartOn");
    expect(executados).not.toContain("freeFloat");
  });

  it("registra a migracao no journal depois de aplicar", async () => {
    const conn = connFalsa(new Set());
    await aplicarMigracoes({ conn, migrations, jaAplicado: 1790603791243 });
    const inserts = conn.queries.filter(q => /INSERT INTO `__drizzle_migrations`/.test(q.sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[1]).toBe(1790776191243);
  });

  it("nao aplica nada quando nada esta pendente", async () => {
    const conn = connFalsa(new Set());
    const ultimo = migrations[migrations.length - 1].folderMillis;
    const { relatorio } = await aplicarMigracoes({ conn, migrations, jaAplicado: ultimo });
    expect(relatorio).toHaveLength(0);
    expect(conn.queries.filter(q => /INSERT INTO/.test(q.sql))).toHaveLength(0);
  });

  it("aplica na ordem do journal", async () => {
    const conn = connFalsa(new Set());
    const { relatorio } = await aplicarMigracoes({ conn, migrations, jaAplicado: null });
    const ordenados = relatorio.map(r => r.folderMillis);
    expect(ordenados).toEqual([...ordenados].sort((a, b) => a - b));
  });

  it("nao volta a registrar a mesma migracao duas vezes", async () => {
    const conn = connFalsa(new Set());
    const jaAplicado = umMil.folderMillis;
    const { aAplicar } = await aplicarMigracoes({ conn, migrations, jaAplicado });
    expect(aAplicar.every(m => m.folderMillis > jaAplicado)).toBe(true);
  });
});
