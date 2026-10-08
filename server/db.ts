import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users, type InsertUser } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function normalizeDatabaseConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = (
    url.searchParams.get("sslmode") ??
    url.searchParams.get("ssl-mode") ??
    ""
  ).toLowerCase();

  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl-mode");

  return {
    connectionString: url.toString(),
    ...(sslMode === "disable"
      ? {}
      : { ssl: { rejectUnauthorized: false } }),
  };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const connection = normalizeDatabaseConnection(process.env.DATABASE_URL);
      _pool = new Pool({
        ...connection,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      });
      _pool.on("error", error => {
        console.error("[Database] PostgreSQL pool error:", error);
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to initialize PostgreSQL:", error);
      _db = null;
    }
  }
  return _db;
}

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
  if (!user.openId) throw new Error("User openId is required for upsert");

  const db = await getDb();
  if (!db) {
    throw new Error("PostgreSQL database is not available");
  }

  try {
    await upsertUserWithDatabase(db, user);
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) throw new Error("PostgreSQL database is not available");

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}
