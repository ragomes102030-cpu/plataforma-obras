import { eq } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectPlanVersions, projects, users, wbsNodes } from "../../drizzle/schema";
import { pgliteComSchema } from "../test-helpers/pglite";

const alvo = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../db", async importOriginal => {
  const real = await importOriginal<typeof import("../db")>();
  return { ...real, getDb: async () => alvo.db };
});

const { ensureWritablePlanVersion } = await import("./plan-versions");
const { resolveWbsNodeInVersion } = await import("./versioned-wbs");

type Db = NonNullable<typeof alvo.db>;

let pg: PGlite;
let db: Db;

let sequenciaObra = 0;

async function criarObra() {
  sequenciaObra += 1;
  const [userId] = await db
    .insert(users)
    .values({ openId: `versioned-wbs-${sequenciaObra}`, name: "Teste versioned WBS" })
    .$returningIds();

  const [projectId] = await db
    .insert(projects)
    .values({
      ownerUserId: userId,
      code: "VWBS",
      name: "Obra versionada",
      location: "Teste",
      plannedStart: new Date("2026-01-01T00:00:00Z"),
      plannedFinish: new Date("2026-12-31T00:00:00Z"),
    })
    .$returningIds();

  return { userId, projectId };
}

beforeEach(async () => {
  pg = await pgliteComSchema();
  db = drizzlePglite(pg) as Db;
  alvo.db = db;
});

afterEach(async () => {
  await pg.close();
});

describe("resolveWbsNodeInVersion", () => {
  it("mantem o mesmo ID quando o no ja pertence a versao alvo", async () => {
    const { userId, projectId } = await criarObra();
    const writable = await ensureWritablePlanVersion(projectId, userId);

    const [nodeId] = await db
      .insert(wbsNodes)
      .values({
        projectId,
        versionId: writable.id,
        code: "1.1",
        name: "Fundacoes",
        level: 2,
        nodeType: "pacote",
        sortOrder: 0,
      })
      .$returningIds();

    const resolved = await resolveWbsNodeInVersion(db, projectId, nodeId, writable.id);
    expect(resolved).toEqual({ id: nodeId, code: "1.1", versionId: writable.id });
  });

  it("mapeia o ID aprovado para o clone da nova versao de trabalho", async () => {
    const { userId, projectId } = await criarObra();
    const v1 = await ensureWritablePlanVersion(projectId, userId);

    const [approvedNodeId] = await db
      .insert(wbsNodes)
      .values({
        projectId,
        versionId: v1.id,
        code: "1.2.3",
        name: "Alvenaria",
        level: 3,
        nodeType: "pacote",
        sortOrder: 0,
      })
      .$returningIds();

    await db
      .update(projectPlanVersions)
      .set({ status: "approved" })
      .where(eq(projectPlanVersions.id, v1.id));

    const v2 = await ensureWritablePlanVersion(projectId, userId);
    expect(v2.id).not.toBe(v1.id);

    const resolved = await resolveWbsNodeInVersion(db, projectId, approvedNodeId, v2.id);
    expect(resolved).not.toBeNull();
    expect(resolved!.id).not.toBe(approvedNodeId);
    expect(resolved).toMatchObject({ code: "1.2.3", versionId: v2.id });
  });

  it("nao cruza obras mesmo quando o codigo WBS coincide", async () => {
    const primeira = await criarObra();
    const segunda = await criarObra();

    const v1 = await ensureWritablePlanVersion(primeira.projectId, primeira.userId);
    const v2 = await ensureWritablePlanVersion(segunda.projectId, segunda.userId);

    const [nodeId] = await db
      .insert(wbsNodes)
      .values({
        projectId: primeira.projectId,
        versionId: v1.id,
        code: "1.1",
        name: "Pacote A",
        level: 2,
        nodeType: "pacote",
        sortOrder: 0,
      })
      .$returningIds();

    await db.insert(wbsNodes).values({
      projectId: segunda.projectId,
      versionId: v2.id,
      code: "1.1",
      name: "Pacote B",
      level: 2,
      nodeType: "pacote",
      sortOrder: 0,
    });

    const resolved = await resolveWbsNodeInVersion(
      db,
      segunda.projectId,
      nodeId,
      v2.id
    );
    expect(resolved).toBeNull();
  });
});
