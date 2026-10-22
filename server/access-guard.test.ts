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
  // `\s{4,}` e nao `    ` (exatamente quatro espacos): as procedures de router
  // aninhado — `financeiro.*`, `capabilities.*`, `composicoes.*` — ficam em
  // 6 ou 8 espacos de indentacao e escapavam da varredura. Ate 22/10/2026 isto
  // aqui auditava 111 das 140 procedures do arquivo, em silencio.
  const pattern = /\n(\s{4,})(\w+): (protectedProcedure|publicProcedure|adminProcedure)/g;
  const matches = Array.from(source.matchAll(pattern));

  it("encontra as procedures do router, inclusive as de router aninhado", () => {
    expect(matches.length).toBeGreaterThan(130);
    // Prova que a varredura nao voltou a olhar so a indentacao de 4 espacos.
    const indentacoes = new Set(matches.map(m => m[1].length));
    expect(indentacoes.size, "so uma indentacao varrida: routers aninhados ficaram de fora").toBeGreaterThan(1);
  });

  it("nenhuma procedure com projectId deixa de validar acesso à obra", () => {
    const unguarded: string[] = [];
    matches.forEach((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      const body = source.slice(start, end);
      const name = match[2];
      const tipo = match[3];
      if (!body.includes("projectId")) return;
      // `adminProcedure` ja exige isAdmin no middleware e, por definicao,
      // enxerga todas as obras. Ele nao entra na regra de guard por obra.
      if (tipo === "adminProcedure") return;
      if (DELEGATED_GUARD_ALLOWLIST.has(name)) return;
      const ownerScoped = body.includes("ownerUserId") && body.includes("ctx.user.id");
      if (!ownerScoped && !GUARDS.some(guard => body.includes(guard))) unguarded.push(name);
    });
    expect(unguarded).toEqual([]);
  });

  it("procedures públicas não recebem projectId", () => {
    const leaks: string[] = [];
    matches.forEach((match, index) => {
      if (match[3] !== "publicProcedure") return;
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.length;
      if (source.slice(start, end).includes("projectId")) leaks.push(match[2]);
    });
    expect(leaks).toEqual([]);
  });
});
