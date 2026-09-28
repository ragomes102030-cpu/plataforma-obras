import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { badRequest, conflict, forbidden, notFound } from "./_core/errors";

/**
 * Regressao: erro de dominio nao pode virar HTTP 500.
 *
 * Um `throw new Error(...)` numa procedure cai em INTERNAL_SERVER_ERROR. O
 * cliente recebia "erro do servidor" para o que e "voce nao tem acesso" (403)
 * ou "nao existe" (404) — e, pior, 500 mascara falha real de banco no alerta.
 */
describe("codigos de erro de dominio", () => {
  it("cada helper produz o code HTTP certo", () => {
    expect(notFound("x")).toBeInstanceOf(TRPCError);
    expect(notFound("x").code).toBe("NOT_FOUND");
    expect(forbidden("x").code).toBe("FORBIDDEN");
    expect(badRequest("x").code).toBe("BAD_REQUEST");
    expect(conflict("x").code).toBe("CONFLICT");
  });

  it("preserva a mensagem original", () => {
    expect(forbidden("Obra não encontrada ou sem permissão de acesso.").message).toBe(
      "Obra não encontrada ou sem permissão de acesso."
    );
  });
});

describe("routers.ts nao treats erro de dominio como 500", () => {
  const source = readFileSync("server/routers.ts", "utf-8");

  // Falha de infraestrutura ou de estado interno: 500 e o codigo CORRETO.
  // Envolve-las em 400/404 esconderia a falha real de banco/coordenador.
  const LEGIT_500 = [
    "Banco de dados não configurado.", // banco ausente: falha do servidor
    "Não foi possível inicializar o estado do coordenador.", // estado interno
    "Não foi possível registrar a prévia.", // escrita interna
  ];

  it("o guard de acesso usa forbidden, nao Error cru", () => {
    // A razao do bug: o 500 em GET /api/trpc/projects.activities vinha daqui.
    expect(source).toContain('throw forbidden("Obra não encontrada ou sem permissão de acesso.")');
    expect(source).not.toContain('throw new Error("Obra não encontrada ou sem permissão de acesso.")');
  });

  it("nao sobrou nenhum throw new Error com mensagem de dominio", () => {
    const isLegit = (line: string) =>
      LEGIT_500.some((m) => line.includes(m)) ||
      /throw new Error\(message\)/.test(line) || // rethrow de falha inesperada em catch
      /throw new Error\($/.test(line); // abertura de literal multi-linha

    const offenders = source
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /throw new Error\(/.test(l))
      .filter((l) => !isLegit(l));
    expect(offenders).toEqual([]);
  });

  it("regra de negocio forbids nao e classificada como forbidden", () => {
    // "nao pode depender dela mesma" e regra, nao permissao: 403 seria enganoso.
    expect(source).not.toMatch(/throw forbidden\("Uma atividade não pode depender dela mesma\."\)/);
  });
});
