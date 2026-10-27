import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const regression = readFileSync("scripts/regression-aurora-eap.mjs", "utf8");
const workflow = readFileSync(".github/workflows/aurora-eap-regression.yml", "utf8");
const schemaAudit = readFileSync("scripts/audit-schema-pg.mjs", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");

describe("EAP Aurora — invariantes, não números fixos", () => {
  it("exige raiz única, integridade, dicionário, atividades e dependências", () => {
    for(const rule of [
      "roots.length === 1",
      "orphans.length === 0",
      "invalidLevels.length === 0",
      "leafChildren.length === 0",
      "duplicates.length === 0",
      "duplicateCodes.length === 0",
      "invalid_duration",
      "cross_version",
      "self_loop",
      '"description", "inclusions", "exclusions", "acceptanceCriteria"',
    ]) expect(regression).toContain(rule);
  });
  it("fotografia 69:53:15 é opcional, não bloqueia uma edição legítima", () => {
    expect(regression).toContain("process.env.AURORA_EAP_SNAPSHOT?.trim()");
    expect(workflow).toContain("vars.AURORA_EAP_SNAPSHOT");
    expect(regression).not.toContain("assert(rows.length === 69");
    expect(regression).not.toContain("assert(leaves.length === 53");
    expect(regression).not.toContain("level2: 15,");
  });
  it("o workflow não ignora erro de certificado nem oculta ausência de credencial", () => {
    expect(workflow).toContain("SUPABASE_DB_CA_PEM");
    expect(workflow).toContain("secrets.SUPABASE_DB_URL");
    expect(regression).toContain("configurarConexaoEap(databaseUrl)");
    expect(regression).not.toContain("rejectUnauthorized: false");
    expect(workflow).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
    expect(schemaAudit).toContain("configurarConexaoEap(raw)");
    expect(ci).not.toContain("NODE_EXTRA_CA_CERTS:");
  });
});
