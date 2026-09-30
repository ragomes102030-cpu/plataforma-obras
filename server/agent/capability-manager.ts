import { and, desc, eq, inArray } from "drizzle-orm";
import {
  arquimedesCapabilities,
  arquimedesCapabilityEvents,
  users,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  ARQUIMEDES_CAPABILITIES,
  type ArquimedesCapabilityDefinition,
} from "./capability-registry";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function capabilityDefinition(id: string): ArquimedesCapabilityDefinition {
  const definition = ARQUIMEDES_CAPABILITIES.find(item => item.id === id);
  if (!definition) throw new Error('Capacidade "' + id + '" não está no catálogo homologado.');
  return definition;
}

async function requireAdmin(db: Db, userId: number) {
  const [user] = await db
    .select({ id: users.id, role: users.role, openId: users.openId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error("Usuário da sessão não encontrado.");
  const owner = Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId;
  if (user.role !== "admin" && !owner) {
    throw new Error("Somente administradores podem administrar as capacidades do Arquimedes.");
  }
  return user;
}

async function ensureCatalog(db: Db) {
  for (const definition of ARQUIMEDES_CAPABILITIES) {
    const installed = definition.defaultInstalled;
    await db
      .insert(arquimedesCapabilities)
      .values({
        id: definition.id,
        kind: definition.kind,
        name: definition.name,
        version: definition.version,
        domain: definition.domain,
        description: definition.description,
        status: installed ? "installed" : "available",
        enabled: installed && definition.defaultEnabled,
        removable: definition.removable,
        dependenciesJson: JSON.stringify(definition.dependencies),
        installedAt: installed ? new Date() : null,
      })
      .onConflictDoNothing({ target: arquimedesCapabilities.id });
  }
}

function parseDependencies(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function recordEvent(
  db: Db,
  input: {
    capabilityId: string;
    userId: number;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    detail: string;
  }
) {
  await db.insert(arquimedesCapabilityEvents).values({
    capabilityId: input.capabilityId,
    userId: input.userId,
    action: input.action,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    detail: input.detail,
  });
}

export async function getArquimedesCapabilitySnapshot(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await requireAdmin(db, userId);
  await ensureCatalog(db);

  const [rows, events] = await Promise.all([
    db.select().from(arquimedesCapabilities),
    db
      .select({
        id: arquimedesCapabilityEvents.id,
        capabilityId: arquimedesCapabilityEvents.capabilityId,
        capabilityName: arquimedesCapabilities.name,
        userId: arquimedesCapabilityEvents.userId,
        action: arquimedesCapabilityEvents.action,
        fromStatus: arquimedesCapabilityEvents.fromStatus,
        toStatus: arquimedesCapabilityEvents.toStatus,
        detail: arquimedesCapabilityEvents.detail,
        createdAt: arquimedesCapabilityEvents.createdAt,
      })
      .from(arquimedesCapabilityEvents)
      .leftJoin(
        arquimedesCapabilities,
        eq(arquimedesCapabilities.id, arquimedesCapabilityEvents.capabilityId)
      )
      .orderBy(desc(arquimedesCapabilityEvents.createdAt))
      .limit(40),
  ]);

  const byId = new Map(rows.map(row => [row.id, row]));
  const capabilities = ARQUIMEDES_CAPABILITIES.map(definition => {
    const stored = byId.get(definition.id);
    const dependencies = stored
      ? parseDependencies(stored.dependenciesJson)
      : definition.dependencies;
    return {
      ...definition,
      status:
        stored?.status ??
        (definition.defaultInstalled ? "installed" : "available"),
      enabled: Boolean(stored?.enabled ?? false),
      installedAt: stored?.installedAt ?? null,
      updatedAt: stored?.updatedAt ?? null,
      dependencies,
    };
  });

  return {
    capabilities,
    events,
    summary: {
      total: capabilities.length,
      installed: capabilities.filter(item => item.status === "installed").length,
      enabled: capabilities.filter(item => item.enabled).length,
      available: capabilities.filter(item => item.status === "available").length,
      disabled: capabilities.filter(item => item.status === "installed" && !item.enabled).length,
    },
  };
}

async function readCapability(db: Db, capabilityId: string) {
  const [row] = await db
    .select()
    .from(arquimedesCapabilities)
    .where(eq(arquimedesCapabilities.id, capabilityId))
    .limit(1);
  if (!row) throw new Error("Capacidade não encontrada no estado persistido.");
  return row;
}

async function assertDependenciesActive(db: Db, dependencies: string[], verb: "instalar" | "ativar") {
  if (!dependencies.length) return;
  const rows = await db
    .select({
      id: arquimedesCapabilities.id,
      name: arquimedesCapabilities.name,
      status: arquimedesCapabilities.status,
      enabled: arquimedesCapabilities.enabled,
    })
    .from(arquimedesCapabilities)
    .where(inArray(arquimedesCapabilities.id, dependencies));

  const inactive = dependencies.filter(id => {
    const row = rows.find(item => item.id === id);
    return !row || row.status !== "installed" || !row.enabled;
  });

  if (inactive.length) {
    const names = rows
      .filter(item => inactive.includes(item.id))
      .map(item => item.name);
    throw new Error(
      "Não é possível " +
        verb +
        " a capacidade. Ative primeiro: " +
        (names.join(", ") || inactive.join(", ")) +
        "."
    );
  }
}

export async function installArquimedesCapability(
  userId: number,
  capabilityId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await requireAdmin(db, userId);
  const definition = capabilityDefinition(capabilityId);
  await ensureCatalog(db);

  const current = await readCapability(db, capabilityId);
  await assertDependenciesActive(db, parseDependencies(current.dependenciesJson), "instalar");

  const now = new Date();
  await db
    .update(arquimedesCapabilities)
    .set({
      status: "installed",
      enabled: true,
      installedBy: userId,
      installedAt: current.installedAt ?? now,
      updatedAt: now,
    })
    .where(eq(arquimedesCapabilities.id, capabilityId));

  await recordEvent(db, {
    capabilityId,
    userId,
    action: current.status === "available" ? "installed" : "re-enabled",
    fromStatus: current.status,
    toStatus: "installed",
    detail: 'Capacidade "' + definition.name + '" instalada e ativada.',
  });

  return {
    capabilityId,
    name: definition.name,
    status: "installed" as const,
    enabled: true,
  };
}

export async function setArquimedesCapabilityEnabled(
  userId: number,
  capabilityId: string,
  enabled: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await requireAdmin(db, userId);
  const definition = capabilityDefinition(capabilityId);
  await ensureCatalog(db);

  const current = await readCapability(db, capabilityId);
  if (current.status !== "installed") {
    throw new Error("Instale a capacidade antes de ativá-la.");
  }

  if (enabled) {
    await assertDependenciesActive(db, definition.dependencies, "ativar");
  }

  const now = new Date();
  await db
    .update(arquimedesCapabilities)
    .set({ enabled, updatedAt: now })
    .where(eq(arquimedesCapabilities.id, capabilityId));

  await recordEvent(db, {
    capabilityId,
    userId,
    action: enabled ? "enabled" : "disabled",
    fromStatus: current.enabled ? "enabled" : "disabled",
    toStatus: enabled ? "enabled" : "disabled",
    detail:
      'Capacidade "' +
      definition.name +
      '" ' +
      (enabled ? "ativada." : "desativada."),
  });

  return {
    capabilityId,
    name: definition.name,
    status: current.status,
    enabled,
  };
}

export async function uninstallArquimedesCapability(
  userId: number,
  capabilityId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await requireAdmin(db, userId);
  const definition = capabilityDefinition(capabilityId);
  await ensureCatalog(db);

  const current = await readCapability(db, capabilityId);
  if (current.status !== "installed") {
    return {
      capabilityId,
      name: definition.name,
      status: "available" as const,
      enabled: false,
    };
  }
  if (!current.removable) {
    throw new Error(
      'A capacidade "' +
        definition.name +
        '" faz parte do núcleo do Arquimedes e não pode ser removida.'
    );
  }

  const installed = await db
    .select({
      id: arquimedesCapabilities.id,
      name: arquimedesCapabilities.name,
      dependenciesJson: arquimedesCapabilities.dependenciesJson,
    })
    .from(arquimedesCapabilities)
    .where(
      and(
        eq(arquimedesCapabilities.status, "installed"),
        eq(arquimedesCapabilities.enabled, true)
      )
    );

  const blocking = installed.filter(row =>
    parseDependencies(row.dependenciesJson).includes(capabilityId)
  );
  if (blocking.length) {
    throw new Error(
      'Não é possível remover "' +
        definition.name +
        '" porque está sendo usada por: ' +
        blocking.map(item => item.name).join(", ") +
        "."
    );
  }

  const now = new Date();
  await db
    .update(arquimedesCapabilities)
    .set({ status: "available", enabled: false, updatedAt: now })
    .where(eq(arquimedesCapabilities.id, capabilityId));

  await recordEvent(db, {
    capabilityId,
    userId,
    action: "uninstalled",
    fromStatus: "installed",
    toStatus: "available",
    detail: 'Capacidade "' + definition.name + '" removida.',
  });

  return {
    capabilityId,
    name: definition.name,
    status: "available" as const,
    enabled: false,
  };
}

export async function listArquimedesCapabilitiesForRuntime(userId: number) {
  const snapshot = await getArquimedesCapabilitySnapshot(userId);
  return snapshot.capabilities.filter(
    item => item.status === "installed" && item.enabled
  );
}
