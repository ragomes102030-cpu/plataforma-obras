import { describe, expect, it } from "vitest";
import {
  resolveWritablePlanVersion,
  type PlanVersionSummary,
} from "./plan-versions";

const base = (over: Partial<PlanVersionSummary> = {}): PlanVersionSummary => ({
  id: 1,
  versionNumber: 1,
  status: "draft",
  baseVersionId: null,
  decisionId: null,
  approvedAt: null,
  ...over,
});

describe("plano: regra de versão gravável", () => {
  it("cria a versão 1 quando o projeto ainda não possui versões", () => {
    const result = resolveWritablePlanVersion([]);
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.nextNumber).toBe(1);
      expect(result.baseVersionId).toBeNull();
    }
  });

  it("reutiliza a última versão enquanto ela estiver em draft", () => {
    const result = resolveWritablePlanVersion([
      base({ id: 1, versionNumber: 1, status: "draft" }),
      base({ id: 2, versionNumber: 2, status: "draft" }),
    ]);
    expect(result.kind).toBe("reuse");
    if (result.kind === "reuse") {
      expect(result.version.versionNumber).toBe(2);
    }
  });

  it("reutiliza a última versão em revisão (proposed)", () => {
    const result = resolveWritablePlanVersion([
      base({ id: 1, versionNumber: 1, status: "approved" }),
      base({ id: 2, versionNumber: 2, status: "proposed" }),
    ]);
    expect(result.kind).toBe("reuse");
    if (result.kind === "reuse") {
      expect(result.version.versionNumber).toBe(2);
    }
  });

  it("abre uma nova versão quando a última foi aprovada", () => {
    const result = resolveWritablePlanVersion([
      base({ id: 1, versionNumber: 1, status: "approved" }),
    ]);
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.nextNumber).toBe(2);
      expect(result.baseVersionId).toBe(1);
    }
  });

  it("abre uma nova versão quando a última foi arquivada (superseded)", () => {
    const result = resolveWritablePlanVersion([
      base({ id: 1, versionNumber: 1, status: "approved" }),
      base({ id: 2, versionNumber: 2, status: "superseded" }),
    ]);
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.nextNumber).toBe(3);
      expect(result.baseVersionId).toBe(2);
    }
  });

  it("ignora a ordem de entrada das versões no cálculo do próximo número", () => {
    const result = resolveWritablePlanVersion([
      base({ id: 5, versionNumber: 5, status: "approved" }),
      base({ id: 1, versionNumber: 1, status: "approved" }),
      base({ id: 3, versionNumber: 3, status: "approved" }),
    ]);
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.nextNumber).toBe(6);
      expect(result.baseVersionId).toBe(5);
    }
  });
});