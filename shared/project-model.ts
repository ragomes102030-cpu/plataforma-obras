/**
 * Modelo digital da obra — objeto unificado que agrega todos os dados
 * de uma obra em uma única estrutura. É o "modelo mental" que a IA
 * consulta para raciocionar sobre a obra de forma integrada.
 *
 * Não modifica dados. Só lê.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ProjectModel {
  project: typeof schema.projects.$inferSelect;
  currentVersion: typeof schema.projectPlanVersions.$inferSelect | null;
  eap: typeof schema.wbsNodes.$inferSelect[];
  activities: typeof schema.scheduleActivities.$inferSelect[];
  dependencies: typeof schema.scheduleDependencies.$inferSelect[];
  budget: {
    version: typeof schema.budgetVersions.$inferSelect | null;
    items: typeof schema.budgetItems.$inferSelect[];
  };
  resources: typeof schema.planningResources.$inferSelect[];
  production: {
    fronts: typeof schema.productionFronts.$inferSelect[];
    teams: typeof schema.productionTeams.$inferSelect[];
    entries: typeof schema.productionEntries.$inferSelect[];
  };
  baselines: {
    version: typeof schema.scheduleBaselines.$inferSelect;
    items: typeof schema.scheduleBaselineItems.$inferSelect[];
  }[];
  mcpIntegrations: typeof schema.projectMcpIntegrations.$inferSelect[];
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Retorna o modelo digital completo de uma obra.
 * Lê todas as tabelas relacionadas e agrega em uma única estrutura.
 * Não modifica nenhum dado.
 */
export async function getProjectModel(
  db: NodePgDatabase<typeof schema>,
  projectId: number
): Promise<ProjectModel> {
  // Projeto
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    throw new Error(`Projeto ${projectId} não encontrado.`);
  }

  // Versão atual do plano (a mais recente)
  const [currentVersion] = await db
    .select()
    .from(schema.projectPlanVersions)
    .where(eq(schema.projectPlanVersions.projectId, projectId))
    .orderBy(schema.projectPlanVersions.versionNumber)
    .limit(1);

  const versionId = currentVersion?.id ?? null;

  // EAP (WBS)
  const eap = versionId
    ? await db
        .select()
        .from(schema.wbsNodes)
        .where(eq(schema.wbsNodes.versionId, versionId))
        .orderBy(schema.wbsNodes.sortOrder)
    : [];

  // Atividades
  const activities = versionId
    ? await db
        .select()
        .from(schema.scheduleActivities)
        .where(eq(schema.scheduleActivities.versionId, versionId))
        .orderBy(schema.scheduleActivities.sortOrder)
    : [];

  // Dependências
  const dependencies = versionId
    ? await db
        .select()
        .from(schema.scheduleDependencies)
        .where(eq(schema.scheduleDependencies.versionId, versionId))
    : [];

  // Orçamento (versão mais recente)
  const [budgetVersion] = await db
    .select()
    .from(schema.budgetVersions)
    .where(eq(schema.budgetVersions.projectId, projectId))
    .orderBy(schema.budgetVersions.versionNumber)
    .limit(1);

  const budgetItems = budgetVersion
    ? await db
        .select()
        .from(schema.budgetItems)
        .where(eq(schema.budgetItems.budgetVersionId, budgetVersion.id))
        .orderBy(schema.budgetItems.sortOrder)
    : [];

  // Recursos
  const resources = await db
    .select()
    .from(schema.planningResources)
    .where(eq(schema.planningResources.projectId, projectId));

  // Produção
  const [fronts, teams, entries] = await Promise.all([
    db
      .select()
      .from(schema.productionFronts)
      .where(eq(schema.productionFronts.projectId, projectId)),
    db
      .select()
      .from(schema.productionTeams)
      .where(eq(schema.productionTeams.projectId, projectId)),
    db
      .select()
      .from(schema.productionEntries)
      .where(eq(schema.productionEntries.projectId, projectId)),
  ]);

  // Baselines
  const baselineVersions = await db
    .select()
    .from(schema.scheduleBaselines)
    .where(eq(schema.scheduleBaselines.projectId, projectId))
    .orderBy(schema.scheduleBaselines.createdAt);

  const baselines: ProjectModel["baselines"] = [];
  for (const bv of baselineVersions) {
    const items = await db
      .select()
      .from(schema.scheduleBaselineItems)
      .where(eq(schema.scheduleBaselineItems.baselineId, bv.id));
    baselines.push({ version: bv, items });
  }

  // Integrações MCP
  const mcpIntegrations = await db
    .select()
    .from(schema.projectMcpIntegrations)
    .where(eq(schema.projectMcpIntegrations.projectId, projectId));

  return {
    project,
    currentVersion: currentVersion ?? null,
    eap,
    activities,
    dependencies,
    budget: {
      version: budgetVersion ?? null,
      items: budgetItems,
    },
    resources,
    production: {
      fronts,
      teams,
      entries,
    },
    baselines,
    mcpIntegrations,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retorna um resumo textual do modelo — útil para logs e debug.
 */
export function summarizeProjectModel(model: ProjectModel): string {
  const { project, currentVersion, eap, activities, dependencies, budget, resources, production, baselines, mcpIntegrations } = model;

  const totalBudget = budget.items.reduce(
    (sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)),
    0
  );

  const totalProduced = production.entries.reduce(
    (sum, entry) => sum + Number(entry.quantity),
    0
  );

  const totalPlanned = activities.reduce(
    (sum, act) => sum + (act.plannedQuantity ? Number(act.plannedQuantity) : 0),
    0
  );

  const fmtBRL = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const fmtQty = (v: number) => v.toLocaleString("pt-BR");

  return [
    `Projeto: ${project.code} — ${project.name}`,
    `Status: ${project.status} | Progresso: ${project.progress}%`,
    `Versão do plano: ${currentVersion ? `v${currentVersion.versionNumber} (${currentVersion.status})` : "nenhuma"}`,
    `EAP: ${eap.length} ${eap.length === 1 ? "nó" : "nós"}`,
    `Atividades: ${activities.length} ${activities.length === 1 ? "atividade" : "atividades"} (${dependencies.length} dependências)`,
    `Orçamento: ${budget.items.length} ${budget.items.length === 1 ? "item" : "itens"}, ${fmtBRL(totalBudget)}`,
    `Recursos: ${resources.length}`,
    `Produção: ${production.entries.length} ${production.entries.length === 1 ? "lançamento" : "lançamentos"}, ${fmtQty(totalProduced)} de ${fmtQty(totalPlanned)} planejados`,
    `Baselines: ${baselines.length}`,
    `Integrações MCP: ${mcpIntegrations.length}`,
  ].join("\n");
}
