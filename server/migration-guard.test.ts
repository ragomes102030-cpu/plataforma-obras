import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditarSchema,
  colunasPorTabela,
  entradasDoJournal,
  migracoesPendentes,
  triggersDeclaradas,
  tiposDeclarados,
} from "../scripts/audit-schema-pg.mjs";

/**
 * O guard que faltava: o deploy roda `migrate && audit && start`, mas com
 * `USE_SUPABASE=1` o `migrate` sai com codigo 0 ANTES de aplicar DDL (o app
 * conecta como `arquimedes_app`, sem permissao de DDL). Sem esta conferencia,
 * uma migration nova existe no repo e nao existe no banco — e o deploy fica
 * verde do mesmo jeito. Foi assim que a `0012` ficou pendente.
 *
 * A comparacao e por TIMESTAMP (`when` do journal vs `created_at`), nao por
 * contagem: o banco ja teve 20 linhas para 10 migrations (duplicatas), e o
 * numero total "batia" enquanto faltava uma migration de verdade.
 */

const JOURNAL = entradasDoJournal();

describe("migracoesPendentes", () => {
  it("sem pendencias quando todo `when` do journal esta registrado", () => {
    const registradas = JOURNAL.map(e => e.when);
    expect(migracoesPendentes({ journalEntries: JOURNAL, registradas })).toEqual([]);
  });

  it("acusa a migration que existe no repo e nao no banco", () => {
    const registradas = JOURNAL.slice(0, -1).map(e => e.when);
    expect(migracoesPendentes({ journalEntries: JOURNAL, registradas })).toEqual([
      JOURNAL[JOURNAL.length - 1].tag,
    ]);
  });

  it("acusa todas quando a tabela de controle nem existe", () => {
    expect(migracoesPendentes({ journalEntries: JOURNAL, registradas: null })).toEqual(
      JOURNAL.map(e => e.tag)
    );
  });

  it("nao se engana com linha extra (duplicata) que nao corresponde a migration", () => {
    // 20 linhas para 10 migrations foi o estado real do banco uma vez. Contagem
    // passaria; comparacao por timestamp nao.
    const registradas = [...JOURNAL.map(e => e.when), 9999999999999];
    expect(migracoesPendentes({ journalEntries: JOURNAL, registradas })).toEqual([]);
  });

  it("aceita created_at em string (bigint do pg vem como string)", () => {
    const registradas = JOURNAL.map(e => String(e.when));
    expect(migracoesPendentes({ journalEntries: JOURNAL, registradas })).toEqual([]);
  });

  it("sem journal nao inventa pendencia", () => {
    expect(migracoesPendentes({ journalEntries: [], registradas: [] })).toEqual([]);
  });
});

/** Um banco "perfeito": tudo o que as migrations declaram ja existe. */
function bancoEmDia(overrides: { registradas?: number[] | null } = {}) {
  const tabelas = colunasPorTabela();
  const tipos = [...tiposDeclarados()];
  const triggers = [...triggersDeclaradas()];
  const registradas =
    overrides.registradas === undefined ? JOURNAL.map(e => e.when) : overrides.registradas;

  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: [
            ...[...tabelas.keys()].map(t => ({ table_name: t })),
            { table_name: "__drizzle_migrations" },
          ],
        };
      }
      if (sql.includes("information_schema.columns")) {
        const cols = tabelas.get(String(params?.[0])) ?? new Set<string>();
        return { rows: [...cols].map(c => ({ column_name: c })) };
      }
      if (sql.includes("typtype")) {
        return { rows: tipos.map(t => ({ typname: t })) };
      }
      if (sql.includes("information_schema.triggers")) {
        return {
          rows: triggers.map(t => {
            const [tabela, nome] = t.split(".");
            return { event_object_table: tabela, trigger_name: nome };
          }),
        };
      }
      if (sql.includes("pg_indexes")) return { rows: [] };
      if (sql.includes("COUNT(*)")) {
        const n = registradas === null ? 0 : registradas.length;
        const ultima = registradas === null ? 0 : Math.max(...registradas);
        return { rows: [{ n, last: String(ultima) }] };
      }
      if (sql.includes("SELECT created_at")) {
        return { rows: (registradas ?? []).map(w => ({ created_at: String(w) })) };
      }
      throw new Error(`consulta nao prevista no fake: ${sql}`);
    },
  };
}

describe("auditarSchema x controle de migrations", () => {
  it("banco em dia nao gera divergencia de migration", async () => {
    const r = await auditarSchema({ conn: bancoEmDia() as never });
    expect(r.ok).toBe(true);
    expect(r.pendentes).toEqual([]);
    expect(r.linhas.join("\n")).toContain("nenhuma pendente");
  });

  it("migration pendente derruba o audit (e portanto o boot)", async () => {
    const registradas = JOURNAL.slice(0, -1).map(e => e.when);
    const r = await auditarSchema({ conn: bancoEmDia({ registradas }) as never });
    expect(r.ok).toBe(false);
    expect(r.pendentes).toEqual([JOURNAL[JOURNAL.length - 1].tag]);
    expect(r.divergencias.join("\n")).toContain(JOURNAL[JOURNAL.length - 1].tag);
  });

  it("sem __drizzle_migrations todas as migrations contam como pendentes", async () => {
    const r = await auditarSchema({ conn: bancoEmDia({ registradas: null }) as never });
    expect(r.ok).toBe(false);
    expect(r.pendentes).toHaveLength(JOURNAL.length);
  });
});

describe("o guard esta ligado no lugar certo", () => {
  it("`scripts.start` roda migrate, depois audit, e so entao o app (com &&)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const cmd: string = pkg.scripts.start;
    const iMigrate = cmd.indexOf("migrate-pg.mjs");
    const iAudit = cmd.indexOf("audit-schema-pg.mjs");
    const iStart = cmd.indexOf("node dist/index.js");
    expect(iMigrate).toBeGreaterThan(-1);
    expect(iAudit).toBeGreaterThan(iMigrate);
    expect(iStart).toBeGreaterThan(iAudit);
    expect(cmd).not.toContain("; ");
  });

  it("o Dockerfile nao repete a cadeia: ele chama o mesmo `start`", () => {
    // A plataforma sobe pelo `npm start` do painel (build e Nixpacks), nao pelo
    // CMD da imagem. Duas copias da cadeia divergem; uma so, nao.
    const dockerfile = readFileSync("Dockerfile", "utf-8");
    const cmd = dockerfile.split("\n").find(l => l.trimStart().startsWith("CMD "));
    expect(cmd).toContain("pnpm start");
    expect(cmd).not.toContain("audit-schema-pg.mjs");
  });
});
