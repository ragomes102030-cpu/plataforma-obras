import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Auditoria estática de isolamento entre usuários.
 * Toda procedure protegida que recebe `projectId` precisa validar o acesso
 * à obra (ou delegar a um helper que valida). Se este teste falhar, uma rota
 * nova pode estar expondo dados de outra conta.
 */
const GUARDS = [
  "assertAccessibleProject",
  "accessibleProjectCondition",
  "ensureWritablePlanVersion",
  "requireProjectAccess",
  "assertProjectAccess",
];

// Rotas que delegam a checagem para um helper que a executa internamente.
const DELEGATED_GUARD_ALLOWLIST = new Set(["snapshot"]);

describe("isolamento entre contas", () => {
  const source = readFileSync("server/routers.ts", "utf-8");
  const pattern = /\n    (\w+): (protectedProcedure|publicProcedure|adminProcedure)/g;
  const matches = Array.from(source.matchAll(pattern));

  it("encontra as procedures do router", () => {
    expect(matches.length).toBeGreaterThan(50);
  });

  it("nenhuma procedure com projectId deixa de validar acesso à obra", () => {
    const unguarded: string[] = [];
    matches.forEach((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      const body = source.slice(start, end);
      const name = match[1];
      if (!body.includes("projectId")) return;
      if (DELEGATED_GUARD_ALLOWLIST.has(name)) return;
      if (!GUARDS.some(guard => body.includes(guard))) unguarded.push(name);
    });
    expect(unguarded).toEqual([]);
  });

  it("procedures públicas não recebem projectId", () => {
    const leaks: string[] = [];
    matches.forEach((match, index) => {
      if (match[2] !== "publicProcedure") return;
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      if (source.slice(start, end).includes("projectId")) leaks.push(match[1]);
    });
    expect(leaks).toEqual([]);
  });
});
