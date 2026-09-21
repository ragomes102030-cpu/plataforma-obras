import { asc, eq, or } from "drizzle-orm";
import {
  scheduleActivities,
  scheduleDependencies,
  wbsNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type {
  EapEvidenceNode,
  LocalDatabaseReader,
  ScheduleEvidenceActivity,
  ScheduleEvidenceDependency,
} from "./domain-types";
import { LocalDatabaseEvidenceSource } from "./evidence-source";

function requireDatabase<T>(db: T | null): T {
  if (!db) {
    throw new Error(
      "Banco local indisponível; DATABASE_URL não configurada ou conexão não criada."
    );
  }
  return db;
}

export class DrizzleLocalDatabaseReader implements LocalDatabaseReader {
  async listEapNodes(projectId: number): Promise<EapEvidenceNode[]> {
    const db = requireDatabase(await getDb());
    const rows = await db
      .select()
      .from(wbsNodes)
      .where(eq(wbsNodes.projectId, projectId))
      .orderBy(asc(wbsNodes.sortOrder), asc(wbsNodes.id));

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      externalId: row.externalId,
      externalUid: row.externalUid,
      parentId: row.parentId,
      code: row.code,
      name: row.name,
      level: row.level,
      nodeType: row.nodeType,
      unit: row.unit,
      plannedQuantity: row.plannedQuantity,
      sortOrder: row.sortOrder,
    }));
  }

  async getEapNode(
    projectId: number,
    ref: string
  ): Promise<EapEvidenceNode | null> {
    const db = requireDatabase(await getDb());
    const rows = await db
      .select()
      .from(wbsNodes)
      .where(
        or(
          eq(wbsNodes.externalId, ref),
          eq(wbsNodes.externalUid, ref),
          eq(wbsNodes.code, ref)
        )
      )
      .limit(20);

    const row = rows.find(candidate => candidate.projectId === projectId);
    if (!row) return null;

    return {
      id: row.id,
      projectId: row.projectId,
      externalId: row.externalId,
      externalUid: row.externalUid,
      parentId: row.parentId,
      code: row.code,
      name: row.name,
      level: row.level,
      nodeType: row.nodeType,
      unit: row.unit,
      plannedQuantity: row.plannedQuantity,
      sortOrder: row.sortOrder,
    };
  }

  async listActivities(projectId: number): Promise<ScheduleEvidenceActivity[]> {
    const db = requireDatabase(await getDb());
    const rows = await db
      .select()
      .from(scheduleActivities)
      .where(eq(scheduleActivities.projectId, projectId))
      .orderBy(asc(scheduleActivities.sortOrder), asc(scheduleActivities.id));

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      externalId: row.externalId,
      eapRef: row.eapRef,
      wbsCode: row.wbsCode,
      name: row.name,
      phase: row.phase,
      startOffset: row.startOffset,
      durationDays: row.durationDays,
      progress: row.progress,
      status: row.status,
      critical: row.critical,
      sortOrder: row.sortOrder,
    }));
  }

  async listDependencies(
    projectId: number
  ): Promise<ScheduleEvidenceDependency[]> {
    const db = requireDatabase(await getDb());
    const rows = await db
      .select()
      .from(scheduleDependencies)
      .where(eq(scheduleDependencies.projectId, projectId))
      .orderBy(asc(scheduleDependencies.id));

    return rows.map(row => ({
      id: row.id,
      projectId: row.projectId,
      externalId: row.externalId,
      predecessorId: row.predecessorId,
      successorId: row.successorId,
      type: row.type,
      lag: row.lag,
    }));
  }
}

export const localDatabaseEvidenceSource = new LocalDatabaseEvidenceSource(
  new DrizzleLocalDatabaseReader()
);
