import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { projects, projectPlanVersions, wbsNodes, scheduleActivities, scheduleDependencies, agentProjectStates, agentFindings } from "../../drizzle/schema";
import { validateEap, validateEapScope } from "../construction/eap-validator";
import { validateEapForBaseline } from "../construction/eap-approval-validator";
import { listPlanVersionDetails } from "../construction/plan-versions";

export async function runAuroraEapDiagnostic() {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const [project] = await db.select().from(projects).where(eq(projects.code, "OB-PUPOCN")).limit(1);
  if (!project) throw new Error("OB-PUPOCN não encontrada");
  const versions = await db.select().from(projectPlanVersions).where(eq(projectPlanVersions.projectId, project.id)).orderBy(desc(projectPlanVersions.versionNumber));
  const details = await listPlanVersionDetails(project.id);
  const perVersion = [];
  for (const v of versions) {
    const nodes = await db.select().from(wbsNodes).where(and(eq(wbsNodes.projectId, project.id), eq(wbsNodes.versionId, v.id)));
    const activities = await db.select().from(scheduleActivities).where(and(eq(scheduleActivities.projectId, project.id), eq(scheduleActivities.versionId, v.id)));
    const deps = await db.select().from(scheduleDependencies).where(and(eq(scheduleDependencies.projectId, project.id), eq(scheduleDependencies.versionId, v.id)));
    const structural = validateEap(nodes);
    const scope = validateEapScope(nodes, { requireDictionaryForLeaves: true });
    const baseline = validateEapForBaseline(nodes);
    perVersion.push({
      id:v.id, number:v.versionNumber, status:v.status, nodes:nodes.length, activities:activities.length, deps:deps.length,
      structuralValid:structural.valid, structuralIssues:structural.issues.slice(0,12),
      scopeIssues:scope.issues.slice(0,12), baselineReady:baseline.readyForBaseline, baselineIssues:baseline.issues.slice(0,12)
    });
  }
  const [state] = await db.select().from(agentProjectStates).where(eq(agentProjectStates.projectId, project.id)).limit(1);
  const findings = await db.select({id:agentFindings.id,status:agentFindings.status,classification:agentFindings.classification,description:agentFindings.description,stage:agentFindings.stage}).from(agentFindings).where(eq(agentFindings.projectId,project.id));
  return {project:{id:project.id,code:project.code,name:project.name}, state, versions:perVersion, details, findings};
}