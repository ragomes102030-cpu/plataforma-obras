import { asc, eq, or, desc } from "drizzle-orm";
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

// Tipos para paginação
export type PaginationParams = {
  limit?: number;
  offset?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

function requireDatabase<T>(db: T | null): T {
  if (!db) {
    throw new Error(
      \"Banco local indisponível; DATABASE_URL não configurada ou conexão não criada.\"
    );
  }
  return db;
}

export class DrizzleLocalDatabaseReaderV2 implements LocalDatabaseReader {
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

  // Nova versão com paginação
  async listEapNodesPaginated(
    projectId: number,
    params: PaginationParams = {}
  ): Promise<PaginatedResult<EapEvidenceNode>> {
    const db = requireDatabase(await getDb());
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await db
      .select({ count: 1 })
      .from(wbsNodes)
      .where(eq(wbsNodes.projectId, projectId));
    const total = countResult.length;

    const rows = await db
      .select()
      .from(wbsNodes)
      .where(eq(wbsNodes.projectId, projectId))
      .orderBy(asc(wbsNodes.sortOrder), asc(wbsNodes.id))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(row => ({
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
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
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

  // Nova versão com paginação
  async listActivitiesPaginated(
    projectId: number,
    params: PaginationParams = {}
  ): Promise<PaginatedResult<ScheduleEvidenceActivity>> {
    const db = requireDatabase(await getDb());
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await db
      .select({ count: 1 })
      .from(scheduleActivities)
      .where(eq(scheduleActivities.projectId, projectId));
    const total = countResult.length;

    const rows = await db
      .select()
      .from(scheduleActivities)
      .where(eq(scheduleActivities.projectId, projectId))
      .orderBy(asc(scheduleActivities.sortOrder), asc(scheduleActivities.id))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(row => ({
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
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  // Filtro por status com índice composto
  async listActivitiesByStatus(
    projectId: number,
    status: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResult<ScheduleEvidenceActivity>> {
    const db = requireDatabase(await getDb());
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await db
      .select({ count: 1 })
      .from(scheduleActivities)
      .where(
        or(
          eq(scheduleActivities.projectId, projectId),
          eq(scheduleActivities.status, status)
        )
      );
    const total = countResult.length;

    const rows = await db
      .select()
      .from(scheduleActivities)
      .where(
        or(
          eq(scheduleActivities.projectId, projectId),
          eq(scheduleActivities.status, status)
        )
      )
      .orderBy(asc(scheduleActivities.sortOrder))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(row => ({
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
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  // Filtro por fase
  async listActivitiesByPhase(
    projectId: number,
    phase: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResult<ScheduleEvidenceActivity>> {
    const db = requireDatabase(await getDb());
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await db
      .select({ count: 1 })
      .from(scheduleActivities)
      .where(
        or(
          eq(scheduleActivities.projectId, projectId),
          eq(scheduleActivities.phase, phase)
        )
      );
    const total = countResult.length;

    const rows = await db
      .select()
      .from(scheduleActivities)
      .where(
        or(
          eq(scheduleActivities.projectId, projectId),
          eq(scheduleActivities.phase, phase)
        )
      )
      .orderBy(asc(scheduleActivities.sortOrder))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(row => ({
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
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
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

  // Nova versão com paginação
  async listDependenciesPaginated(
    projectId: number,
    params: PaginationParams = {}
  ): Promise<PaginatedResult<ScheduleEvidenceDependency>> {
    const db = requireDatabase(await getDb());
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await db
      .select({ count: 1 })
      .from(scheduleDependencies)
      .where(eq(scheduleDependencies.projectId, projectId));
    const total = countResult.length;

    const rows = await db
      .select()
      .from(scheduleDependencies)
      .where(eq(scheduleDependencies.projectId, projectId))
      .orderBy(asc(scheduleDependencies.id))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map(row => ({
        id: row.id,
        projectId: row.projectId,
        externalId: row.externalId,
        predecessorId: row.predecessorId,
        successorId: row.successorId,
        type: row.type,
        lag: row.lag,
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }
}

export const localDatabaseEvidenceSource = new LocalDatabaseEvidenceSource(
  new DrizzleLocalDatabaseReaderV2()
);

