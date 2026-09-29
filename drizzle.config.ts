import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  // PostgreSQL. O Render so oferece Postgres como banco gerenciado, e o schema
  // foi portado junto: `pgTable`, `pgEnum`, `integer`, `numeric`, `jsonb` e
  // `timestamp with time zone`.
  dialect: "postgresql",
  dbCredentials: {
    connectionString: connectionString,
  },
});
