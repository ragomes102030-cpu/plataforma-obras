import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync("server/routers.ts", "utf8");
const migration = readFileSync("drizzle/0020_baseline_vigente_unica.sql", "utf8");
const schema = readFileSync("drizzle/schema.ts", "utf8");
const ui = readFileSync("client/src/components/PainelDesviosBaseline.tsx", "utf8");
const regression = readFileSync("scripts/regression-aurora-eap.mjs", "utf8");

describe("baseline vigente sem apagar histórico", () => {
  it("migração preserva fotografias e limita uma ativa por obra", () => {
    expect(migration).toContain('PARTITION BY "projectId"');
    expect(migration).toContain('"createdAt" DESC, id DESC');
    expect(migration).toContain("SET status = 'arquivada'");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).toContain("WHERE status = 'ativa'");
    expect(migration).not.toMatch(/DELETE\\s+FROM\\s+"?schedule_baselines"?/i);
    expect(schema).toContain('uniqueIndex("schedule_baselines_uma_ativa_por_obra_idx")');
  });
  it("captura transacional, arquiva anterior, compara com vigente", () => {
    const start = router.indexOf("captureBaseline: protectedProcedure");
    const end = router.indexOf("compararComBaseline: protectedProcedure", start);
    const capture = router.slice(start, end);
    expect(capture).toContain("return db.transaction(async tx =>");
    expect(capture).toContain('.set({ status: "arquivada" })');
    expect(capture.indexOf('.set({ status: "arquivada" })')).toBeLessThan(capture.indexOf("tx.insert(scheduleBaselines)"));
    const compare = router.slice(end, router.indexOf("calculateCpmLocal: protectedProcedure", end));
    expect(compare).toContain('eq(scheduleBaselines.status, "ativa")');
    expect(compare).toContain("eq(scheduleBaselines.id, input.baselineId)");
  });
  it("painel evidencia o histórico, sem executar mutação", () => {
    expect(ui).toContain('b.status === "ativa"');
    expect(ui).toContain("Nenhuma baseline vigente definida");
    expect(ui).toContain("value={selecionadaId}");
    expect(ui).not.toMatch(/\\.useMutation\\(/);
  });
  it("EAP estrutural sem contagens fixas; fotografia apenas opcional", () => {
    expect(regression).toContain("rows.length > 0");
    expect(regression).toContain("duplicateCodes.length === 0");
    expect(regression).toContain("AURORA_EAP_SNAPSHOT");
    expect(regression).not.toContain("assert(rows.length === 69");
    expect(regression).not.toContain("assert(leaves.length === 53");
  });
});
