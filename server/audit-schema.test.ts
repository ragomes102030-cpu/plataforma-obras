import { describe, expect, it } from "vitest";
import { auditarSchema, colunasPorTabela } from "../scripts/audit-schema.mjs";
import { conexaoFake } from "./test-helpers/mysql-fake.mjs";

const declaradas = colunasPorTabela();
const todasTabelas = [...declaradas.keys()];
const SA = [...declaradas.get("schedule_activities")].sort();

// Um banco que bate com o repo: todas as tabelas e colunas declaradas, mais a
// tabela de journal.
function bancoCompleto(over = {}) {
  const presentes = new Set();
  for (const [tabela, cols] of declaradas) {
    for (const c of cols) presentes.add(`coluna:${tabela}.${c}`);
  }
  for (const t of over.faltandoTabelas ?? []) declaradas.delete(t);
  return conexaoFake({
    banco: "normal",
    jaAplicado: 1790776191243,
    presentes,
    tabelas: over.tabelas ?? todasTabelas,
  });
}

describe("colunasPorTabela le o DDL das migracoes", () => {
  it("extrai todas as tabelas declaradas", () => {
    // 31 do baseline + 2 da 0001
    expect(declaradas.size).toBe(33);
  });

  it("inclui as colunas que so existem via ALTER TABLE", () => {
    // Sem isto a auditoria diria que a Onda 0.4 nao foi aplicada.
    for (const c of ["mustStartOn", "finishNoLaterThan", "freeFloat"]) {
      expect(SA, `${c} nao foi lida`).toContain(c);
    }
  });

  it("extrai colunas de todas as tabelas, nao so de algumas", () => {
    // Um parser de TypeScript anterior extraiu 10 de 33 e ainda assim
    // teria dito "verde". Cada tabela tem que ter ao menos id.
    const semId = todasTabelas.filter(t => !declaradas.get(t)?.has("id"));
    expect(semId, `tabelas sem coluna id lida: ${semId.join(", ")}`).toEqual([]);
  });
});

describe("auditarSchema executa", () => {
  it("nao diverge contra um banco que tem tudo", async () => {
    const r = await auditarSchema({ conn: bancoCompleto() });
    expect(r.divergencias).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("so executa SELECT", async () => {
    const conn = bancoCompleto();
    await auditarSchema({ conn });
    for (const q of conn.queries) {
      expect(q.sql.trim().toUpperCase(), `query nao-SELECT: ${q.sql.slice(0, 70)}`).toMatch(
        /^SELECT/
      );
    }
  });

  it("acusa tabela ausente", async () => {
    const presentes = new Set();
    for (const [tabela, cols] of declaradas) {
      if (tabela === "calendar_exceptions") continue;
      for (const c of cols) presentes.add(`coluna:${tabela}.${c}`);
    }
    const conn = conexaoFake({
      jaAplicado: 1790776191243,
      presentes,
      tabelas: todasTabelas.filter(t => t !== "calendar_exceptions"),
    });
    const r = await auditarSchema({ conn });
    expect(r.ok).toBe(false);
    expect(r.faltandoTabelas).toContain("calendar_exceptions");
  });

  it("acusa coluna ausente", async () => {
    const presentes = new Set();
    for (const [tabela, cols] of declaradas) {
      for (const c of cols) {
        if (tabela === "schedule_activities" && c === "freeFloat") continue;
        presentes.add(`coluna:${tabela}.${c}`);
      }
    }
    const conn = conexaoFake({
      jaAplicado: 1790776191243,
      presentes,
      tabelas: todasTabelas,
    });
    const r = await auditarSchema({ conn });
    expect(r.ok).toBe(false);
    expect(r.colunasFaltando).toContain("schedule_activities.freeFloat");
  });

  it("acusa quando as 3 colunas da Onda 0.4 faltam", async () => {
    const presentes = new Set();
    for (const [tabela, cols] of declaradas) {
      for (const c of cols) {
        if (["mustStartOn", "finishNoLaterThan", "freeFloat"].includes(c)) continue;
        presentes.add(`coluna:${tabela}.${c}`);
      }
    }
    const conn = conexaoFake({
      jaAplicado: 1790776191243,
      presentes,
      tabelas: todasTabelas,
    });
    const r = await auditarSchema({ conn });
    expect(r.ok).toBe(false);
    expect(r.onda04).toEqual([]);
    expect(r.divergencias.join(" ")).toContain("Onda 0.4");
  });

  it("nao acusa quando as 3 colunas da Onda 0.4 existem", async () => {
    const r = await auditarSchema({ conn: bancoCompleto() });
    expect(r.onda04).toHaveLength(3);
  });

  it("relata as linhas de resumo", async () => {
    const r = await auditarSchema({ conn: bancoCompleto() });
    const txt = r.linhas.join("\n");
    expect(txt).toContain("tabelas:");
    expect(txt).toContain("colunas:");
    expect(txt).toContain("onda 0.4:");
    expect(txt).toContain("journal:");
  });

  it("acusa tabela que existe no banco e nao no repo", async () => {
    const presentes = new Set();
    for (const [tabela, cols] of declaradas) {
      for (const c of cols) presentes.add(`coluna:${tabela}.${c}`);
    }
    const conn = conexaoFake({
      jaAplicado: 1790776191243,
      presentes,
      tabelas: [...todasTabelas, "tabela_inexistente"],
    });
    const r = await auditarSchema({ conn });
    expect(r.sobrandoTabelas).toContain("tabela_inexistente");
  });

  it("nao conta __drizzle_migrations como tabela a mais", async () => {
    const presentes = new Set();
    for (const [tabela, cols] of declaradas) {
      for (const c of cols) presentes.add(`coluna:${tabela}.${c}`);
    }
    const conn = conexaoFake({
      jaAplicado: 1790776191243,
      presentes,
      tabelas: [...todasTabelas, "__drizzle_migrations"],
    });
    const r = await auditarSchema({ conn });
    expect(r.sobrandoTabelas).toEqual([]);
  });
});
