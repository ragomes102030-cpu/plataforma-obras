import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const databaseUrl = new URL(connectionString);
const sslMode = databaseUrl.searchParams.get("ssl-mode")?.toLowerCase();
databaseUrl.searchParams.delete("ssl-mode");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : undefined,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\//, ""),
    ...(sslMode && sslMode !== "disabled"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  },
});
