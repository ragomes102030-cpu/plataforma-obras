import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authorizeQa, validPosition } from "./readonly-api";

describe("Arquimedes QA: autenticação delimitada", () => {
  const token = "a".repeat(43);
  const digest = createHash("sha256").update(token).digest("hex");
  it("autoriza somente bearer correto para obra configurada", () => {
    expect(authorizeQa("Bearer " + token, digest, "26", "26")).toBe(true);
    expect(authorizeQa("Bearer " + token, digest, "26", "25")).toBe(false);
    expect(authorizeQa("Bearer " + "b".repeat(43), digest, "26", "26")).toBe(false);
  });
  it("falha fechada sem configuração válida ou sem header", () => {
    expect(authorizeQa(undefined, digest, "26", "26")).toBe(false);
    expect(authorizeQa("Bearer " + token, undefined, "26", "26")).toBe(false);
    expect(authorizeQa("Bearer " + token, "invalid", "26", "26")).toBe(false);
    expect(authorizeQa("Bearer " + token, digest, undefined, "26")).toBe(false);
    expect(authorizeQa(token, digest, "26", "26")).toBe(false);
  });
  it("valida data civil sem aceitar datas inexistentes", () => {
    expect(validPosition("2026-11-27")).toBe(true);
    expect(validPosition("2026-02-29")).toBe(false);
    expect(validPosition("2026-11-31")).toBe(false);
    expect(validPosition(["2026-11-27"])).toBe(false);
  });
});
