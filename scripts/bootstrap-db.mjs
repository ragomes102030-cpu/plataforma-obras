// Cria o schema completo num banco VAZIO (staging / recuperação de desastre).
// Seguro por padrão: se a tabela `users` já existir, não faz nada — nunca altera um banco em uso.
// Uso: DATABASE_URL=mysql://... node scripts/bootstrap-db.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[bootstrap] DATABASE_URL ausente; nada a fazer");
  process.exit(0);
}

const parsed = new URL(url);
const sslMode = parsed.searchParams.get("ssl-mode");
parsed.searchParams.delete("ssl-mode");

const conn = await createConnection({
  uri: parsed.toString(),
  ...(sslMode && sslMode !== "disabled" ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  const [existing] = await conn.query(
    "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
  );
  if (existing[0].n > 0) {
    console.log("[bootstrap] banco já inicializado; nada a fazer");
  } else {
    const sql = readFileSync(join(process.cwd(), "drizzle", "full-schema.sql"), "utf-8");
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const statement of statements) {
      await conn.query(statement);
    }
    console.log(`[bootstrap] schema criado: ${statements.length} comandos`);
  }
} finally {
  await conn.end();
}
