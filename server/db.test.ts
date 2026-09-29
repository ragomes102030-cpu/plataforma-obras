import { describe, expect, it } from "vitest";
import { normalizeDatabaseConnection } from "./db";

/**
 * A URL do PostgreSQL e da do MySQL nao sao a mesma coisa, e o detalhe que
 * protege a conexao esta no parametro de TLS.
 *
 * O MySQL usa `ssl-mode` (com hifen). O PostgreSQL usa `sslmode` (sem hifen), e
 * o `pg` le o segundo da propria URL. Um `ssl-mode=REQUIRED` que sobrasse na
 * URL nao produziria erro visivel — a conexao simplesmente cairia para texto
 * claro. Por isso a funcao devolve o `ssl` explicito: o teste afirma o
 * comportamento em vez de confiar que o driver adivinhou.
 */
describe("normalizeDatabaseConnection", () => {
  it("converte o ssl-mode do MySQL em TLS, e tira o parametro da URL", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test/app?ssl-mode=REQUIRED"
    );

    expect(connection.uri).not.toContain("ssl-mode");
    expect(connection.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("nao liga TLS quando o sslmode esta desligado", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test/app?sslmode=disable"
    );

    expect(connection.uri).not.toContain("sslmode");
    expect(connection).not.toHaveProperty("ssl");
  });

  it("trata o sslmode do proprio PostgreSQL", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test/app?sslmode=require"
    );

    expect(connection.uri).toContain("sslmode=require");
    expect(connection.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("descarta o charset, que e parametro do MySQL e nao do PostgreSQL", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test/app?charset=utf8mb4"
    );

    expect(connection.uri).not.toContain("charset");
  });

  it("mantem uma URL do PostgreSQL sem parametro intacta", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test/app"
    );

    expect(connection).toEqual({
      uri: "postgresql://user:secret@example.test/app",
    });
  });
});
