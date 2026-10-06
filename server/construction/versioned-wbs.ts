import { and, eq } from "drizzle-orm";
import { wbsNodes } from "../../drizzle/schema";
import type { getDb } from "../db";

export type VersionedWbsNodeRef = {
  id: number;
  code: string;
  versionId: number | null;
};

/**
 * Resolve um ID de nó EAP possivelmente histórico para o nó equivalente na
 * versão alvo. O fork do plano cria novos IDs; o código WBS é a identidade
 * estável dentro do corredor EAP -> atividades.
 */
export async function resolveWbsNodeInVersion(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  nodeId: number,
  versionId: number
): Promise<VersionedWbsNodeRef | null> {
  const [source] = await db
    .select({ id: wbsNodes.id, code: wbsNodes.code, versionId: wbsNodes.versionId })
    .from(wbsNodes)
    .where(and(eq(wbsNodes.id, nodeId), eq(wbsNodes.projectId, projectId)))
    .limit(1);

  if (!source) return null;
  if (source.versionId === versionId) return source;

  const [mapped] = await db
    .select({ id: wbsNodes.id, code: wbsNodes.code, versionId: wbsNodes.versionId })
    .from(wbsNodes)
    .where(
      and(
        eq(wbsNodes.projectId, projectId),
        eq(wbsNodes.versionId, versionId),
        eq(wbsNodes.code, source.code)
      )
    )
    .limit(1);

  return mapped ?? null;
}
