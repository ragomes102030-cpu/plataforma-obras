import { describe, expect, it } from "vitest";
import {
  calcularFingerprint,
  montarRegistro,
  normalizarRota,
} from "./error-tracker";

describe("observabilidade: normalizacao do erro", () => {
  it("remove query string e hash para nao vazar token nem criar grupo por parametro", () => {
    expect(normalizarRota("/api/trpc/projects.get?token=segredo#x")).toBe(
      "/api/trpc/projects.get"
    );
    expect(normalizarRota("")).toBe("/desconhecida");
    expect(normalizarRota(undefined)).toBe("/desconhecida");
  });

  it("trunca rota, mensagem e stack nos limites da coluna", () => {
    const registro = montarRegistro({
      origem: "http",
      rota: "/" + "a".repeat(500),
      mensagem: "m".repeat(5000),
      stack: "s".repeat(9000),
      status: 500,
    });
    expect(registro.rota).toHaveLength(300);
    expect(registro.mensagem).toHaveLength(2000);
    expect(registro.stack).toHaveLength(8000);
  });

  it("normaliza status ausente ou invalido para 500", () => {
    const semStatus = montarRegistro({
      origem: "trpc",
      rota: "/api/trpc/x",
      mensagem: "falhou",
    });
    expect(semStatus.status).toBe(500);

    const statusTexto = montarRegistro({
      origem: "http",
      rota: "/x",
      mensagem: "falhou",
      status: "abc" as unknown as number,
    });
    expect(statusTexto.status).toBe(500);
  });

  it("nao aceita userId fracionario", () => {
    const registro = montarRegistro({
      origem: "trpc",
      rota: "/api/trpc/x",
      mensagem: "falhou",
      userId: 1.5,
    });
    expect(registro.userId).toBeNull();
  });
});

describe("observabilidade: fingerprint", () => {
  const stackA =
    "Error: boom\n    at handler (C:\\repo\\server\\routers.ts:10:5)\n    at next";
  const stackB =
    "Error: boom\n    at handler (C:\\repo\\server\\routers.ts:987:12)\n    at next";

  it("agrupa o mesmo erro mesmo com linha e coluna diferentes", () => {
    const a = calcularFingerprint("trpc", "/api/trpc/x", "INTERNAL_SERVER_ERROR", stackA, "boom");
    const b = calcularFingerprint("trpc", "/api/trpc/x", "INTERNAL_SERVER_ERROR", stackB, "boom");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("separa erros de rotas diferentes", () => {
    const a = calcularFingerprint("http", "/a", null, null, "boom");
    const b = calcularFingerprint("http", "/b", null, null, "boom");
    expect(a).not.toBe(b);
  });

  it("separa erro de servidor de erro de cliente pelo codigo", () => {
    const a = calcularFingerprint("trpc", "/x", "INTERNAL_SERVER_ERROR", null, "e");
    const b = calcularFingerprint("trpc", "/x", "BAD_REQUEST", null, "e");
    expect(a).not.toBe(b);
  });

  it("o registro carrega origem, metodo e commit do build", () => {
    const registro = montarRegistro({
      origem: "http",
      rota: "/healthz",
      metodo: "GET",
      status: 503,
      mensagem: "indisponivel",
    });
    expect(registro.origem).toBe("http");
    expect(registro.metodo).toBe("GET");
    expect(registro.commitSha).toBeTruthy();
  });
});
