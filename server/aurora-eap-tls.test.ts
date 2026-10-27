import { describe, expect, it } from "vitest";
import { configurarConexaoEap, diagnosticoCertificado } from "../scripts/aurora-eap-db-tls.mjs";

const url = "postgresql://postgres.example%40project:password@pooler.example.com:5432/postgres";
describe("Regressão Aurora — PostgreSQL TLS autenticado", () => {
  it("mantém validação TLS por padrão", () => {
    const config = configurarConexaoEap(url, "");
    expect(config.ssl.rejectUnauthorized).toBe(true);
    expect(config.connectionString).toContain("pooler.example.com:5432");
  });
  it("remove sslmode de URL para não sobrepor o objeto ssl", () => {
    const config = configurarConexaoEap(url + "?sslmode=require&charset=utf8", "");
    expect(config.connectionString).not.toContain("sslmode=");
    expect(config.connectionString).not.toContain("charset=");
    expect(config.ssl.rejectUnauthorized).toBe(true);
  });
  it.each(["disable", "allow", "prefer"])("recusa modo TLS inseguro %s", mode => {
    expect(() => configurarConexaoEap(url + "?sslmode=" + mode, "")).toThrow(/TLS verificado/);
  });
  it("recusa PEM inválido sem vazar credenciais", () => {
    expect(() => configurarConexaoEap(url, "conteúdo inválido")).toThrow(/PEM válido/);
  });
  it("explica configuração de CA após falha sem engolir o erro", () => {
    const msg = diagnosticoCertificado(new Error("self-signed certificate in certificate chain"));
    expect(msg).toContain("SUPABASE_DB_CA_PEM");
    expect(msg).toContain("rejectUnauthorized:true");
    expect(msg).not.toContain("password");
  });
});
