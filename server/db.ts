import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/** Normalize CLI-style MySQL URL options before handing them to mysql2. */
export function normalizeDatabaseConnection(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("ssl-mode")?.toLowerCase();
  url.searchParams.delete("ssl-mode");
  return {
    uri: url.toString(),
    ...(sslMode && sslMode !== "disabled"
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle({
        connection: normalizeDatabaseConnection(process.env.DATABASE_URL),
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
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
