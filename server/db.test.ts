import { describe, expect, it } from "vitest";
import { normalizeDatabaseConnection } from "./db";

describe("normalizeDatabaseConnection", () => {
  it("normalizes a Supabase PostgreSQL URL and enables TLS", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test:5432/postgres?sslmode=require"
    );

    expect(connection.connectionString).not.toContain("sslmode");
    expect(connection.connectionString).toContain("postgresql://user:secret@example.test:5432/postgres");
    expect(connection.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("does not enable TLS when sslmode=disable", () => {
    const connection = normalizeDatabaseConnection(
      "postgresql://user:secret@example.test:5432/postgres?sslmode=disable"
    );

    expect(connection).toEqual({
      connectionString: "postgresql://user:secret@example.test:5432/postgres",
    });
  });
});
