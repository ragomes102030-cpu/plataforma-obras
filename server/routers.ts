import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  projects,
  productionEntries,
  productionFronts,
  productionTeams,
  productionUnits,
  mcpMutationOperations,
  mcpHomologationRuns,
  projectMcpIntegrations,
  agentProjectStates,
  agentDecisions,
  agentFindings,
  agentMemories,
  scheduleActivities,
  scheduleDependencies,
  wbsNodes,
  budgetVersions,
  budgetItems,
  priceCatalogs,
  priceItems,
  serviceCompositions,
  compositionComponents,
  planningResources,
  activityResourceAllocations,
  scheduleBaselines,
  scheduleBaselineItems,
} from "../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { buildAgentProjectContext } from "./agent/context-builder";
import { localDatabaseEvidenceSource } from "./construction/local-database-source";
import { EvidenceSourceRouter } from "./construction/evidence-router";
import { ConstructionMcpEvidenceSource } from "./construction/mcp-evidence-source";
import { validateEap } from "./construction/eap-validator";
import { calculateDeterministicCpm } from "./construction/cpm-calculator";
import {
  getAgentExecutionStatus,
  startAgentExecution,
} from "./agent-execution";
import { getPublicLlmSettings, saveStoredLlmProvider } from "./llm-settings";
import {
  callControlledMcpTool,
  callReadOnlyMcpTool,
  CONTROLLED_MUTATION_POLICY,
  getConstructionMcpStatus,
  PROJECT_SCOPED_READ_ONLY_TOOLS,
  runConstructionMcpHomologation,
} from "./integrations/construction-mcps";
import {
  buildPhase7ImportPlan,
  type Phase7ImportPlan,
} from "./integrations/phase7-import";
import {
  COORDINATOR_STAGES,
  nextCoordinatorStage,
} from "../shared/construction-stages";
import {
  describeStageGate,
  evaluateStageTransition,
} from "./construction/stage-gates";

const demoProjects = [
  {
    id: 1,
    ownerUserId: null,
    code: "ED-22",
    name: "Edifício Residencial 22 Pavimentos",
    location: "São Paulo, SP",
    status: "Em execução" as const,
    progress: 38,
    plannedStart: new Date("2026-10-01T00:00:00Z"),
    plannedFinish: new Date("2027-03-27T00:00:00Z"),
    createdAt: new Date("2026-09-19T00:00:00Z"),
    updatedAt: new Date("2026-09-19T00:00:00Z"),
  },
  {
    id: 2,
    ownerUserId: null,
    code: "TR-08",
    name: "Torre Residencial Parque Norte",
    location: "Campinas, SP",
    status: "Planejamento" as const,
    progress: 12,
    plannedStart: new Date("2027-01-11T00:00:00Z"),
    plannedFinish: new Date("2027-11-19T00:00:00Z"),
    createdAt: new Date("2026-09-18T00:00:00Z"),
    updatedAt: new Date("2026-09-18T00:00:00Z"),
  },
];

const demoActivities = [
  ["1.1", "Mobilização e canteiro", "Preparação", 0, 14, 100, "Concluído", 0],
  ["1.2", "Fundação e contenções", "Estrutura", 10, 28, 82, "Em andamento", 1],
  [
    "1.3",
    "Estrutura dos pavimentos 01–22",
    "Estrutura",
    38,
    178,
    44,
    "Em andamento",
    1,
  ],
  [
    "1.4",
    "Alvenaria dos pavimentos 01–22",
    "Vedação",
    70,
    146,
    29,
    "Em andamento",
    0,
  ],
  [
    "1.5",
    "Instalações prediais",
    "Instalações",
    102,
    121,
    18,
    "Em andamento",
    0,
  ],
  [
    "1.6",
    "Acabamentos e áreas comuns",
    "Acabamentos",
    148,
    82,
    5,
    "Não iniciado",
    0,
  ],
  [
    "1.7",
    "Comissionamento e entrega",
    "Entrega",
    208,
    12,
    0,
    "Não iniciado",
    0,
  ],
].map((item, index) => ({
  id: index + 1,
  projectId: 1,
  wbsCode: item[0] as string,
  name: item[1] as string,
  phase: item[2] as string,
  startOffset: item[3] as number,
  durationDays: item[4] as number,
  progress: item[5] as number,
  status: item[6] as string,
  critical: item[7] as number,
  sortOrder: index,
  createdAt: new Date("2026-09-19T00:00:00Z"),
  updatedAt: new Date("2026-09-19T00:00:00Z"),
}));

const starterWbs = [
  ["1", "Serviços preliminares", 1, "grupo"],
  ["1.1", "Canteiro e mobilização", 2, "pacote"],
  ["2", "Fundação e contenções", 1, "grupo"],
  ["2.1", "Escavação e contenção", 2, "pacote"],
  ["3", "Estrutura", 1, "grupo"],
  ["3.1", "Estrutura dos pavimentos", 2, "pacote"],
  ["4", "Vedação e instalações", 1, "grupo"],
  ["4.1", "Alvenaria", 2, "pacote"],
  ["4.2", "Instalações prediais", 2, "pacote"],
  ["5", "Acabamentos e entrega", 1, "grupo"],
  ["5.1", "Acabamentos e áreas comuns", 2, "pacote"],
  ["5.2", "Comissionamento e entrega", 2, "pacote"],
] as const;

const starterActivities = [
  ["1.1", "Mobilização e canteiro", "Preparação", 0, 14],
  ["2.1", "Fundação e contenções", "Estrutura", 14, 28],
  ["3.1", "Estrutura dos pavimentos", "Estrutura", 42, 178],
  ["4.1", "Alvenaria dos pavimentos", "Vedação", 80, 146],
  ["4.2", "Instalações prediais", "Instalações", 100, 121],
  ["5.1", "Acabamentos e áreas comuns", "Acabamentos", 150, 82],
  ["5.2", "Comissionamento e entrega", "Entrega", 232, 12],
] as const;

const starterFronts = [
  ["F-01", "Estrutura", "Pavimentos 01–22"],
  ["F-02", "Vedação", "Pavimentos 01–22"],
  ["F-03", "Instalações", "Pavimentos 01–22"],
] as const;

const starterTeams = [
  ["Equipe estrutura", "Estrutura", 8],
  ["Equipe alvenaria", "Vedação", 6],
  ["Equipe instalações", "Instalações", 5],
] as const;

const starterUnits = Array.from({ length: 5 }, (_, index) => ({
  code: `P${String(index + 1).padStart(2, "0")}`,
  name: `Pavimento ${String(index + 1).padStart(2, "0")}`,
  unitType: "pavimento",
  sortOrder: index,
}));

async function seedStarterPlan(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
) {
  await db.insert(wbsNodes).values(
    starterWbs.map(([code, name, level, nodeType], index) => ({
      projectId,
      code,
      name,
      level,
      nodeType,
      parentId: null,
      sortOrder: index,
    }))
  );
  const inserted = await db
    .insert(scheduleActivities)
    .values(
      starterActivities.map(
        ([wbsCode, name, phase, startOffset, durationDays], index) => ({
          projectId,
          wbsCode,
          name,
          phase,
          startOffset,
          durationDays,
          progress: 0,
          status: "Não iniciado" as const,
          critical: 0,
          sortOrder: index,
        })
      )
    )
    .$returningId();
  await db.insert(scheduleDependencies).values(
    inserted.slice(0, -1).map((activity, index) => ({
      projectId,
      predecessorId: activity.id,
      successorId: inserted[index + 1].id,
      type: "FS" as const,
      lag: 0,
    }))
  );
  await seedProductionCatalog(db, projectId);
}

async function seedSolarAcaciasPlan(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
) {
  type NodeType = "grupo" | "pacote" | "entrega";
  let order = 0;
  const addNode = async (parentId: number | null, code: string, name: string, level: number, nodeType: NodeType, unit?: string, plannedQuantity?: number) => {
    const [created] = await db.insert(wbsNodes).values({ projectId, parentId, code, name, level, nodeType, unit: unit ?? null, plannedQuantity: plannedQuantity ?? null, sortOrder: order++ }).$returningId();
    return created.id;
  };
  const rootId = await addNode(null, "1", "Edifício Residencial Solar das Acácias", 1, "grupo");
  const addPhase = async (code: string, name: string) => addNode(rootId, code, name, 2, "pacote");
  const addLocationPackages = async (parentId: number, code: string, location: string, packages: Array<[string, string, string?, number?]>) => {
    const locationId = await addNode(parentId, code, location, 3, "pacote");
    for (const [suffix, name, unit, quantity] of packages) await addNode(locationId, `${code}.${suffix}`, name, 4, "entrega", unit, quantity);
  };
  const preliminary = await addPhase("1.1", "Serviços preliminares e implantação");
  await addLocationPackages(preliminary, "1.1.1", "Canteiro e mobilização", [["1", "Instalação do canteiro", "mês", 1], ["2", "Locação e gabarito", "m²", 6800], ["3", "Ligações provisórias", "un", 1]]);
  await addLocationPackages(preliminary, "1.1.2", "Administração direta", [["1", "Planejamento executivo e compatibilização", "mês", 24], ["2", "Segurança, qualidade e meio ambiente", "mês", 24]]);
  const foundation = await addPhase("1.2", "Fundação e contenções");
  await addLocationPackages(foundation, "1.2.1", "Subsolo e escavação", [["1", "Escavação do subsolo", "m³", 2400], ["2", "Cortina de contenção em concreto", "m²", 850], ["3", "Impermeabilização de contenção", "m²", 850]]);
  await addLocationPackages(foundation, "1.2.2", "Fundação profunda", [["1", "Estacas hélice contínua Ø40 cm", "m", 768], ["2", "Blocos de coroamento", "un", 48], ["3", "Vigas baldrame e arranques", "m", 220]]);
  const structure = await addPhase("1.3", "Estrutura de concreto armado");
  const structuralLocations = ["Laje do subsolo", "Laje do térreo", ...Array.from({ length: 8 }, (_, index) => `Laje do pavimento-tipo ${index + 2}`), "Laje de cobertura"];
  for (let index = 0; index < structuralLocations.length; index += 1) {
    const location = structuralLocations[index];
    await addLocationPackages(structure, `1.3.${index + 1}`, location, [["1", "Formas de compensado plastificado", "m²", index > 1 && index < 10 ? 1100 : 1000], ["2", "Armação de aço", "kg", index > 1 && index < 10 ? 12500 : 10500], ["3", "Pilares, vigas e escoramento", "m³", index > 1 && index < 10 ? 145 : 130], ["4", "Concretagem da laje", "m³", index > 1 && index < 10 ? 145 : 130], ["5", "Cura, desforma e reescoramento", "dia", 7]]);
  }
  const masonry = await addPhase("1.4", "Vedação e fachadas");
  const masonryLocations = ["Subsolo", "Térreo", ...Array.from({ length: 8 }, (_, index) => `Pavimento-tipo ${index + 2}`), "Cobertura"];
  for (let index = 0; index < masonryLocations.length; index += 1) await addLocationPackages(masonry, `1.4.${index + 1}`, masonryLocations[index], [["1", "Alvenaria de blocos cerâmicos", "m²", index > 1 && index < 10 ? 780 : 520], ["2", "Vergas, contravergas e encunhamento", "m", 260], ["3", "Revestimento externo base", "m²", 300]]);
  const installations = await addPhase("1.5", "Instalações prediais");
  await addLocationPackages(installations, "1.5.1", "Prumadas e áreas comuns", [["1", "Instalações hidrossanitárias", "m", 1800], ["2", "Instalações elétricas e SPDA", "m", 4200], ["3", "Gás e combate a incêndio", "m", 1200], ["4", "Infraestrutura dos elevadores", "un", 2]]);
  await addLocationPackages(installations, "1.5.2", "Unidades privativas", [["1", "Pontos hidrossanitários", "un", 256], ["2", "Pontos elétricos", "un", 980], ["3", "Sistemas de medição", "un", 64]]);
  const finishes = await addPhase("1.6", "Revestimentos e acabamentos");
  await addLocationPackages(finishes, "1.6.1", "Áreas internas", [["1", "Emboço e reboco interno", "m²", 15800], ["2", "Contrapiso", "m²", 5600], ["3", "Piso cerâmico", "m²", 4900], ["4", "Pintura interna", "m²", 16200]]);
  await addLocationPackages(finishes, "1.6.2", "Fachadas e áreas externas", [["1", "Reboco externo", "m²", 3600], ["2", "Textura e pintura externa", "m²", 3600], ["3", "Esquadrias de alumínio", "un", 320], ["4", "Guarda-corpos de vidro", "m", 680]]);
  const delivery = await addPhase("1.7", "Comissionamento e entrega");
  await addLocationPackages(delivery, "1.7.1", "Áreas comuns e cobertura", [["1", "Impermeabilização da cobertura", "m²", 720], ["2", "Barrilete e reservatório superior", "un", 1], ["3", "Casa de máquinas e elevadores", "un", 2], ["4", "Comissionamento dos sistemas", "mês", 2]]);
  await addLocationPackages(delivery, "1.7.2", "Unidades e documentação", [["1", "Louças e metais", "un", 64], ["2", "Testes e entrega das unidades", "un", 32], ["3", "As built, manual e habite-se", "un", 1]]);
  const activityRows = structuralLocations.map((location, index) => ({ projectId, externalId: `SOL-EST-${index + 1}`, eapRef: `1.3.${index + 1}.4`, wbsCode: `1.3.${index + 1}.4`, name: `Ciclo estrutural — ${location}`, phase: "Estrutura", startOffset: 120 + index * 14, durationDays: 14, plannedQuantity: "1", productivity: "0.071", progress: 0, status: "Não iniciado" as const, critical: 0, sortOrder: index }));
  activityRows.push({ projectId, externalId: "SOL-FUND-01", eapRef: "1.2.1.1", wbsCode: "1.2.1.1", name: "Escavação e contenção do subsolo", phase: "Fundação", startOffset: 20, durationDays: 60, plannedQuantity: "2400", productivity: "40", progress: 0, status: "Não iniciado" as const, critical: 0, sortOrder: activityRows.length });
  const inserted = await db.insert(scheduleActivities).values(activityRows).$returningId();
  await db.insert(scheduleDependencies).values(inserted.slice(0, -1).map((item, index) => ({ projectId, predecessorId: item.id, successorId: inserted[index + 1].id, type: "FS" as const, lag: 0 })));
  await seedProductionCatalog(db, projectId);
}

async function seedProductionCatalog(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
) {
  await db.insert(productionFronts).values(
    starterFronts.map(([code, name, location]) => ({
      projectId,
      code,
      name,
      location,
      status: "ativa" as const,
    }))
  );
  await db.insert(productionTeams).values(
    starterTeams.map(([name, trade, memberCount]) => ({
      projectId,
      name,
      trade,
      memberCount,
      active: 1,
    }))
  );
  await db
    .insert(productionUnits)
    .values(starterUnits.map(unit => ({ projectId, ...unit })));
}

const accessibleProjectCondition = (projectId: number, userId: number) =>
  and(eq(projects.id, projectId), eq(projects.ownerUserId, userId));

const mcpProviderSchema = z.enum(["eap", "cronograma", "ganttLob"]);
const mcpProviders = ["eap", "cronograma", "ganttLob"] as const;
type McpProvider = (typeof mcpProviders)[number];

const coordinatorStages = COORDINATOR_STAGES;

function mcpEndpoint(provider: McpProvider) {
  const baseUrl = {
    eap: ENV.mcpEapUrl,
    cronograma: ENV.mcpCronogramaUrl,
    ganttLob: ENV.mcpGanttLobUrl,
  }[provider];
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/mcp") ? normalized : `${normalized}/mcp`;
}

function requestIdFrom(ctx: {
  req: { headers: Record<string, string | string[] | undefined> };
}) {
  const header = ctx.req.headers["x-request-id"];
  return Array.isArray(header)
    ? header[0] || randomUUID()
    : typeof header === "string" && header.trim()
      ? header.trim()
      : randomUUID();
}

async function assertAccessibleProject(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  userId: number
) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(accessibleProjectCondition(projectId, userId))
    .limit(1);
  if (!project)
    throw new Error("Obra não encontrada ou sem permissão de acesso.");
}

function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function loadAgentCoordinatorSnapshot(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  userId: number
) {
  await assertAccessibleProject(db, projectId, userId);
  let [state] = await db
    .select()
    .from(agentProjectStates)
    .where(eq(agentProjectStates.projectId, projectId))
    .limit(1);
  if (!state) {
    await db.insert(agentProjectStates).values({ projectId });
    [state] = await db
      .select()
      .from(agentProjectStates)
      .where(eq(agentProjectStates.projectId, projectId))
      .limit(1);
  }
  if (!state)
    throw new Error("Não foi possível inicializar o estado do coordenador.");

  const gateEvidence = await loadStageGateEvidence(db, projectId, userId, state.blockerCount);
  const gate = describeStageGate(state.stage, gateEvidence);

  const [decisions, findings, memories] = await Promise.all([
    db
      .select()
      .from(agentDecisions)
      .where(
        and(
          eq(agentDecisions.projectId, projectId),
          eq(agentDecisions.userId, userId)
        )
      )
      .orderBy(desc(agentDecisions.createdAt))
      .limit(20),
    db
      .select()
      .from(agentFindings)
      .where(
        and(
          eq(agentFindings.projectId, projectId),
          eq(agentFindings.status, "open")
        )
      )
      .orderBy(desc(agentFindings.createdAt))
      .limit(30),
    db
      .select()
      .from(agentMemories)
      .where(
        and(
          eq(agentMemories.status, "approved"),
          or(
            eq(agentMemories.projectId, projectId),
            and(
              isNull(agentMemories.projectId),
              eq(agentMemories.ownerUserId, userId)
            )
          )
        )
      )
      .orderBy(desc(agentMemories.updatedAt))
      .limit(30),
  ]);

  return {
    stage: state.stage,
    blockerCount: state.blockerCount,
    lastSummary: state.lastSummary,
    nextStage: gate.nextStage,
    canAdvance: gate.canAdvance,
    gateMessage: gate.message,
    gateChecks: gate.checks,
    approvedDecisions: decisions.map(decision => ({
      stage: decision.stage,
      decision: decision.decision,
      scope: parseJsonValue(decision.scopeJson),
      reason: decision.reason,
    })),
    openFindings: findings.map(finding => ({
      classification: finding.classification,
      entityType: finding.entityType,
      entityRef: finding.entityRef,
      description: finding.description,
      impact: finding.impact,
      confidence: finding.confidence,
    })),
    approvedMemories: memories.map(memory => ({
      category: memory.category,
      key: memory.memoryKey,
      value: parseJsonValue(memory.valueJson),
      sourceType: memory.sourceType,
      sourceRef: memory.sourceRef,
      confidence: memory.confidence,
    })),
  };
}

async function loadStageGateEvidence(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  userId: number,
  blockerCount: number
) {
  await assertAccessibleProject(db, projectId, userId);
  const [project, eapNodes, activities, dependencies] = await Promise.all([
    db
      .select({ name: projects.name, location: projects.location })
      .from(projects)
      .where(accessibleProjectCondition(projectId, userId))
      .limit(1),
    db.select().from(wbsNodes).where(eq(wbsNodes.projectId, projectId)),
    db
      .select()
      .from(scheduleActivities)
      .where(eq(scheduleActivities.projectId, projectId)),
    db
      .select()
      .from(scheduleDependencies)
      .where(eq(scheduleDependencies.projectId, projectId)),
  ]);
  const eapValidation = validateEap(eapNodes);
  const cpm = calculateDeterministicCpm(activities, dependencies);
  return {
    hasDescription: Boolean(project[0]?.name?.trim() && project[0]?.location?.trim()),
    eapNodeCount: eapNodes.length,
    eapValid: eapValidation.valid,
    activityCount: activities.length,
    dependenciesValid: cpm.issues.every(issue => issue.code !== "invalid_dependency"),
    cpmValid: cpm.valid,
    blockerCount,
  };
}

async function buildPhase7PlanForProject(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
): Promise<Phase7ImportPlan> {
  const mappings = await db
    .select()
    .from(projectMcpIntegrations)
    .where(eq(projectMcpIntegrations.projectId, projectId));
  const externalProjectId = (provider: McpProvider) => {
    const value = mappings.find(
      item => item.provider === provider
    )?.externalProjectId;
    if (!value || value.toLowerCase() === "default") {
      throw new Error(
        `Cadastre um project_id de homologação válido para o MCP ${provider}.`
      );
    }
    return value;
  };
  const eapProjectId = externalProjectId("eap");
  const cronogramaProjectId = externalProjectId("cronograma");
  const [eapResult, activityResult, dependencyResult] = await Promise.all([
    callReadOnlyMcpTool("eap", "get_eap_tree", { project_id: eapProjectId }),
    callReadOnlyMcpTool("cronograma", "listar_atividades", {
      project_id: cronogramaProjectId,
      limit: 500,
    }),
    callReadOnlyMcpTool("cronograma", "listar_dependencias", {
      project_id: cronogramaProjectId,
    }),
  ]);
  const cpmResult = await callReadOnlyMcpTool(
    "cronograma",
    "calcular_caminho_critico",
    {
      project_id: cronogramaProjectId,
    }
  );
  return buildPhase7ImportPlan(
    cronogramaProjectId,
    eapResult,
    activityResult,
    dependencyResult,
    cpmResult
  );
}

async function persistPhase7Plan(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  plan: Phase7ImportPlan
) {
  const [project] = await db
    .select({ plannedStart: projects.plannedStart })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Obra não encontrada para importar o plano.");
  return db.transaction(async tx => {
    const localWbsByExternalId = new Map<string, number>();
    for (const node of plan.wbsNodes) {
      const parentId = node.parentExternalId
        ? (localWbsByExternalId.get(node.parentExternalId) ?? null)
        : null;
      const existing = await tx
        .select({ id: wbsNodes.id })
        .from(wbsNodes)
        .where(
          and(
            eq(wbsNodes.projectId, projectId),
            eq(wbsNodes.externalId, node.externalId)
          )
        )
        .limit(1);
      if (existing[0]) {
        await tx
          .update(wbsNodes)
          .set({
            externalUid: node.externalUid,
            parentId,
            code: node.code,
            name: node.name,
            level: node.level,
            nodeType: node.nodeType,
            unit: node.unit,
            plannedQuantity: node.plannedQuantity,
            sortOrder: node.sortOrder,
          })
          .where(eq(wbsNodes.id, existing[0].id));
        localWbsByExternalId.set(node.externalId, existing[0].id);
      } else {
        const [created] = await tx
          .insert(wbsNodes)
          .values({
            projectId,
            externalId: node.externalId,
            externalUid: node.externalUid,
            parentId,
            code: node.code,
            name: node.name,
            level: node.level,
            nodeType: node.nodeType,
            unit: node.unit,
            plannedQuantity: node.plannedQuantity,
            sortOrder: node.sortOrder,
          })
          .$returningId();
        localWbsByExternalId.set(node.externalId, created.id);
      }
    }

    const localActivitiesByExternalId = new Map<string, number>();
    for (const activity of plan.activities) {
      const existing = await tx
        .select({ id: scheduleActivities.id })
        .from(scheduleActivities)
        .where(
          and(
            eq(scheduleActivities.projectId, projectId),
            eq(scheduleActivities.externalId, activity.externalId)
          )
        )
        .limit(1);
      const values = {
        projectId,
        externalId: activity.externalId,
        eapRef: activity.eapRef,
        wbsCode: activity.eapRef,
        name: activity.name,
        phase: activity.phase,
        startOffset: activity.startDate
          ? Math.max(
              0,
              Math.round(
                (Date.parse(activity.startDate) -
                  project.plannedStart.getTime()) /
                  86400000
              )
            )
          : 0,
        durationDays: activity.durationDays,
        progress: activity.progress,
        status:
          activity.progress >= 100
            ? ("Concluído" as const)
            : activity.progress > 0
              ? ("Em andamento" as const)
              : ("Não iniciado" as const),
        critical: activity.critical,
        sortOrder: activity.sortOrder,
      };
      if (existing[0]) {
        await tx
          .update(scheduleActivities)
          .set(values)
          .where(eq(scheduleActivities.id, existing[0].id));
        localActivitiesByExternalId.set(activity.externalId, existing[0].id);
      } else {
        const [created] = await tx
          .insert(scheduleActivities)
          .values(values)
          .$returningId();
        localActivitiesByExternalId.set(activity.externalId, created.id);
      }
    }

    for (const dependency of plan.dependencies) {
      const predecessorId = localActivitiesByExternalId.get(
        dependency.predecessorExternalId
      );
      const successorId = localActivitiesByExternalId.get(
        dependency.successorExternalId
      );
      if (!predecessorId || !successorId)
        throw new Error("Dependência sem atividades locais correspondentes.");
      const existing = await tx
        .select({ id: scheduleDependencies.id })
        .from(scheduleDependencies)
        .where(
          and(
            eq(scheduleDependencies.projectId, projectId),
            eq(scheduleDependencies.externalId, dependency.externalId)
          )
        )
        .limit(1);
      const values = {
        projectId,
        externalId: dependency.externalId,
        predecessorId,
        successorId,
        type: dependency.type,
        lag: Math.round(dependency.lag),
      };
      if (existing[0]) {
        await tx
          .update(scheduleDependencies)
          .set(values)
          .where(eq(scheduleDependencies.id, existing[0].id));
      } else {
        await tx.insert(scheduleDependencies).values(values);
      }
    }
    return {
      wbsNodes: localWbsByExternalId.size,
      activities: localActivitiesByExternalId.size,
      dependencies: plan.dependencies.length,
      criticalPath: plan.criticalPath,
      totalDurationDays: plan.totalDurationDays,
    };
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      return { success: true } as const;
    }),
  }),
  admin: router({
    llmSettings: router({
      get: adminProcedure.query(() => getPublicLlmSettings()),
      save: adminProcedure
        .input(
          z.object({
            provider: z.string().trim().min(2).max(80),
            baseUrl: z
              .string()
              .trim()
              .url()
              .refine(value => value.startsWith("https://"), {
                message: "A URL do provedor deve usar HTTPS.",
              }),
            apiKey: z.string().trim().min(10).max(500),
            model: z.string().trim().min(2).max(160),
          })
        )
        .mutation(async ({ ctx, input }) => {
          await saveStoredLlmProvider(input, ctx.user.id);
          return {
            saved: true as const,
            settings: await getPublicLlmSettings(),
          };
        }),
    }),
  }),
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return ENV.allowDemoData ? demoProjects : [];
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.ownerUserId, ctx.user.id))
        .orderBy(desc(projects.updatedAt));
      return rows;
    }),
    activities: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db)
          return ENV.allowDemoData && input.projectId === 1
            ? demoActivities
            : [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const rows = await db
          .select()
          .from(scheduleActivities)
          .where(eq(scheduleActivities.projectId, input.projectId))
          .orderBy(scheduleActivities.sortOrder);
        return rows;
      }),
    updateActivity: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          activityId: z.number().int().positive(),
          name: z.string().trim().min(2).max(220),
          phase: z.string().trim().min(2).max(80),
          startOffset: z.number().int().min(0),
          durationDays: z.number().int().positive(),
          plannedQuantity: z.number().positive().optional(),
          productivity: z.number().positive().optional(),
          progress: z.number().int().min(0).max(100),
          status: z.enum([
            "Não iniciado",
            "Em andamento",
            "Concluído",
            "Em risco",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [activity] = await db
          .select({ id: scheduleActivities.id })
          .from(scheduleActivities)
          .where(
            and(
              eq(scheduleActivities.id, input.activityId),
              eq(scheduleActivities.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!activity) throw new Error("Atividade não encontrada nesta obra.");
        await db
          .update(scheduleActivities)
          .set({
            name: input.name,
            phase: input.phase,
            startOffset: input.startOffset,
            durationDays: input.durationDays,
            plannedQuantity: input.plannedQuantity === undefined ? null : String(input.plannedQuantity),
            productivity: input.productivity === undefined ? null : String(input.productivity),
            progress: input.progress,
            status: input.status,
          })
          .where(eq(scheduleActivities.id, input.activityId));
        return { updated: true as const };
      }),
    wbs: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        return db
          .select()
          .from(wbsNodes)
          .where(eq(wbsNodes.projectId, input.projectId))
          .orderBy(wbsNodes.sortOrder);
      }),
    updateWbsNode: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          nodeId: z.number().int().positive(),
          code: z.string().trim().min(1).max(32),
          name: z.string().trim().min(2).max(220),
          nodeType: z.enum(["grupo", "pacote", "entrega"]),
          unit: z.string().trim().max(32).optional(),
          plannedQuantity: z.number().int().min(0).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [node] = await db
          .select({ id: wbsNodes.id })
          .from(wbsNodes)
          .where(
            and(
              eq(wbsNodes.id, input.nodeId),
              eq(wbsNodes.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!node) throw new Error("Item da EAP não encontrado nesta obra.");
        await db
          .update(wbsNodes)
          .set({
            code: input.code,
            name: input.name,
            nodeType: input.nodeType,
            unit: input.unit || null,
            plannedQuantity: input.plannedQuantity ?? null,
          })
          .where(eq(wbsNodes.id, input.nodeId));
        return { updated: true as const };
      }),
    createWbsNode: protectedProcedure
      .input(z.object({
        projectId: z.number().int().positive(),
        parentId: z.number().int().positive().optional(),
        name: z.string().trim().min(2).max(220),
        nodeType: z.enum(["grupo", "pacote", "entrega"]),
        unit: z.string().trim().max(32).optional(),
        plannedQuantity: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const parent = input.parentId
          ? (await db.select().from(wbsNodes).where(and(eq(wbsNodes.id, input.parentId), eq(wbsNodes.projectId, input.projectId))).limit(1))[0]
          : undefined;
        if (input.parentId && !parent) throw new Error("O pai selecionado não pertence a esta obra.");
        const siblings = await db.select().from(wbsNodes).where(parent ? and(eq(wbsNodes.projectId, input.projectId), eq(wbsNodes.parentId, parent.id)) : and(eq(wbsNodes.projectId, input.projectId), isNull(wbsNodes.parentId))).orderBy(wbsNodes.sortOrder);
        const nextNumber = siblings.reduce((max, item) => Math.max(max, Number(item.code.split(".").at(-1)) || 0), 0) + 1;
        const code = parent ? `${parent.code}.${nextNumber}` : `${nextNumber}`;
        const [created] = await db.insert(wbsNodes).values({
          projectId: input.projectId,
          parentId: parent?.id ?? null,
          code,
          name: input.name,
          level: (parent?.level ?? 0) + 1,
          nodeType: input.nodeType,
          unit: input.unit || null,
          plannedQuantity: input.plannedQuantity ?? null,
          sortOrder: siblings.length,
        }).$returningId();
        return created;
      }),
    moveWbsNode: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), nodeId: z.number().int().positive(), targetParentId: z.number().int().positive().nullable(), targetIndex: z.number().int().min(0).default(0) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const all = await db.select().from(wbsNodes).where(eq(wbsNodes.projectId, input.projectId));
        const node = all.find(item => item.id === input.nodeId);
        const parent = input.targetParentId === null ? undefined : all.find(item => item.id === input.targetParentId);
        if (!node) throw new Error("Item da EAP não encontrado nesta obra.");
        if (input.targetParentId !== null && !parent) throw new Error("Destino inválido.");
        if (parent && (parent.id === node.id || parent.code === node.code || parent.code.startsWith(`${node.code}.`))) throw new Error("Não é possível mover um item para dentro de si mesmo.");
        const siblings = all.filter(item => (parent ? item.parentId === parent.id : item.parentId === null) && item.id !== node.id).sort((a, b) => a.sortOrder - b.sortOrder);
        const index = Math.min(input.targetIndex, siblings.length);
        const ordered = [...siblings];
        ordered.splice(index, 0, node);
        const rootLevel = (parent?.level ?? 0) + 1;
        for (let position = 0; position < ordered.length; position += 1) {
          const root = ordered[position];
          const oldCode = root.code;
          const nextCode = parent ? `${parent.code}.${position + 1}` : `${position + 1}`;
          const levelDelta = root.id === node.id ? rootLevel - root.level : 0;
          const branch = all.filter(item => item.id === root.id || item.code.startsWith(`${oldCode}.`));
          for (const item of branch) {
            const suffix = item.code === oldCode ? "" : item.code.slice(oldCode.length);
            await db.update(wbsNodes).set({ parentId: item.id === root.id ? (root.id === node.id ? (parent?.id ?? null) : root.parentId) : item.parentId, code: `${nextCode}${suffix}`, level: item.level + (root.id === node.id ? levelDelta : 0), sortOrder: item.id === root.id ? position : item.sortOrder }).where(eq(wbsNodes.id, item.id));
          }
        }
        return { moved: true as const };
      }),
    duplicateWbsNode: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), nodeId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [source] = await db.select().from(wbsNodes).where(and(eq(wbsNodes.id, input.nodeId), eq(wbsNodes.projectId, input.projectId))).limit(1);
        if (!source) throw new Error("Item da EAP não encontrado nesta obra.");
        const siblings = await db.select().from(wbsNodes).where(source.parentId === null ? and(eq(wbsNodes.projectId, input.projectId), isNull(wbsNodes.parentId)) : and(eq(wbsNodes.projectId, input.projectId), eq(wbsNodes.parentId, source.parentId))).orderBy(wbsNodes.sortOrder);
        const nextNumber = siblings.reduce((max, item) => Math.max(max, Number(item.code.split(".").at(-1)) || 0), 0) + 1;
        const [created] = await db.insert(wbsNodes).values({ projectId: input.projectId, parentId: source.parentId, code: source.parentId ? `${source.code.split(".").slice(0, -1).join(".")}.${nextNumber}` : `${nextNumber}`, name: `${source.name} (cópia)`, level: source.level, nodeType: source.nodeType, unit: source.unit, plannedQuantity: source.plannedQuantity, sortOrder: siblings.length }).$returningId();
        return created;
      }),
    deleteWbsNode: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), nodeId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [node] = await db.select().from(wbsNodes).where(and(eq(wbsNodes.id, input.nodeId), eq(wbsNodes.projectId, input.projectId))).limit(1);
        if (!node) throw new Error("Item da EAP não encontrado nesta obra.");
        const descendants = await db.select({ id: wbsNodes.id }).from(wbsNodes).where(and(eq(wbsNodes.projectId, input.projectId), or(eq(wbsNodes.id, node.id), eq(wbsNodes.parentId, node.id))));
        const all = await db.select({ id: wbsNodes.id, code: wbsNodes.code }).from(wbsNodes).where(eq(wbsNodes.projectId, input.projectId));
        const ids = all.filter(item => item.id === node.id || item.code.startsWith(`${node.code}.`)).map(item => item.id);
        if (ids.length) await db.delete(wbsNodes).where(inArray(wbsNodes.id, ids));
        return { deleted: true as const, count: Math.max(descendants.length, ids.length) };
      }),
    dependencies: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        return db
          .select()
          .from(scheduleDependencies)
          .where(eq(scheduleDependencies.projectId, input.projectId));
      }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(180),
          location: z.string().trim().min(2).max(180).default("A cadastrar"),
          plannedStart: z.coerce.date().optional(),
          plannedFinish: z.coerce.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db)
          throw new Error(
            "Banco de dados não configurado; a obra não foi persistida."
          );
        const plannedStart = input.plannedStart ?? new Date();
        const plannedFinish =
          input.plannedFinish ??
          new Date(plannedStart.getTime() + 180 * 86400000);
        const code = `OB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
        return db.transaction(async tx => {
          const [createdId] = await tx
            .insert(projects)
            .values({
              ownerUserId: ctx.user.id,
              code,
              name: input.name,
              location: input.location,
              status: "Planejamento",
              progress: 0,
              plannedStart,
              plannedFinish,
            })
            .$returningId();
          const seedDb = tx as unknown as NonNullable<Awaited<ReturnType<typeof getDb>>>;
          if (input.name.toLowerCase().includes("solar das acácias")) {
            await seedSolarAcaciasPlan(seedDb, createdId.id);
          } else {
            await seedStarterPlan(seedDb, createdId.id);
          }
          const [created] = await tx
            .select()
            .from(projects)
            .where(eq(projects.id, createdId.id))
            .limit(1);
          return created;
        });
      }),
    initializePlan: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [project] = await db
          .select()
          .from(projects)
          .where(accessibleProjectCondition(input.projectId, ctx.user.id))
          .limit(1);
        if (!project)
          throw new Error("Obra não encontrada ou sem permissão de acesso.");
        const existing = await db
          .select({ id: wbsNodes.id })
          .from(wbsNodes)
          .where(eq(wbsNodes.projectId, input.projectId))
          .limit(1);
        if (existing.length) {
          const fronts = await db
            .select({ id: productionFronts.id })
            .from(productionFronts)
            .where(eq(productionFronts.projectId, input.projectId))
            .limit(1);
          if (!fronts.length) await seedProductionCatalog(db, input.projectId);
          return { initialized: false as const };
        }
        await seedStarterPlan(db, input.projectId);
        return { initialized: true as const };
      }),
  }),
  production: router({
    createFront: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          code: z.string().trim().min(1).max(32),
          name: z.string().trim().min(2).max(180),
          location: z.string().trim().max(180).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [created] = await db
          .insert(productionFronts)
          .values({
            projectId: input.projectId,
            code: input.code,
            name: input.name,
            location: input.location || null,
            status: "ativa",
          })
          .$returningId();
        return created;
      }),
    createTeam: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          name: z.string().trim().min(2).max(180),
          trade: z.string().trim().min(2).max(120),
          memberCount: z.number().int().min(0).max(999).default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [created] = await db
          .insert(productionTeams)
          .values({ ...input, active: 1 })
          .$returningId();
        return created;
      }),
    createUnit: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          code: z.string().trim().min(1).max(32),
          name: z.string().trim().min(2).max(180),
          unitType: z.string().trim().min(2).max(80),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [created] = await db
          .insert(productionUnits)
          .values({ ...input, sortOrder: 0 })
          .$returningId();
        return created;
      }),
    fronts: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        return db
          .select()
          .from(productionFronts)
          .where(eq(productionFronts.projectId, input.projectId))
          .orderBy(productionFronts.name);
      }),
    teams: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        return db
          .select()
          .from(productionTeams)
          .where(eq(productionTeams.projectId, input.projectId))
          .orderBy(productionTeams.name);
      }),
    units: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        return db
          .select()
          .from(productionUnits)
          .where(eq(productionUnits.projectId, input.projectId))
          .orderBy(productionUnits.sortOrder);
      }),
    entries: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        return db
          .select()
          .from(productionEntries)
          .where(eq(productionEntries.projectId, input.projectId))
          .orderBy(
            desc(productionEntries.productionDate),
            desc(productionEntries.id)
          );
      }),
    createEntry: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          frontId: z.number().int().positive(),
          teamId: z.number().int().positive(),
          unitId: z.number().int().positive(),
          activityId: z.number().int().positive(),
          productionDate: z.coerce.date(),
          quantity: z.number().positive().max(999999),
          measurementUnit: z.string().trim().min(1).max(32),
          notes: z.string().trim().max(2000).optional(),
          status: z.enum(["rascunho", "confirmada"]).default("rascunho"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [project] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(accessibleProjectCondition(input.projectId, ctx.user.id))
          .limit(1);
        if (!project)
          throw new Error("Obra não encontrada ou sem permissão de acesso.");
        const [front, team, unit, activity] = await Promise.all([
          db
            .select({ id: productionFronts.id })
            .from(productionFronts)
            .where(
              and(
                eq(productionFronts.id, input.frontId),
                eq(productionFronts.projectId, input.projectId)
              )
            )
            .limit(1),
          db
            .select({ id: productionTeams.id })
            .from(productionTeams)
            .where(
              and(
                eq(productionTeams.id, input.teamId),
                eq(productionTeams.projectId, input.projectId)
              )
            )
            .limit(1),
          db
            .select({ id: productionUnits.id })
            .from(productionUnits)
            .where(
              and(
                eq(productionUnits.id, input.unitId),
                eq(productionUnits.projectId, input.projectId)
              )
            )
            .limit(1),
          db
            .select({ id: scheduleActivities.id })
            .from(scheduleActivities)
            .where(
              and(
                eq(scheduleActivities.id, input.activityId),
                eq(scheduleActivities.projectId, input.projectId)
              )
            )
            .limit(1),
        ]);
        const planningNodes = await db
          .select({ id: wbsNodes.id })
          .from(wbsNodes)
          .where(eq(wbsNodes.projectId, input.projectId))
          .limit(1);
        if (!planningNodes.length) {
          throw new Error("Monte e valide a EAP antes de lançar produção.");
        }
        if (!front.length || !team.length || !unit.length || !activity.length) {
          throw new Error(
            "Frente, equipe, unidade e atividade devem pertencer à mesma obra."
          );
        }
        const [createdId] = await db
          .insert(productionEntries)
          .values({
            projectId: input.projectId,
            frontId: input.frontId,
            teamId: input.teamId,
            unitId: input.unitId,
            activityId: input.activityId,
            productionDate: input.productionDate,
            quantity: input.quantity.toFixed(3),
            measurementUnit: input.measurementUnit,
            notes: input.notes || null,
            status: input.status,
            createdBy: ctx.user.id,
          })
          .$returningId();
        return { id: createdId.id };
      }),
    confirmEntry: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), entryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [entry] = await db.select().from(productionEntries).where(and(eq(productionEntries.id, input.entryId), eq(productionEntries.projectId, input.projectId))).limit(1);
        if (!entry) throw new Error("Medição não encontrada nesta obra.");
        await db.update(productionEntries).set({ status: "confirmada" }).where(eq(productionEntries.id, input.entryId));
        const [activity] = await db.select({ id: scheduleActivities.id, plannedQuantity: scheduleActivities.plannedQuantity }).from(scheduleActivities).where(eq(scheduleActivities.id, entry.activityId)).limit(1);
        if (activity) {
          const confirmed = await db.select({ quantity: productionEntries.quantity }).from(productionEntries).where(and(eq(productionEntries.projectId, input.projectId), eq(productionEntries.activityId, entry.activityId), eq(productionEntries.status, "confirmada")));
          const plannedQuantity = Number(activity.plannedQuantity ?? 0);
          const progress = plannedQuantity ? Math.min(100, Math.round((confirmed.reduce((sum, item) => sum + Number(item.quantity), 0) / plannedQuantity) * 100)) : 0;
          await db.update(scheduleActivities).set({ progress, status: progress >= 100 ? "Concluído" : progress > 0 ? "Em andamento" : "Não iniciado" }).where(eq(scheduleActivities.id, entry.activityId));
        }
        return { confirmed: true as const };
      }),
  }),
  budgets: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { versions: [], activeVersionId: null, items: [], total: 0 };
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const versions = await db
          .select()
          .from(budgetVersions)
          .where(eq(budgetVersions.projectId, input.projectId))
          .orderBy(desc(budgetVersions.versionNumber));
        const active = versions[0];
        const items = active
          ? await db
              .select()
              .from(budgetItems)
              .where(eq(budgetItems.budgetVersionId, active.id))
              .orderBy(budgetItems.sortOrder)
          : [];
        const total = items.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
          0
        );
        return { versions, activeVersionId: active?.id ?? null, items, total };
      }),
    createVersion: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          name: z.string().trim().min(2).max(160),
          notes: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const existing = await db
          .select({ versionNumber: budgetVersions.versionNumber })
          .from(budgetVersions)
          .where(eq(budgetVersions.projectId, input.projectId))
          .orderBy(desc(budgetVersions.versionNumber))
          .limit(1);
        const [createdId] = await db
          .insert(budgetVersions)
          .values({
            projectId: input.projectId,
            name: input.name,
            versionNumber: (existing[0]?.versionNumber ?? 0) + 1,
            status: "rascunho",
            notes: input.notes || null,
            createdBy: ctx.user.id,
          })
          .$returningId();
        return { id: createdId.id };
      }),
    createItem: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          budgetVersionId: z.number().int().positive(),
          code: z.string().trim().min(1).max(48),
          description: z.string().trim().min(2).max(240),
          unit: z.string().trim().min(1).max(32),
          quantity: z.number().positive(),
          unitPrice: z.number().nonnegative(),
          compositionId: z.number().int().positive().optional(),
          productivity: z.number().positive().optional(),
          plannedDurationDays: z.number().int().positive().optional(),
          source: z.string().trim().max(80).optional(),
          referencePeriod: z.string().trim().max(20).optional(),
          wbsNodeId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [version] = await db
          .select({ id: budgetVersions.id, status: budgetVersions.status })
          .from(budgetVersions)
          .where(
            and(
              eq(budgetVersions.id, input.budgetVersionId),
              eq(budgetVersions.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!version) throw new Error("Versão de orçamento não encontrada.");
        if (version.status === "aprovado" || version.status === "arquivado")
          throw new Error("Esta versão não aceita novos itens.");
        let effectiveUnitPrice = input.unitPrice;
        let compositionNote: string | null = null;
        if (input.compositionId) {
          const [composition] = await db
            .select()
            .from(serviceCompositions)
            .where(eq(serviceCompositions.id, input.compositionId))
            .limit(1);
          if (!composition) throw new Error("Composição não encontrada.");
          const components = await db
            .select()
            .from(compositionComponents)
            .where(eq(compositionComponents.compositionId, input.compositionId));
          if (!components.length) throw new Error("A composição não possui componentes.");
          effectiveUnitPrice = components.reduce(
            (sum, component) =>
              sum + Number(component.coefficient) * Number(component.unitPriceSnapshot),
            0
          );
          compositionNote = `${composition.code} · ${composition.description}`;
        }
        const calculatedDuration = input.productivity
          ? Math.max(1, Math.ceil(input.quantity / input.productivity))
          : input.plannedDurationDays;
        const [createdId] = await db
          .insert(budgetItems)
          .values({
            budgetVersionId: input.budgetVersionId,
            wbsNodeId: input.wbsNodeId,
            code: input.code,
            description: input.description,
            unit: input.unit,
            quantity: input.quantity.toFixed(3),
            unitPrice: effectiveUnitPrice.toFixed(2),
            compositionId: input.compositionId,
            compositionUnitCost: input.compositionId
              ? effectiveUnitPrice.toFixed(2)
              : null,
            productivity: input.productivity?.toFixed(3),
            plannedDurationDays: calculatedDuration,
            source: input.source || null,
            referencePeriod: input.referencePeriod || null,
            compositionNote,
          })
          .$returningId();
        return { id: createdId.id };
      }),
  }),
  catalog: router({
    list: protectedProcedure
      .input(
        z.object({
          catalogId: z.number().int().positive().optional(),
          compositionId: z.number().int().positive().optional(),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { catalogs: [], priceItems: [], compositions: [], components: [], total: 0 };
        const catalogs = await db.select().from(priceCatalogs).orderBy(desc(priceCatalogs.createdAt));
        const selectedCatalogId = input.catalogId ?? catalogs[0]?.id;
        const items = selectedCatalogId
          ? await db.select().from(priceItems).where(eq(priceItems.catalogId, selectedCatalogId)).orderBy(priceItems.code)
          : [];
        const compositions = await db.select().from(serviceCompositions).orderBy(desc(serviceCompositions.updatedAt));
        const selectedCompositionId = input.compositionId ?? compositions[0]?.id;
        const components = selectedCompositionId
          ? await db.select().from(compositionComponents).where(eq(compositionComponents.compositionId, selectedCompositionId))
          : [];
        const total = components.reduce(
          (sum, component) => sum + Number(component.coefficient) * Number(component.unitPriceSnapshot),
          0
        );
        return { catalogs, priceItems: items, compositions, components, total };
      }),
    createCatalog: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          sourceType: z.enum(["propria", "SINAPI", "SEINFRA", "fornecedor"]),
          state: z.string().trim().length(2).optional(),
          referencePeriod: z.string().trim().min(2).max(20),
          notes: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [createdId] = await db.insert(priceCatalogs).values({
          name: input.name,
          sourceType: input.sourceType,
          state: input.state?.toUpperCase() || null,
          referencePeriod: input.referencePeriod,
          notes: input.notes || null,
          createdBy: ctx.user.id,
        }).$returningId();
        return { id: createdId.id };
      }),
    createPriceItem: protectedProcedure
      .input(
        z.object({
          catalogId: z.number().int().positive(),
          code: z.string().trim().min(1).max(64),
          description: z.string().trim().min(2).max(240),
          unit: z.string().trim().min(1).max(32),
          itemType: z.enum(["material", "mao_de_obra", "equipamento", "servico"]),
          unitPrice: z.number().nonnegative(),
          notes: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [catalog] = await db.select({ id: priceCatalogs.id }).from(priceCatalogs).where(eq(priceCatalogs.id, input.catalogId)).limit(1);
        if (!catalog) throw new Error("Catálogo não encontrado.");
        const [createdId] = await db.insert(priceItems).values({
          catalogId: input.catalogId,
          code: input.code,
          description: input.description,
          unit: input.unit,
          itemType: input.itemType,
          unitPrice: input.unitPrice.toFixed(2),
          notes: input.notes || null,
        }).$returningId();
        void ctx.user.id;
        return { id: createdId.id };
      }),
    createComposition: protectedProcedure
      .input(
        z.object({
          code: z.string().trim().min(1).max(64),
          description: z.string().trim().min(2).max(240),
          unit: z.string().trim().min(1).max(32),
          sourceCatalogId: z.number().int().positive().optional(),
          referencePeriod: z.string().trim().max(20).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [createdId] = await db.insert(serviceCompositions).values({
          code: input.code,
          description: input.description,
          unit: input.unit,
          sourceCatalogId: input.sourceCatalogId,
          referencePeriod: input.referencePeriod || null,
          createdBy: ctx.user.id,
        }).$returningId();
        return { id: createdId.id };
      }),
    addComponent: protectedProcedure
      .input(
        z.object({
          compositionId: z.number().int().positive(),
          priceItemId: z.number().int().positive(),
          componentType: z.enum(["material", "mao_de_obra", "equipamento"]),
          coefficient: z.number().positive(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [item] = await db.select({ unitPrice: priceItems.unitPrice }).from(priceItems).where(eq(priceItems.id, input.priceItemId)).limit(1);
        if (!item) throw new Error("Insumo não encontrado.");
        const [composition] = await db.select({ id: serviceCompositions.id }).from(serviceCompositions).where(eq(serviceCompositions.id, input.compositionId)).limit(1);
        if (!composition) throw new Error("Composição não encontrada.");
        const [createdId] = await db.insert(compositionComponents).values({
          compositionId: input.compositionId,
          priceItemId: input.priceItemId,
          componentType: input.componentType,
          coefficient: input.coefficient.toFixed(6),
          unitPriceSnapshot: Number(item.unitPrice).toFixed(2),
        }).$returningId();
        return { id: createdId.id };
      }),
  }),
  planning: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { activities: [], dependencies: [], resources: [], baselines: [] };
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId)).orderBy(scheduleActivities.sortOrder);
        const dependencies = await db.select().from(scheduleDependencies).where(eq(scheduleDependencies.projectId, input.projectId));
        const resources = await db.select().from(planningResources).where(eq(planningResources.projectId, input.projectId)).orderBy(planningResources.name);
        const baselines = await db.select().from(scheduleBaselines).where(eq(scheduleBaselines.projectId, input.projectId)).orderBy(desc(scheduleBaselines.createdAt));
        return { activities, dependencies, resources, baselines };
      }),
    control: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), asOf: z.coerce.date().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { asOf: new Date(), activities: [], totals: { plannedQuantity: 0, actualQuantity: 0, plannedProgress: 0, actualProgress: 0, variance: 0 } };
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [project] = await db.select({ plannedStart: projects.plannedStart }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId)).orderBy(scheduleActivities.sortOrder);
        const entries = await db.select({ activityId: productionEntries.activityId, quantity: productionEntries.quantity }).from(productionEntries).where(and(eq(productionEntries.projectId, input.projectId), eq(productionEntries.status, "confirmada")));
        const actualByActivity = new Map<number, number>();
        for (const entry of entries) actualByActivity.set(entry.activityId, (actualByActivity.get(entry.activityId) ?? 0) + Number(entry.quantity));
        const asOf = input.asOf ?? new Date();
        const start = project?.plannedStart?.getTime() ?? asOf.getTime();
        const elapsedDays = Math.max(0, Math.floor((asOf.getTime() - start) / 86400000));
        const rows = activities.map(activity => {
          const plannedQuantity = Number(activity.plannedQuantity ?? 0);
          const actualQuantity = actualByActivity.get(activity.id) ?? 0;
          const plannedStart = activity.earlyStart ?? activity.startOffset;
          const plannedProgress = plannedQuantity > 0 ? Math.max(0, Math.min(100, ((elapsedDays - plannedStart) / Math.max(1, activity.durationDays)) * 100)) : 0;
          const actualProgress = plannedQuantity > 0 ? Math.max(0, Math.min(100, (actualQuantity / plannedQuantity) * 100)) : 0;
          return { id: activity.id, wbsCode: activity.wbsCode, name: activity.name, phase: activity.phase, plannedQuantity, actualQuantity, plannedProgress: Math.round(plannedProgress * 10) / 10, actualProgress: Math.round(actualProgress * 10) / 10, variance: Math.round((actualProgress - plannedProgress) * 10) / 10, critical: activity.critical === 1, status: activity.status };
        });
        const plannedQuantity = rows.reduce((sum, row) => sum + row.plannedQuantity, 0);
        const actualQuantity = rows.reduce((sum, row) => sum + row.actualQuantity, 0);
        const plannedProgress = plannedQuantity ? rows.reduce((sum, row) => sum + row.plannedQuantity * row.plannedProgress, 0) / plannedQuantity : 0;
        const actualProgress = plannedQuantity ? rows.reduce((sum, row) => sum + row.plannedQuantity * row.actualProgress, 0) / plannedQuantity : 0;
        return { asOf, activities: rows, totals: { plannedQuantity, actualQuantity, plannedProgress: Math.round(plannedProgress * 10) / 10, actualProgress: Math.round(actualProgress * 10) / 10, variance: Math.round((actualProgress - plannedProgress) * 10) / 10 } };
      }),
    captureBaseline: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), name: z.string().trim().min(2).max(160) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId));
        if (!activities.length) throw new Error("Não há atividades para congelar como baseline.");
        const [created] = await db.insert(scheduleBaselines).values({ projectId: input.projectId, name: input.name, status: "ativa", createdBy: ctx.user.id }).$returningId();
        await db.insert(scheduleBaselineItems).values(activities.map(activity => ({ baselineId: created.id, activityId: activity.id, startOffset: activity.startOffset, durationDays: activity.durationDays, earlyStart: activity.earlyStart, earlyFinish: activity.earlyFinish })));
        return { id: created.id, activityCount: activities.length };
      }),
    calculateCpm: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId));
        const dependencies = await db.select().from(scheduleDependencies).where(eq(scheduleDependencies.projectId, input.projectId));
        const result = calculateDeterministicCpm(activities, dependencies);
        if (!result.valid || !result.schedule) return { valid: false as const, projectDuration: 0, criticalPath: [], issues: result.issues };
        const calculatedAt = new Date();
        for (const item of result.schedule.activities) {
          await db.update(scheduleActivities).set({ startOffset: item.earlyStart, critical: item.critical ? 1 : 0, earlyStart: item.earlyStart, earlyFinish: item.earlyFinish, lateStart: item.lateStart, lateFinish: item.lateFinish, totalFloat: item.totalFloat, cpmCalculatedAt: calculatedAt }).where(and(eq(scheduleActivities.id, Number(item.id)), eq(scheduleActivities.projectId, input.projectId)));
        }
        return { valid: true as const, projectDuration: result.schedule.projectDuration, criticalPath: result.schedule.criticalPath.map(Number), issues: [] as never[] };
      }),
    createResource: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), name: z.string().trim().min(2).max(180), resourceType: z.enum(["mao_de_obra", "equipamento", "material"]), unit: z.string().trim().min(1).max(32), capacityPerDay: z.number().positive().optional(), costPerDay: z.number().nonnegative().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [createdId] = await db.insert(planningResources).values({ projectId: input.projectId, name: input.name, resourceType: input.resourceType, unit: input.unit, capacityPerDay: input.capacityPerDay?.toFixed(3), costPerDay: input.costPerDay?.toFixed(2) }).$returningId();
        return { id: createdId.id };
      }),
    createActivity: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), wbsCode: z.string().trim().min(1).max(32), name: z.string().trim().min(2).max(220), phase: z.string().trim().min(2).max(80), startOffset: z.number().int().min(0), plannedQuantity: z.number().positive().optional(), productivity: z.number().positive().optional(), durationDays: z.number().int().positive().optional(), budgetItemId: z.number().int().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const durationDays = input.durationDays ?? (input.plannedQuantity && input.productivity ? Math.max(1, Math.ceil(input.plannedQuantity / input.productivity)) : 1);
        const [createdId] = await db.insert(scheduleActivities).values({ projectId: input.projectId, wbsCode: input.wbsCode, name: input.name, phase: input.phase, startOffset: input.startOffset, durationDays, plannedQuantity: input.plannedQuantity?.toFixed(3), productivity: input.productivity?.toFixed(3), budgetItemId: input.budgetItemId, sortOrder: Date.now() }).$returningId();
        return { id: createdId.id };
      }),
    createDependency: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), predecessorId: z.number().int().positive(), successorId: z.number().int().positive(), type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"), lag: z.number().int().default(0) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        if (input.predecessorId === input.successorId) throw new Error("Uma atividade não pode depender dela mesma.");
        const rows = await db.select({ id: scheduleActivities.id }).from(scheduleActivities).where(and(eq(scheduleActivities.projectId, input.projectId), inArray(scheduleActivities.id, [input.predecessorId, input.successorId])));
        if (rows.length !== 2) throw new Error("As duas atividades precisam pertencer à obra.");
        const [createdId] = await db.insert(scheduleDependencies).values({ projectId: input.projectId, predecessorId: input.predecessorId, successorId: input.successorId, type: input.type, lag: input.lag }).$returningId();
        return { id: createdId.id };
      }),
    allocateResource: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), activityId: z.number().int().positive(), resourceId: z.number().int().positive(), quantity: z.number().positive().default(1), productivity: z.number().positive().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [activity] = await db.select({ id: scheduleActivities.id }).from(scheduleActivities).where(and(eq(scheduleActivities.id, input.activityId), eq(scheduleActivities.projectId, input.projectId))).limit(1);
        const [resource] = await db.select({ id: planningResources.id }).from(planningResources).where(and(eq(planningResources.id, input.resourceId), eq(planningResources.projectId, input.projectId))).limit(1);
        if (!activity || !resource) throw new Error("Atividade ou recurso não pertence à obra.");
        const [createdId] = await db.insert(activityResourceAllocations).values({ activityId: input.activityId, resourceId: input.resourceId, quantity: input.quantity.toFixed(3), productivity: input.productivity?.toFixed(3) }).$returningId();
        return { id: createdId.id };
      }),
  }),
  agent: router({
    snapshot: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          return {
            stage: "DESCRITIVO" as const,
            blockerCount: 0,
            lastSummary: null,
            nextStage: "EAP_PROPOSTA" as const,
            canAdvance: false,
            gateMessage: "Banco local indisponível; a aprovação está bloqueada.",
            gateChecks: [
              {
                code: "database_available",
                label: "Banco de dados disponível para persistir a decisão",
                valid: false,
              },
            ],
            approvedDecisions: [],
            openFindings: [],
            approvedMemories: [],
          };
        }
        return loadAgentCoordinatorSnapshot(db, input.projectId, ctx.user.id);
      }),
    recordDecision: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          stage: z.enum(coordinatorStages),
          decision: z.enum([
            "approved",
            "partially_approved",
            "rejected",
            "reopen",
          ]),
          scope: z.record(z.string(), z.unknown()).default({}),
          reason: z.string().trim().max(2000).optional(),
          impact: z.record(z.string(), z.unknown()).optional(),
          nextStage: z.enum(coordinatorStages).optional(),
          summary: z.string().trim().max(3000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        let [state] = await db
          .select()
          .from(agentProjectStates)
          .where(eq(agentProjectStates.projectId, input.projectId))
          .limit(1);
        if (!state) {
          await db.insert(agentProjectStates).values({ projectId: input.projectId });
          [state] = await db
            .select()
            .from(agentProjectStates)
            .where(eq(agentProjectStates.projectId, input.projectId))
            .limit(1);
        }
        if (!state) throw new Error("Não foi possível inicializar o estado do coordenador.");
        if (input.stage !== state.stage) {
          throw new Error(
            `Estado desatualizado: a obra está em ${state.stage}, mas a decisão foi enviada para ${input.stage}. Atualize o painel e tente novamente.`
          );
        }

        const targetStage =
          input.nextStage ??
          (input.decision === "approved"
            ? nextCoordinatorStage(state.stage)
            : state.stage) ??
          state.stage;
        const transition = evaluateStageTransition({
          currentStage: state.stage,
          targetStage,
          decision: input.decision,
          evidence: await loadStageGateEvidence(
            db,
            input.projectId,
            ctx.user.id,
            state.blockerCount
          ),
        });
        if (!transition.allowed) {
          throw new Error(
            `Transição bloqueada: ${transition.errors.join(" ")}`
          );
        }
        await db.insert(agentDecisions).values({
          projectId: input.projectId,
          userId: ctx.user.id,
          stage: input.stage,
          decision: input.decision,
          scopeJson: JSON.stringify(input.scope),
          reason: input.reason ?? null,
          impactJson: input.impact ? JSON.stringify(input.impact) : null,
        });
        await db
          .update(agentProjectStates)
          .set({
            stage: transition.nextStage ?? state.stage,
            lastSummary: input.summary ?? state.lastSummary,
            version: state.version + 1,
          })
          .where(eq(agentProjectStates.projectId, input.projectId));
        return loadAgentCoordinatorSnapshot(db, input.projectId, ctx.user.id);
      }),
    recordFinding: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          stage: z.enum(coordinatorStages),
          classification: z.enum(["blocker", "alert", "recommendation"]),
          entityType: z.string().trim().min(1).max(50),
          entityRef: z.string().trim().max(180).optional(),
          source: z.record(z.string(), z.unknown()).default({}),
          originalValue: z.unknown().optional(),
          proposedValue: z.unknown().optional(),
          description: z.string().trim().min(5).max(3000),
          impact: z.string().trim().max(2000).optional(),
          confidence: z.enum(["high", "medium", "low"]).default("medium"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [created] = await db
          .insert(agentFindings)
          .values({
            projectId: input.projectId,
            stage: input.stage,
            classification: input.classification,
            entityType: input.entityType,
            entityRef: input.entityRef ?? null,
            sourceJson: JSON.stringify(input.source),
            originalValueJson:
              input.originalValue === undefined
                ? null
                : JSON.stringify(input.originalValue),
            proposedValueJson:
              input.proposedValue === undefined
                ? null
                : JSON.stringify(input.proposedValue),
            description: input.description,
            impact: input.impact ?? null,
            confidence: input.confidence,
          })
          .$returningId();
        const [state] = await db
          .select()
          .from(agentProjectStates)
          .where(eq(agentProjectStates.projectId, input.projectId))
          .limit(1);
        if (state) {
          await db
            .update(agentProjectStates)
            .set({
              blockerCount:
                state.blockerCount +
                (input.classification === "blocker" ? 1 : 0),
            })
            .where(eq(agentProjectStates.projectId, input.projectId));
        }
        return { id: created.id };
      }),
    proposeMemory: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive().optional(),
          scope: z.enum(["project", "client", "library"]),
          category: z.string().trim().min(1).max(80),
          key: z.string().trim().min(1).max(180),
          value: z.unknown(),
          sourceType: z.string().trim().min(1).max(80),
          sourceRef: z.string().trim().max(180).optional(),
          confidence: z.enum(["high", "medium", "low"]).default("medium"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        if (input.scope === "project") {
          if (!input.projectId)
            throw new Error("Memória de obra exige projectId.");
          await assertAccessibleProject(db, input.projectId, ctx.user.id);
        }
        const [created] = await db
          .insert(agentMemories)
          .values({
            projectId: input.scope === "project" ? input.projectId : null,
            ownerUserId: ctx.user.id,
            scope: input.scope,
            category: input.category,
            memoryKey: input.key,
            valueJson: JSON.stringify(input.value),
            sourceType: input.sourceType,
            sourceRef: input.sourceRef ?? null,
            confidence: input.confidence,
          })
          .$returningId();
        return { id: created.id, status: "proposed" as const };
      }),
    approveMemory: protectedProcedure
      .input(z.object({ memoryId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const [memory] = await db
          .select()
          .from(agentMemories)
          .where(
            and(
              eq(agentMemories.id, input.memoryId),
              eq(agentMemories.ownerUserId, ctx.user.id)
            )
          )
          .limit(1);
        if (!memory)
          throw new Error("Memória não encontrada ou sem permissão.");
        if (memory.projectId)
          await assertAccessibleProject(db, memory.projectId, ctx.user.id);
        await db
          .update(agentMemories)
          .set({
            status: "approved",
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(agentMemories.id, input.memoryId));
        return { approved: true as const };
      }),
    chat: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          messages: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().trim().min(1).max(6000),
              })
            )
            .min(1)
            .max(20),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        let project;
        let activities;
        if (db) {
          const [row] = await db
            .select()
            .from(projects)
            .where(accessibleProjectCondition(input.projectId, ctx.user.id))
            .limit(1);
          if (!row)
            throw new Error("Obra não encontrada ou sem permissão de acesso.");
          project = row;
          activities = await db
            .select()
            .from(scheduleActivities)
            .where(eq(scheduleActivities.projectId, input.projectId))
            .orderBy(scheduleActivities.sortOrder);
        } else {
          if (!ENV.allowDemoData)
            throw new Error("Banco de dados não configurado.");
          project = demoProjects.find(item => item.id === input.projectId);
          activities = input.projectId === 1 ? demoActivities : [];
          if (!project) throw new Error("Obra não encontrada.");
        }
        const mcpProjectIds: Partial<
          Record<"eap" | "cronograma" | "ganttLob", string>
        > = {};
        if (db) {
          const mappings = await db
            .select({
              provider: projectMcpIntegrations.provider,
              externalProjectId: projectMcpIntegrations.externalProjectId,
            })
            .from(projectMcpIntegrations)
            .where(eq(projectMcpIntegrations.projectId, input.projectId));
          for (const mapping of mappings) {
            if (
              mapping.externalProjectId &&
              mapping.externalProjectId.toLowerCase() !== "default"
            ) {
              mcpProjectIds[mapping.provider] = mapping.externalProjectId;
            }
          }
        }
        const coordinator = db
          ? await loadAgentCoordinatorSnapshot(db, input.projectId, ctx.user.id)
          : undefined;
        if (db) {
          await db
            .update(agentProjectStates)
            .set({ activeSection: "portfolio", activeSubtab: null })
            .where(eq(agentProjectStates.projectId, input.projectId));
        }
        const evidence = db
          ? await (async () => {
              const evidenceSource = new EvidenceSourceRouter(
                localDatabaseEvidenceSource,
                new ConstructionMcpEvidenceSource(mcpProjectIds)
              );
              const [eapResult, activityResult, dependencyResult] =
                await Promise.all([
                  evidenceSource.getEapTree(input.projectId),
                  evidenceSource.listActivities(input.projectId),
                  evidenceSource.listDependencies(input.projectId),
                ]);
              const results = [eapResult, activityResult, dependencyResult];
              const eapValidation = validateEap(eapResult.data ?? []);
              const cpmResult = calculateDeterministicCpm(
                activityResult.data ?? [],
                dependencyResult.data ?? []
              );
              const evidenceErrors = results.flatMap(result =>
                result.errors.map(error => error.message)
              );
              const validationIssues = [
                ...eapValidation.issues.map(issue => issue.message),
                ...cpmResult.issues.map(issue => issue.message),
              ];
              const blockerCount =
                evidenceErrors.length +
                eapValidation.issues.filter(issue => issue.severity === "error")
                  .length +
                cpmResult.issues.filter(issue => issue.severity === "error")
                  .length;
              const hasEnoughData =
                Boolean(eapResult.data?.length) &&
                Boolean(activityResult.data?.length);
              const validationStatus: "valid" | "blocked" | "insufficient" =
                blockerCount
                  ? "blocked"
                  : hasEnoughData
                    ? "valid"
                    : "insufficient";
              return {
                source: Array.from(
                  new Set(results.map(result => result.source))
                ).join("+"),
                eapNodeCount: eapResult.data?.length ?? null,
                activityCount: activityResult.data?.length ?? null,
                dependencyCount: dependencyResult.data?.length ?? null,
                warnings: results.flatMap(result =>
                  result.warnings.map(warning => warning.message)
                ),
                errors: evidenceErrors,
                validation: {
                  status: validationStatus,
                  blockerCount,
                  issues: validationIssues,
                  projectDuration: cpmResult.schedule?.projectDuration ?? null,
                  criticalPath: cpmResult.schedule?.criticalPath ?? [],
                },
              };
            })()
          : undefined;
        return startAgentExecution({
          db,
          projectId: input.projectId,
          userId: ctx.user.id,
          context: buildAgentProjectContext(
            project,
            activities,
            { activeSection: "portfolio", contextMode: "focused" },
            coordinator,
            evidence
          ),
          messages: input.messages,
          mcpProjectIds,
          requestId: requestIdFrom(ctx),
        });
      }),
    status: protectedProcedure
      .input(z.object({ requestId: z.string().trim().min(1).max(128) }))
      .query(async ({ ctx, input }) => {
        const status = await getAgentExecutionStatus(
          await getDb(),
          input.requestId,
          ctx.user.id
        );
        if (!status) throw new Error("Execução do agente não encontrada.");
        return status;
      }),
    orchestrate: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          mcpProjectId: z.string().trim().min(1).max(120).optional(),
          mcpProjectIds: z
            .object({
              eap: z.string().trim().min(1).max(120).optional(),
              cronograma: z.string().trim().min(1).max(120).optional(),
              ganttLob: z.string().trim().min(1).max(120).optional(),
            })
            .partial()
            .optional(),
          context: z
            .object({
              activeSection: z.enum([
                "portfolio",
                "eap",
                "cronograma",
                "producao",
                "medicao",
                "gantt",
                "lob",
                "restricoes",
                "relatorios",
              ]),
              activeSubtab: z.enum(["gantt", "table", "lob"]).optional(),
              selectedActivityId: z.number().int().positive().optional(),
              contextMode: z.enum(["focused", "full"]).default("focused"),
            })
            .default({ activeSection: "portfolio", contextMode: "focused" }),
          messages: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().trim().min(1).max(6000),
              })
            )
            .min(1)
            .max(20),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        let project;
        let activities;
        if (db) {
          const [row] = await db
            .select()
            .from(projects)
            .where(accessibleProjectCondition(input.projectId, ctx.user.id))
            .limit(1);
          if (!row)
            throw new Error("Obra não encontrada ou sem permissão de acesso.");
          project = row;
          activities = await db
            .select()
            .from(scheduleActivities)
            .where(eq(scheduleActivities.projectId, input.projectId))
            .orderBy(scheduleActivities.sortOrder);
        } else {
          if (!ENV.allowDemoData)
            throw new Error("Banco de dados não configurado.");
          project = demoProjects.find(item => item.id === input.projectId);
          activities = input.projectId === 1 ? demoActivities : [];
          if (!project) throw new Error("Obra não encontrada.");
        }
        const coordinator = db
          ? await loadAgentCoordinatorSnapshot(db, input.projectId, ctx.user.id)
          : undefined;
        if (db) {
          await db
            .update(agentProjectStates)
            .set({
              activeSection: input.context.activeSection,
              activeSubtab: input.context.activeSubtab ?? null,
            })
            .where(eq(agentProjectStates.projectId, input.projectId));
        }
        return startAgentExecution({
          db,
          projectId: input.projectId,
          userId: ctx.user.id,
          context: buildAgentProjectContext(
            project,
            activities,
            input.context,
            coordinator
          ),
          messages: input.messages,
          mcpProjectIds: {
            ...(input.mcpProjectId
              ? {
                  eap: input.mcpProjectId,
                  cronograma: input.mcpProjectId,
                  ganttLob: input.mcpProjectId,
                }
              : {}),
            ...(input.mcpProjectIds ?? {}),
          },
          requestId: requestIdFrom(ctx),
        });
      }),
  }),
  integrations: router({
    projectMappings: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db)
          return mcpProviders.map(provider => ({
            provider,
            externalProjectId: null,
            endpointUrl: mcpEndpoint(provider),
            syncState: "unconfigured" as const,
            lastSyncedAt: null,
            lastError: null,
          }));
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const rows = await db
          .select()
          .from(projectMcpIntegrations)
          .where(eq(projectMcpIntegrations.projectId, input.projectId));
        return mcpProviders.map(provider => {
          const row = rows.find(item => item.provider === provider);
          return row
            ? { ...row, endpointUrl: mcpEndpoint(provider) }
            : {
                provider,
                externalProjectId: null,
                endpointUrl: mcpEndpoint(provider),
                syncState: "unconfigured" as const,
                lastSyncedAt: null,
                lastError: null,
              };
        });
      }),
    saveProjectMapping: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          provider: mcpProviderSchema,
          externalProjectId: z
            .string()
            .trim()
            .min(1)
            .max(180)
            .refine(value => value.toLowerCase() !== "default", {
              message: "O project_id default não pode ser usado em obra real.",
            }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        await db
          .insert(projectMcpIntegrations)
          .values({
            projectId: input.projectId,
            provider: input.provider,
            externalProjectId: input.externalProjectId,
            endpointUrl: mcpEndpoint(input.provider),
            syncState: "pending",
            lastError: null,
          })
          .onDuplicateKeyUpdate({
            set: {
              externalProjectId: input.externalProjectId,
              endpointUrl: mcpEndpoint(input.provider),
              syncState: "pending",
              lastError: null,
            },
          });
        return {
          saved: true as const,
          provider: input.provider,
          externalProjectId: input.externalProjectId,
        };
      }),
    homologateProject: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const mappings = await db
          .select()
          .from(projectMcpIntegrations)
          .where(eq(projectMcpIntegrations.projectId, input.projectId));
        const externalProjectIds = Object.fromEntries(
          mcpProviders.map(provider => {
            const value = mappings.find(
              item => item.provider === provider
            )?.externalProjectId;
            if (!value || value.toLowerCase() === "default") {
              throw new Error(
                `Cadastre o project_id externo do MCP ${provider} antes da homologação.`
              );
            }
            return [provider, value] as const;
          })
        ) as Record<McpProvider, string>;
        const result = await runConstructionMcpHomologation(
          externalProjectIds,
          requestIdFrom(ctx)
        );
        await Promise.all(
          mcpProviders.map(provider => {
            const server = result.servers[provider];
            return db
              .update(projectMcpIntegrations)
              .set({
                syncState: server.status === "passed" ? "ready" : "error",
                lastError: server.error,
                lastSyncedAt:
                  server.status === "passed" ? new Date() : undefined,
              })
              .where(
                and(
                  eq(projectMcpIntegrations.projectId, input.projectId),
                  eq(projectMcpIntegrations.provider, provider)
                )
              );
          })
        );
        return result;
      }),
    phase7PreviewImport: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const plan = await buildPhase7PlanForProject(db, input.projectId);
        return {
          projectId: input.projectId,
          projectExternalId: plan.projectExternalId,
          counts: {
            wbsNodes: plan.wbsNodes.length,
            activities: plan.activities.length,
            dependencies: plan.dependencies.length,
          },
          criticalPath: plan.criticalPath,
          totalDurationDays: plan.totalDurationDays,
          plan,
        };
      }),
    phase7ImportLocal: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          confirmationPhrase: z.literal("CONFIRMAR"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const plan = await buildPhase7PlanForProject(db, input.projectId);
        const imported = await persistPhase7Plan(db, input.projectId, plan);
        return {
          imported: true as const,
          projectId: input.projectId,
          projectExternalId: plan.projectExternalId,
          ...imported,
        };
      }),
    mutationPreview: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          provider: mcpProviderSchema,
          toolName: z.string().min(1).max(100),
          args: z.record(z.string(), z.unknown()).default({}),
          idempotencyKey: z.string().trim().min(8).max(128).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        if (!CONTROLLED_MUTATION_POLICY[input.provider].has(input.toolName)) {
          throw new Error(
            `A ferramenta ${input.toolName} ainda não está liberada para mutação controlada.`
          );
        }
        const argsJson = JSON.stringify(input.args);
        if (argsJson.length > 16_000) {
          throw new Error(
            "Os argumentos da mutação excedem o limite permitido."
          );
        }
        const mapping = await db
          .select()
          .from(projectMcpIntegrations)
          .where(
            and(
              eq(projectMcpIntegrations.projectId, input.projectId),
              eq(projectMcpIntegrations.provider, input.provider)
            )
          )
          .limit(1);
        const externalProjectId = mapping[0]?.externalProjectId;
        if (
          !externalProjectId ||
          externalProjectId.toLowerCase() === "default"
        ) {
          throw new Error(
            "Cadastre um project_id externo válido antes da prévia."
          );
        }
        const idempotencyKey = input.idempotencyKey ?? randomUUID();
        const existing = await db
          .select()
          .from(mcpMutationOperations)
          .where(eq(mcpMutationOperations.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing[0]) {
          if (existing[0].userId !== ctx.user.id) {
            throw new Error(
              "A chave de idempotência já pertence a outro usuário."
            );
          }
          return existing[0];
        }
        const confirmationToken = randomUUID();
        await db.insert(mcpMutationOperations).values({
          projectId: input.projectId,
          userId: ctx.user.id,
          provider: input.provider,
          toolName: input.toolName,
          externalProjectId,
          idempotencyKey,
          confirmationToken,
          argsJson,
          status: "preview",
        });
        const created = await db
          .select()
          .from(mcpMutationOperations)
          .where(eq(mcpMutationOperations.idempotencyKey, idempotencyKey))
          .limit(1);
        if (!created[0])
          throw new Error("Não foi possível registrar a prévia.");
        return created[0];
      }),
    confirmMutation: protectedProcedure
      .input(
        z.object({
          operationId: z.number().int().positive(),
          confirmationToken: z.string().min(20).max(64),
          confirmationPhrase: z.literal("CONFIRMAR"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const operations = await db
          .select()
          .from(mcpMutationOperations)
          .where(
            and(
              eq(mcpMutationOperations.id, input.operationId),
              eq(mcpMutationOperations.userId, ctx.user.id)
            )
          )
          .limit(1);
        const operation = operations[0];
        if (!operation) throw new Error("Prévia não encontrada.");
        await assertAccessibleProject(db, operation.projectId, ctx.user.id);
        if (operation.status === "succeeded") {
          return {
            operation,
            replayed: true as const,
            result: operation.resultJson
              ? JSON.parse(operation.resultJson)
              : null,
          };
        }
        if (
          operation.status !== "preview" ||
          operation.confirmationToken !== input.confirmationToken
        ) {
          throw new Error("A prévia não está aguardando confirmação válida.");
        }
        const claimed = await db
          .update(mcpMutationOperations)
          .set({ status: "executing", confirmedAt: new Date() })
          .where(
            and(
              eq(mcpMutationOperations.id, operation.id),
              eq(mcpMutationOperations.status, "preview")
            )
          );
        if (!("affectedRows" in claimed) || claimed.affectedRows !== 1) {
          throw new Error("A operação já foi confirmada ou está em execução.");
        }
        try {
          const result = await callControlledMcpTool(
            operation.provider,
            operation.toolName,
            JSON.parse(operation.argsJson)
          );
          const resultJson = JSON.stringify(result);
          await db
            .update(mcpMutationOperations)
            .set({
              status: "succeeded",
              resultJson,
              executedAt: new Date(),
              error: null,
            })
            .where(eq(mcpMutationOperations.id, operation.id));
          return {
            operationId: operation.id,
            replayed: false as const,
            result,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Falha na mutação MCP.";
          await db
            .update(mcpMutationOperations)
            .set({ status: "failed", error: message, executedAt: new Date() })
            .where(eq(mcpMutationOperations.id, operation.id));
          throw new Error(message);
        }
      }),
    runIntegratedHomologation: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          mutationOperationId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        let mutationEvidence: {
          operationId: number | null;
          status: string;
          toolName: string | null;
        } = { operationId: null, status: "não informado", toolName: null };
        if (input.mutationOperationId) {
          const operation = await db
            .select()
            .from(mcpMutationOperations)
            .where(
              and(
                eq(mcpMutationOperations.id, input.mutationOperationId),
                eq(mcpMutationOperations.projectId, input.projectId),
                eq(mcpMutationOperations.userId, ctx.user.id)
              )
            )
            .limit(1);
          if (!operation[0])
            throw new Error("Mutação de evidência não encontrada.");
          if (operation[0].status !== "succeeded") {
            throw new Error("A mutação de evidência precisa estar concluída.");
          }
          mutationEvidence = {
            operationId: operation[0].id,
            status: operation[0].status,
            toolName: operation[0].toolName,
          };
        }
        const mappings = await db
          .select()
          .from(projectMcpIntegrations)
          .where(eq(projectMcpIntegrations.projectId, input.projectId));
        const externalProjectIds = Object.fromEntries(
          mcpProviders.map(provider => {
            const value = mappings.find(
              item => item.provider === provider
            )?.externalProjectId;
            if (!value || value.toLowerCase() === "default") {
              throw new Error(
                `Cadastre o project_id externo do MCP ${provider} antes do E2E.`
              );
            }
            return [provider, value] as const;
          })
        ) as Record<McpProvider, string>;
        const requestId = requestIdFrom(ctx);
        const plan = {
          readOnlyProbe: true,
          mutationEvidence: mutationEvidence.operationId,
          reconciliation: true,
          externalProjectIds,
        };
        await db.insert(mcpHomologationRuns).values({
          projectId: input.projectId,
          userId: ctx.user.id,
          requestId,
          status: "read_only_running",
          planJson: JSON.stringify(plan),
          startedAt: new Date(),
        });
        const result = await runConstructionMcpHomologation(
          externalProjectIds,
          requestId
        );
        const allPassed = Object.values(result.servers).every(
          server => server.status === "passed"
        );
        const finalStatus = mutationEvidence.operationId
          ? allPassed
            ? "reconciled"
            : "read_only_degraded"
          : allPassed
            ? "read_only_passed"
            : "read_only_degraded";
        const reconciliation = {
          projectId: input.projectId,
          mutation: mutationEvidence,
          checks: [
            "vínculos externos presentes",
            "probes somente leitura executados",
            "mutação de evidência concluída antes da reconciliação",
          ],
        };
        const runRows = await db
          .select({ id: mcpHomologationRuns.id })
          .from(mcpHomologationRuns)
          .where(eq(mcpHomologationRuns.requestId, requestId))
          .limit(1);
        if (!runRows[0]) throw new Error("Execução E2E não foi registrada.");
        await db
          .update(mcpHomologationRuns)
          .set({
            status: finalStatus,
            readOnlyResultJson: JSON.stringify(result),
            reconciliationJson: JSON.stringify(reconciliation),
            finishedAt: new Date(),
          })
          .where(eq(mcpHomologationRuns.id, runRows[0].id));
        return {
          runId: runRows[0].id,
          status: finalStatus,
          requestId,
          mutationEvidence,
          result,
          reconciliation,
        };
      }),
    mcpStatus: protectedProcedure.query(({ ctx }) => {
      return getConstructionMcpStatus(requestIdFrom(ctx));
    }),
    mcpReadOnlyCall: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          domain: z.enum(["eap", "cronograma", "ganttLob"]),
          toolName: z.string().min(1).max(100),
          args: z.record(z.string(), z.unknown()).default({}),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [mapping] = await db
          .select({
            externalProjectId: projectMcpIntegrations.externalProjectId,
          })
          .from(projectMcpIntegrations)
          .where(
            and(
              eq(projectMcpIntegrations.projectId, input.projectId),
              eq(projectMcpIntegrations.provider, input.domain)
            )
          )
          .limit(1);
        const externalProjectId = mapping?.externalProjectId;
        if (
          PROJECT_SCOPED_READ_ONLY_TOOLS.has(input.toolName) &&
          (!externalProjectId || externalProjectId.toLowerCase() === "default")
        ) {
          throw new Error(
            `Nenhum project_id autorizado para o MCP ${input.domain}.`
          );
        }
        const args = { ...input.args };
        if (PROJECT_SCOPED_READ_ONLY_TOOLS.has(input.toolName)) {
          args.project_id = externalProjectId;
        }
        return callReadOnlyMcpTool(input.domain, input.toolName, args);
      }),
  }),
});

export type AppRouter = typeof appRouter;
