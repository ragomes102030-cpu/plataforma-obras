import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** Impede que auditoria dos dois MVPs se torne seeder ou mutação da obra. */
const sql = readFileSync(new URL("../scripts/auditar-mvps-clientes-readonly.sql", import.meta.url), "utf8");
const executableSql = sql.replace(/^--[^\n]*$/gm,"");

describe("MVPs comerciais — auditoria segura Escola e AURORA",()=>{
  it("confere estritamente as duas obras-modelo",()=>{
    expect(executableSql).toContain("p.id = 7 AND p.code = 'OB-PUPOCN'");
    expect(executableSql).toContain("p.id = 25 AND p.code = 'OB-TFECKQ'");
    expect(executableSql).toContain("v.status::text = 'approved'");
    expect(executableSql).toContain("b.status::text = 'ativa'");
  });
  it("não altera dados de produção nem baselines",()=>{
    expect(executableSql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|ALTER|DROP|CREATE|GRANT)\b/i);
  });
  it("não homologa Escola com LOB zerada no tempo, orçamento didático ou sem medição",()=>{
    for(const gate of ["lob_segments_collapsed_at_day_zero","repeated_activities_without_start_lag",
      "didactic_budget_items","measurements"]) {
      expect(sql).toContain(gate);
    }
    expect(sql).toContain("elegivel_a_revisao_final");
    expect(sql).toContain("BLOQUEADO: parcelas da LOB contradizem a rede CPM");
  });
  it("separa progresso real dos lançamentos QA",()=>{
    expect(sql).toContain("pe.exemplo = 0");
    expect(sql).toContain("pe.exemplo = 1");
    expect(sql).toContain("real_production_entries");
    expect(sql).toContain("example_production_entries");
  });
});
