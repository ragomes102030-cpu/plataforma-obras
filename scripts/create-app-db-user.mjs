/**
 * Cria um usuario de aplicacao com privilegios limitados AO SCHEMA `railway`
 * (sem nenhum privilegio global, ao contrario do root que o app usa hoje).
 *
 * Le a senha do usuario novo de NEW_PASSWORD e a senha root de ROOT_PASSWORD.
 * Nao altera senha do root: ele continua como fallback/break-glass.
 */
import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";

const dbName = process.env.DB_NAME;
const newUser = process.env.NEW_USER;
const newPass = process.env.NEW_PASSWORD;
if (!dbName || !newUser || !newPass) {
  console.error("Faltam DB_NAME/NEW_USER/NEW_PASSWORD");
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: "root",
  password: process.env.ROOT_PASSWORD,
  multipleStatements: false,
});

const id = () => `\`${String(newUser).replace(/`/g, "")}\``;

// 1. cria o usuario se ainda nao existir
const [existing] = await conn.query(
  "SELECT COUNT(*) n FROM mysql.user WHERE user = ?", [newUser]
);
if (existing[0].n === 0) {
  await conn.query(`CREATE USER ${id()}@'%' IDENTIFIED BY ?`, [newPass]);
  console.log(`[db-user] usuario ${newUser} criado`);
} else {
  await conn.query(`ALTER USER ${id()}@'%' IDENTIFIED BY ?`, [newPass]);
  console.log(`[db-user] usuario ${newUser} ja existia; senha redefinida`);
}

// 2. concede privilegios SOMENTE no schema alvo
await conn.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${id()}@'%'`);
await conn.query(
  `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX,
          REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE
     ON \`${dbName}\`.* TO ${id()}@'%'`
);
await conn.query("FLUSH PRIVILEGES");
console.log(`[db-user] privilegios limitados a \`${dbName}\`.* concedidos`);

// 3. mostra os privilegios globais (devem estar vazios)
const [g] = await conn.query("SHOW GRANTS FOR " + id() + "@'%'");
console.log("\n[db-user] SHOW GRANTS:");
for (const row of g) console.log("  " + Object.values(row)[0]);

// 4. valida que o usuario novo realmente conecta e opera
await conn.end();
const t = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: newUser,
  password: newPass,
  database: dbName,
});
const [who] = await t.query("SELECT CURRENT_USER() me, DATABASE() db");
console.log("\n[db-user] conecta como:", JSON.stringify(who[0]));
const [tabs] = await t.query(
  "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = ?", [dbName]
);
console.log(`[db-user] enxerga ${tabs[0].n} tabelas`);
// prova de escrita dentro do proprio schema
await t.query("CREATE TABLE IF NOT EXISTS _privcheck (id INT PRIMARY KEY)");
await t.query("INSERT INTO _privcheck VALUES (1) ON DUPLICATE KEY UPDATE id = id");
const [w] = await t.query("SELECT COUNT(*) n FROM _privcheck");
console.log(`[db-user] escrita OK (linhas=${w[0].n})`);
await t.query("DROP TABLE _privcheck");
console.log("[db-user] limpeza da tabela de teste OK");
// e prova de que NAO tem privilegio global
try {
  await t.query("SELECT COUNT(*) FROM mysql.user");
  console.log("[db-user] !! ALERTA: leu mysql.user (privilegio global inesperado)");
} catch (e) {
  console.log(`[db-user] OK: sem acesso global (${e.code})`);
}
await t.end();

const url = `mysql://${encodeURIComponent(newUser)}:${encodeURIComponent(newPass)}@${process.env.DB_HOST}:${process.env.DB_PORT}/${dbName}`;
console.log("\nDATABASE_URL_CANDIDATO=" + url);
