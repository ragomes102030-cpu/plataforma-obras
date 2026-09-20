import { describe, expect, it } from "vitest";
import { normalizeDatabaseConnection } from "./db";

describe("normalizeDatabaseConnection", () => {
  it("converts ssl-mode=REQUIRED into mysql2 TLS options", () => {
    const connection = normalizeDatabaseConnection(
      "mysql://user:secret@example.test/app?ssl-mode=REQUIRED&charset=utf8mb4"
    );

    expect(connection.uri).not.toContain("ssl-mode");
    expect(connection.uri).toContain("charset=utf8mb4");
    expect(connection.ssl).toEqual({});
  });

  it("does not enable TLS when ssl-mode is disabled", () => {
    const connection = normalizeDatabaseConnection(
      "mysql://user:secret@example.test/app?ssl-mode=DISABLED"
    );

    expect(connection.uri).not.toContain("ssl-mode");
    expect(connection).not.toHaveProperty("ssl");
  });

  it("keeps regular MySQL URLs unchanged apart from URL serialization", () => {
    const connection = normalizeDatabaseConnection("mysql://user:secret@example.test/app");

    expect(connection).toEqual({
      uri: "mysql://user:secret@example.test/app",
    });
  });
});
