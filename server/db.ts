import { and, eq, type ColumnsSelection } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgInsertBase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Normaliza a connection string para o `pg`.
 *
 * `pg` e `mysql2` nao falam a mesma lingua de URL. O MySQL usa `ssl-mode` com
 * hifen e valores proprios; o PostgreSQL usa `sslmode` sem hifen. E o `pg` le
 * `sslmode` da propria URL e sabe o que fazer com ele — mas um `ssl-mode`
 * esquecido na URL passaria batido e a conexao cairia para texto claro, que e o
 * pior desfecho possível sem erro visível.
 *
 * Por isso o `ssl` volta explícito: o teste consegue afirmar o comportamento em
 * vez de confiar que o driver adivinhou certo.
 */
export function runtimeDatabaseUrl() {
  // Se a conexão Supabase estiver configurada, ela sempre vence o DATABASE_URL legado.
  // Isso evita que um segredo antigo do Render seja escolhido por engano em produção.
  const supabaseUrl =
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL_SUPABASE ||
    process.env.SUPA_DB_URL;
  const raw = supabaseUrl || process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);

  // Nunca exponha credenciais: registre somente a origem e o host para diagnosticar
  // divergência entre Dashboard/Blueprint sem vazar segredos nos logs.
  const source = supabaseUrl ? "supabase" : "legacy";
  const maskedUser = url.username ? url.username.replace(/[^a-zA-Z0-9_.-]/g, "_") : "<none>";
  console.log(`[database] source=${source} host=${url.hostname} port=${url.port || "5432"} user=${maskedUser}`);
  if (process.env.USE_SUPABASE === "1" && url.hostname === "db.tromrvfijbtihuilvnuk.supabase.co") {
    url.hostname = "aws-0-sa-east-1.pooler.supabase.com";
    url.port = "5432";
    if (url.username === "postgres") url.username = "postgres.tromrvfijbtihuilvnuk";
  }
  return url.toString();
}

export function normalizeDatabaseConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = (
    url.searchParams.get("ssl-mode") ?? url.searchParams.get("sslmode")
  )?.toLowerCase();
  url.searchParams.delete("ssl-mode");
  // `charset` e parametro do MySQL. O `pg` nao o conhece e nao faz nada com
  // ele: deixei-lo ali seria carregar um parametro morto para dentro de toda
  // conexao, achando que ele ainda diz alguma coisa.
  url.searchParams.delete("charset");
  const desligado = sslMode === "disable" || sslMode === "disabled";
  if (desligado) {
    url.searchParams.delete("sslmode");
  }
  return {
    uri: url.toString(),
    ...(!desligado && sslMode ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const databaseUrl = runtimeDatabaseUrl();
  if (!_db && databaseUrl) {
    try {
      _db = drizzle(databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Traduz o retorno do `INSERT` para o que o codigo consome.
 *
 * No MySQL, `$returningId()` devolvia `number[]`. No PostgreSQL, `returning()`
 * devolve a linha inteira. Duas tentativas de porta por substituicao de texto
 * falharam aqui: a primeira porque o codigo quebra linha entre `db` e `.insert`,
 * e a segunda porque ha `;` dentro de texto (`notes: "... cadastro; precos ..."`)
 * e de template literal. Nenhuma das duas acusou erro — apenas nao transformou,
 * que e a pior forma de falhar.
 *
 * Por isso a diferenca mora aqui, num metodo do builder, e a troca no codigo
 * passa a ser uma substituicao de token IDENTICA nos 37 sitios: sem emenda de
 * sentenca, sem aritmetica de indice, sem chance de corromper o arquivo.
 * `const [x]` continua desestruturando `number`, e `const x` continua `number[]`.
 */
declare module "drizzle-orm/pg-core" {
  interface PgInsertBase<
    TTable extends PgTable,
    TQueryResult extends PgQueryResultHKT,
    TSelectedFields extends ColumnsSelection | undefined = undefined,
    TReturning extends Record<string, unknown> | undefined = undefined,
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never,
  > {
    $returningIds(): Promise<number[]>;
  }
}

PgInsertBase.prototype.$returningIds = function (
  this: { returning: () => Promise<Record<string, unknown>[]> }
): Promise<number[]> {
  // `returning()` sem argumento traz a linha inteira; so o `id` interessa.
  return this.returning().then(linhas => linhas.map(linha => Number(linha.id)));
};

type UserDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function buildUserValues(user: InsertUser): InsertUser {
  const values: InsertUser = {
    openId: user.openId!,
  };

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) values[field] = user[field] ?? null;
  }
  if (user.lastSignedIn !== undefined) values.lastSignedIn = user.lastSignedIn;
  if (user.role !== undefined) values.role = user.role;
  else if (user.openId === ENV.ownerOpenId) values.role = "admin";
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  return values;
}

function buildUserUpdateSet(values: InsertUser): Record<string, unknown> {
  const updateSet: Record<string, unknown> = {};
  for (const field of [
    "name",
    "email",
    "loginMethod",
    "lastSignedIn",
    "role",
  ] as const) {
    if (values[field] !== undefined) updateSet[field] = values[field];
  }
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  return updateSet;
}

async function upsertUserWithDatabase(
  database: UserDatabase,
  user: InsertUser
): Promise<void> {
  const values = buildUserValues(user);
  const updateSet = buildUserUpdateSet(values);
  const existing = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, values.openId!))
    .limit(1);

  if (existing[0]) {
    await database
      .update(users)
      .set(updateSet)
      .where(eq(users.id, existing[0].id));
    return;
  }

  try {
    await database.insert(users).values(values);
  } catch (error) {
    // A concurrent first login may insert the same openId between SELECT and INSERT.
    // Re-read and update that row instead of returning the generic OAuth failure.
    const concurrent = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, values.openId!))
      .limit(1);
    if (!concurrent[0]) throw error;
    await database
      .update(users)
      .set(updateSet)
      .where(eq(users.id, concurrent[0].id));
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    await upsertUserWithDatabase(db, user);
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function ensureFirstUserAdmin(openId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  if (admins.length > 0) return false;

  const updated = await db
    .update(users)
    .set({ role: "admin" })
    .where(and(eq(users.openId, openId), eq(users.role, "user")))
    .returning({ id: users.id });

  return updated.length > 0;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
