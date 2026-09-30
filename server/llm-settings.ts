import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { llmProviderSettings } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";

const ALGORITHM = "aes-256-gcm";
const SETTINGS_ID = 1;

export type StoredLlmProvider = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled?: boolean;
};

function encryptionKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET é necessário para criptografar a configuração LLM.");
  }
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

function encryptConfig(config: StoredLlmProvider) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("base64")].join(".");
}

function decryptConfig(payload: string): StoredLlmProvider | null {
  try {
    const [ivHex, tagHex, encryptedBase64] = payload.split(".");
    if (!ivHex || !tagHex || !encryptedBase64) return null;
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Partial<StoredLlmProvider> | Array<Partial<StoredLlmProvider>>;
    const validate = (value: Partial<StoredLlmProvider>) =>
      typeof value.provider === "string" && typeof value.baseUrl === "string" &&
      typeof value.apiKey === "string" && typeof value.model === "string" &&
      Boolean(value.provider.trim()) && Boolean(value.baseUrl.trim()) &&
      Boolean(value.model.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(validate).map(value => ({ ...value, apiKey: value.apiKey! })) as StoredLlmProvider[];
    }
    if (!validate(parsed)) return null;
    return parsed as StoredLlmProvider;
  } catch {
    return null;
  }
}

export async function getStoredLlmProviders(): Promise<StoredLlmProvider[]> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(llmProviderSettings)
    .where(eq(llmProviderSettings.id, SETTINGS_ID))
    .orderBy(desc(llmProviderSettings.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return [];
  const config = decryptConfig(row.encryptedConfig);
  if (!config) return [];
  return Array.isArray(config) ? config : [config];
}

export async function getStoredLlmProvider(): Promise<StoredLlmProvider | null> {
  const providers = await getStoredLlmProviders();
  return providers.find(provider => provider.enabled !== false) ?? providers[0] ?? null;
}

export async function saveStoredLlmProviders(
  configs: StoredLlmProvider[],
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não configurado.");
  await db
    .insert(llmProviderSettings)
    .values({
      id: SETTINGS_ID,
      encryptedConfig: encryptConfig(config),
      updatedBy: userId,
    })
    // `onDuplicateKeyUpdate` e MySQL. No PostgreSQL e `onConflictDoUpdate`, e a
    // coluna de conflito e obrigatoria: o banco nao adivinha qual unicidade o
    // INSERT pretendia. Aqui e a chave primaria, que e o que o `id: SETTINGS_ID`
    // logo acima esta affirmando ao fazer o INSERT.
    .onConflictDoUpdate({
      target: llmProviderSettings.id,
      set: {
        encryptedConfig: encryptConfig(config),
        updatedBy: userId,
      },
    });
}

export async function getPublicLlmSettings() {
  const db = await getDb();
  if (!db) {
    return { configured: false, provider: null, baseUrl: null, model: null, updatedAt: null };
  }
  const rows = await db
    .select({ encryptedConfig: llmProviderSettings.encryptedConfig, updatedAt: llmProviderSettings.updatedAt })
    .from(llmProviderSettings)
    .where(eq(llmProviderSettings.id, SETTINGS_ID))
    .limit(1);
  const row = rows[0];
  const config = row ? decryptConfig(row.encryptedConfig) : null;
  return {
    configured: Boolean(config),
    provider: config?.provider ?? null,
    baseUrl: config?.baseUrl ?? null,
    model: config?.model ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export type { StoredLlmProvider };
