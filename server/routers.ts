import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
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
  projectAuditEvents,
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
import { seinfraAdapter } from "@shared/price-sources/seinfra";
import {
  exceedsPriceThreshold,
  findCandidates,
  priceVariation,
  type ComparableRecord,
} from "@shared/price-sources/matching";
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
  allowedSourcesFor,
  canTransitionFinding,
} from "./construction/finding-lifecycle";
import { deriveProjectProgress } from "./construction/project-progress";
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

/** TTL cache para queries pesadas (catálogo SEINFRA ~11k itens, reconcile ~29s). */
const queryCache = new Map<string, { at: number; value: unknown }>();
const QUERY_CACHE_TTL_MS = 30_000;

function cacheGet<T>(key: string): T | undefined {
  const hit = queryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > QUERY_CACHE_TTL_MS) {
    queryCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown): void {
  queryCache.set(key, { at: Date.now(), value });
}

function cacheClearPrefix(prefix: string): void {
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}

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

async function recomputeProjectProgress(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
): Promise<number> {
  const rows = await db
    .select({
      progress: scheduleActivities.progress,
      durationDays: scheduleActivities.durationDays,
    })
    .from(scheduleActivities)
    .where(eq(scheduleActivities.projectId, projectId));
  const progress = deriveProjectProgress(
    rows.map(row => ({
      progress: Number(row.progress ?? 0),
      durationDays: Number(row.durationDays ?? 0),
    }))
  );
  await db
    .update(projects)
    .set({ progress })
    .where(eq(projects.id, projectId));
  return progress;
}

async function seedStarterPlan(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
) {
  const insertedWbs = await db.insert(wbsNodes).values(
    starterWbs.map(([code, name, level, nodeType], index) => ({
      projectId,
      code,
      name,
      level,
      nodeType,
      parentId: null,
      sortOrder: index,
    }))
  ).$returningId();
  const wbsIdsByCode = new Map<string, number>();
  starterWbs.forEach(([code], index) => {
    const id = insertedWbs[index]?.id;
    if (!id) throw new Error(`EAP inicial inválida: ID ausente para ${code}.`);
    wbsIdsByCode.set(code, id);
  });
  for (const [code] of starterWbs) {
    const parentCode = code.includes(".") ? code.split(".").slice(0, -1).join(".") : null;
    if (!parentCode) continue;
    const nodeId = wbsIdsByCode.get(code);
    const parentId = wbsIdsByCode.get(parentCode);
    if (!nodeId || !parentId) throw new Error(`EAP inicial inválida: pai ausente para ${code}.`);
    await db.update(wbsNodes).set({ parentId }).where(and(eq(wbsNodes.id, nodeId), eq(wbsNodes.projectId, projectId)));
  }
  const inserted = await db
    .insert(scheduleActivities)
    .values(
      starterActivities.map(
        ([wbsCode, name, phase, startOffset, durationDays], index) => ({
          projectId,
          wbsNodeId: (() => {
            const nodeId = wbsIdsByCode.get(wbsCode);
            if (!nodeId) throw new Error(`Atividade inicial sem nó EAP para ${wbsCode}.`);
            return nodeId;
          })(),
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
  await seedInitialBudget(db, projectId, wbsIdsByCode);
}

async function seedSolarAcaciasPlan(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
) {
  type NodeType = "grupo" | "pacote" | "entrega";
  let order = 0;
  const nodeIdsByCode = new Map<string, number>();
  const requireNodeId = (code: string) => {
    const id = nodeIdsByCode.get(code);
    if (!id) throw new Error(`EAP Solar inválida: nó ausente para ${code}.`);
    return id;
  };
  const addNode = async (parentId: number | null, code: string, name: string, level: number, nodeType: NodeType, unit?: string, plannedQuantity?: number) => {
    const [created] = await db.insert(wbsNodes).values({ projectId, parentId, code, name, level, nodeType, unit: unit ?? null, plannedQuantity: plannedQuantity ?? null, sortOrder: order++ }).$returningId();
    nodeIdsByCode.set(code, created.id);
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
  await addLocationPackages(foundation, "1.2.2", "Fundação profunda", [["1", "Estacas hélice contínua Ã˜40 cm", "m", 768], ["2", "Blocos de coroamento", "un", 48], ["3", "Vigas baldrame e arranques", "m", 220]]);
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
  const activityRows = structuralLocations.map((location, index) => ({ projectId, wbsNodeId: requireNodeId(`1.3.${index + 1}.4`), externalId: `SOL-EST-${index + 1}`, eapRef: `1.3.${index + 1}.4`, wbsCode: `1.3.${index + 1}.4`, name: `Ciclo estrutural — ${location}`, phase: "Estrutura", startOffset: 120 + index * 14, durationDays: 14, plannedQuantity: "1", productivity: "0.071", progress: 0, status: "Não iniciado" as const, critical: 0, sortOrder: index }));
  activityRows.push({ projectId, wbsNodeId: requireNodeId("1.2.1.1"), externalId: "SOL-FUND-01", eapRef: "1.2.1.1", wbsCode: "1.2.1.1", name: "Escavação e contenção do subsolo", phase: "Fundação", startOffset: 20, durationDays: 60, plannedQuantity: "2400", productivity: "40", progress: 0, status: "Não iniciado" as const, critical: 0, sortOrder: activityRows.length });
  const inserted = await db.insert(scheduleActivities).values(activityRows).$returningId();
  await db.insert(scheduleDependencies).values(inserted.slice(0, -1).map((item, index) => ({ projectId, predecessorId: item.id, successorId: inserted[index + 1].id, type: "FS" as const, lag: 0 })));
  await seedProductionCatalog(db, projectId);
  await seedInitialBudget(db, projectId, nodeIdsByCode);
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

async function seedInitialBudget(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  wbsIdsByCode: Map<string, number | undefined>
) {
  const existing = await db.select({ id: budgetVersions.id }).from(budgetVersions).where(eq(budgetVersions.projectId, projectId)).limit(1);
  if (existing.length) return;
  const [version] = await db.insert(budgetVersions).values({
    projectId,
    name: 'Orçamento inicial — preencher preços',
    versionNumber: 1,
    status: 'rascunho',
    currency: 'BRL',
    notes: 'Versão inicial criada para orientar o cadastro; preços ainda precisam ser confirmados.',
  }).$returningId();
  await db.insert(budgetItems).values([
    { budgetVersionId: version.id, wbsNodeId: wbsIdsByCode.get('1.1') ?? wbsIdsByCode.get('1'), code: '01.001', description: 'Mobilização e canteiro', unit: 'vb', quantity: '1.000', unitPrice: '0.00', plannedDurationDays: 14, source: 'A preencher', sortOrder: 0 },
    { budgetVersionId: version.id, wbsNodeId: wbsIdsByCode.get('2.1') ?? wbsIdsByCode.get('1.2'), code: '02.001', description: 'Fundação e contenções', unit: 'vb', quantity: '1.000', unitPrice: '0.00', plannedDurationDays: 28, source: 'A preencher', sortOrder: 1 },
    { budgetVersionId: version.id, wbsNodeId: wbsIdsByCode.get('3.1') ?? wbsIdsByCode.get('1.3'), code: '03.001', description: 'Estrutura dos pavimentos', unit: 'vb', quantity: '1.000', unitPrice: '0.00', plannedDurationDays: 178, source: 'A preencher', sortOrder: 2 },
  ]);
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

async function assertAvailableWbsCode(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  code: string,
  exceptNodeId?: number
) {
  const conditions = [eq(wbsNodes.projectId, projectId), eq(wbsNodes.code, code)];
  if (exceptNodeId) conditions.push(ne(wbsNodes.id, exceptNodeId));
  const [conflict] = await db
    .select({ id: wbsNodes.id })
    .from(wbsNodes)
    .where(and(...conditions))
    .limit(1);
  if (conflict) {
    throw new Error(`O código WBS ${code} já está em uso nesta obra.`);
  }
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

  const gateEvidence = await loadStageGateEvidence(db, projectId, userId);
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
    blockerCount: gateEvidence.blockerCount,
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
      id: finding.id,
      status: finding.status,
      classification: finding.classification,
      entityType: finding.entityType,
      entityRef: finding.entityRef,
      description: finding.description,
      impact: finding.impact,
      confidence: finding.confidence,
      createdAt: finding.createdAt,
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

async function countOpenBlockers(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(agentFindings)
    .where(
      and(
        eq(agentFindings.projectId, projectId),
        eq(agentFindings.status, "open"),
        eq(agentFindings.classification, "blocker")
      )
    );
  return Number(row?.total ?? 0);
}

async function loadStageGateEvidence(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number,
  userId: number
) {
  await assertAccessibleProject(db, projectId, userId);
  const [project, eapNodes, activities, dependencies, blockerCount] =
    await Promise.all([
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
      countOpenBlockers(db, projectId),
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
      const existingByCode = existing[0]
        ? existing
        : await tx
            .select({ id: wbsNodes.id })
            .from(wbsNodes)
            .where(
              and(
                eq(wbsNodes.projectId, projectId),
                eq(wbsNodes.code, node.code)
              )
            )
            .limit(1);
      if (existingByCode[0]) {
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
          .where(eq(wbsNodes.id, existingByCode[0].id));
        localWbsByExternalId.set(node.externalId, existingByCode[0].id);
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
      const wbsNodeId = localWbsByExternalId.get(activity.eapRef);
      if (!wbsNodeId) {
        throw new Error(`Atividade ${activity.externalId} referencia EAP inexistente: ${activity.eapRef}.`);
      }
      const values = {
        projectId,
        wbsNodeId,
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

function dayKeyAt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
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
           earlyStart: z.number().int().min(0).optional(),
           durationDays: z.number().int().positive(),
          plannedQuantity: z.number().positive().optional(),
          productivity: z.number().positive().optional(),
          budgetItemId: z.number().int().positive().nullable().optional(),
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
            ...(input.earlyStart !== undefined && { earlyStart: input.earlyStart }),
            durationDays: input.durationDays,
            plannedQuantity: input.plannedQuantity === undefined ? null : String(input.plannedQuantity),
            productivity: input.productivity === undefined ? null : String(input.productivity),
            ...(input.budgetItemId !== undefined && { budgetItemId: input.budgetItemId }),
            progress: input.progress,
            status: input.status,
          })
          .where(eq(scheduleActivities.id, input.activityId));
        await recomputeProjectProgress(db, input.projectId);
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
          .orderBy(wbsNodes.sortOrder, wbsNodes.id);
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
        await assertAvailableWbsCode(
          db,
          input.projectId,
          input.code,
          input.nodeId
        );
        return db.transaction(async tx => {
          await tx
            .update(wbsNodes)
            .set({
              code: input.code,
              name: input.name,
              nodeType: input.nodeType,
              unit: input.unit || null,
              plannedQuantity: input.plannedQuantity ?? null,
            })
            .where(eq(wbsNodes.id, input.nodeId));
          await tx
            .update(scheduleActivities)
            .set({ wbsCode: input.code, eapRef: input.code })
            .where(
              and(
                eq(scheduleActivities.projectId, input.projectId),
                eq(scheduleActivities.wbsNodeId, input.nodeId)
              )
            );
          return { updated: true as const };
        });
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
        await assertAvailableWbsCode(db, input.projectId, code);
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
        return db.transaction(async tx => {
          const all = await tx
            .select()
            .from(wbsNodes)
            .where(eq(wbsNodes.projectId, input.projectId));
          const node = all.find(item => item.id === input.nodeId);
          const parent = input.targetParentId === null
            ? null
            : all.find(item => item.id === input.targetParentId) ?? null;
          if (!node) throw new Error("Item da EAP não encontrado nesta obra.");
          if (input.targetParentId !== null && !parent) throw new Error("Destino inválido.");

          const byId = new Map(all.map(item => [item.id, item]));
          let ancestor = parent;
          while (ancestor) {
            if (ancestor.id === node.id) {
              throw new Error("Não é possível mover um item para dentro de sua própria descendência.");
            }
            ancestor = ancestor.parentId === null ? null : byId.get(ancestor.parentId) ?? null;
          }

          const compareOrder = (left: typeof all[number], right: typeof all[number]) =>
            left.sortOrder - right.sortOrder || left.id - right.id;
          const children = new Map<number | null, typeof all>();
          for (const item of all) {
            const current = children.get(item.parentId) ?? [];
            current.push(item);
            children.set(item.parentId, current);
          }
          for (const siblings of Array.from(children.values())) siblings.sort(compareOrder);

          const oldSiblings = (children.get(node.parentId) ?? []).filter(item => item.id !== node.id);
          const targetSiblings = (children.get(parent?.id ?? null) ?? []).filter(item => item.id !== node.id);
          const targetIndex = Math.min(input.targetIndex, targetSiblings.length);
          const nextTargetSiblings = [...targetSiblings];
          nextTargetSiblings.splice(targetIndex, 0, node);
          children.set(node.parentId, oldSiblings);
          children.set(parent?.id ?? null, nextTargetSiblings);

          const desired = new Map<number, { parentId: number | null; code: string; level: number; sortOrder: number }>();
          const visit = (parentId: number | null, prefix: string, level: number) => {
            const siblings = children.get(parentId) ?? [];
            siblings.forEach((item, index) => {
              const code = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
              desired.set(item.id, { parentId, code, level, sortOrder: index });
              visit(item.id, code, level + 1);
            });
          };
          visit(null, "", 1);

          const updates = Array.from(desired.entries());
          if (updates.length) {
            const ids = updates.map(([id]) => id);
            await tx.execute(sql`
              UPDATE wbs_nodes
              SET code = CONCAT('__wbs_tmp__', id)
              WHERE projectId = ${input.projectId}
                AND id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
            `);
            const parentCase = sql.join(updates.map(([id, value]) => sql`WHEN ${id} THEN ${value.parentId}`), sql` `);
            const codeCase = sql.join(updates.map(([id, value]) => sql`WHEN ${id} THEN ${value.code}`), sql` `);
            const levelCase = sql.join(updates.map(([id, value]) => sql`WHEN ${id} THEN ${value.level}`), sql` `);
            const orderCase = sql.join(updates.map(([id, value]) => sql`WHEN ${id} THEN ${value.sortOrder}`), sql` `);
            await tx.execute(sql`
              UPDATE wbs_nodes
              SET parentId = CASE id ${parentCase} ELSE parentId END,
                  code = CASE id ${codeCase} ELSE code END,
                  level = CASE id ${levelCase} ELSE level END,
                  sortOrder = CASE id ${orderCase} ELSE sortOrder END
              WHERE projectId = ${input.projectId}
                AND id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
            `);
            await tx.execute(sql`
              UPDATE schedule_activities AS activity
              INNER JOIN wbs_nodes AS node ON node.id = activity.wbsNodeId
              SET activity.wbsCode = node.code, activity.eapRef = node.code
              WHERE activity.projectId = ${input.projectId}
                AND activity.wbsNodeId IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
            `);
          }
          const moved = desired.get(node.id);
          return {
            moved: true as const,
            nodeId: node.id,
            code: moved?.code ?? node.code,
            affectedNodeIds: updates.map(([id]) => id),
          };
        });
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
        const code = source.parentId
          ? `${source.code.split(".").slice(0, -1).join(".")}.${nextNumber}`
          : `${nextNumber}`;
        await assertAvailableWbsCode(db, input.projectId, code);
        const [created] = await db.insert(wbsNodes).values({ projectId: input.projectId, parentId: source.parentId, code, name: `${source.name} (cópia)`, level: source.level, nodeType: source.nodeType, unit: source.unit, plannedQuantity: source.plannedQuantity, sortOrder: siblings.length }).$returningId();
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
        const all = await db.select({ id: wbsNodes.id, code: wbsNodes.code }).from(wbsNodes).where(eq(wbsNodes.projectId, input.projectId));
        const ids = all.filter(item => item.id === node.id || item.code.startsWith(`${node.code}.`)).map(item => item.id);
        const linkedActivities = ids.length
          ? await db.select({ id: scheduleActivities.id }).from(scheduleActivities).where(and(eq(scheduleActivities.projectId, input.projectId), inArray(scheduleActivities.wbsNodeId, ids)))
          : [];
        if (linkedActivities.length) throw new Error("Não é possível excluir uma EAP vinculada a atividades. Realoque ou remova as atividades primeiro.");
        const linkedBudgetItems = ids.length
          ? await db.select({ id: budgetItems.id }).from(budgetItems).where(inArray(budgetItems.wbsNodeId, ids))
          : [];
        if (linkedBudgetItems.length) throw new Error("Não é possível excluir uma EAP vinculada ao orçamento. Realoque ou remova os itens primeiro.");
        if (ids.length) await db.delete(wbsNodes).where(inArray(wbsNodes.id, ids));
        return { deleted: true as const, count: ids.length };
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
    setBaseReferencia: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          baseReferencia: z.enum(["SEINFRA", "SINAPI", "PROPRIA"]),
          reference: z.string().trim().min(2).max(20),
          confirm: z.boolean().default(false),
          catalogId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, input.projectId))
          .limit(1);
        if (!project) throw new Error("Obra não encontrada.");
        const previousBase = project.baseReferencia;
        const changing =
          previousBase !== null &&
          (previousBase !== input.baseReferencia ||
            project.baseReferenciaRef !== input.reference);
        if (changing) {
          const [approved] = await db
            .select({ id: budgetVersions.id })
            .from(budgetVersions)
            .where(
              and(
                eq(budgetVersions.projectId, input.projectId),
                eq(budgetVersions.status, "aprovado")
              )
            )
            .limit(1);
          if (approved && !input.confirm) {
            throw new Error(
              "Esta obra já tem orçamento aprovado com a base atual. Confirme explicitamente a troca (confirm=true); preços congelados não serão alterados."
            );
          }
        }
        await db
          .update(projects)
          .set({
            baseReferencia: input.baseReferencia,
            baseReferenciaRef: input.reference,
          })
          .where(eq(projects.id, input.projectId));
        await db.insert(projectAuditEvents).values({
          projectId: input.projectId,
          userId: ctx.user.id,
          action: changing ? "base_changed" : "base_defined",
          payload: {
            from: previousBase,
            fromRef: project.baseReferenciaRef,
            to: input.baseReferencia,
            toRef: input.reference,
            catalogId: input.catalogId ?? null,
            confirmed: input.confirm,
            at: new Date().toISOString(),
          },
        });
        return {
          baseReferencia: input.baseReferencia,
          baseReferenciaRef: input.reference,
        };
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
        await recomputeProjectProgress(db, input.projectId);
        return { confirmed: true as const };
      }),
  }),
  budgets: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db)
          return {
            versions: [],
            activeVersionId: null,
            items: [],
            total: 0,
            unavailable: true,
          };
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
        return {
          versions,
          activeVersionId: active?.id ?? null,
          items,
          total,
          unavailable: false,
        };
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
    ensureVersion: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const existing = await db
          .select({
            id: budgetVersions.id,
            versionNumber: budgetVersions.versionNumber,
          })
          .from(budgetVersions)
          .where(eq(budgetVersions.projectId, input.projectId))
          .orderBy(desc(budgetVersions.versionNumber))
          .limit(1);
        if (existing[0]) {
          const items = await db
            .select({ id: budgetItems.id })
            .from(budgetItems)
            .where(eq(budgetItems.budgetVersionId, existing[0].id))
            .limit(1);
          if (items.length) return { id: existing[0].id, created: false };
        }
        const wbsRows = await db
          .select({ id: wbsNodes.id, code: wbsNodes.code })
          .from(wbsNodes)
          .where(eq(wbsNodes.projectId, input.projectId));
        const wbsIdByCode = new Map(wbsRows.map(row => [row.code, row.id]));
        const wbsFor = (...codes: string[]): number | null => {
          for (const code of codes) {
            const id = wbsIdByCode.get(code);
            if (id) return id;
          }
          return null;
        };
        const versionId = existing[0]?.id;
        if (versionId) {
          await db.insert(budgetItems).values([
            {
              budgetVersionId: versionId,
              wbsNodeId: wbsFor("1.1", "1"),
              code: "01.001",
              description: "Mobilização e canteiro",
              unit: "vb",
              quantity: "1.000",
              unitPrice: "0.00",
              plannedDurationDays: 14,
              source: "A preencher",
              sortOrder: 0,
            },
            {
              budgetVersionId: versionId,
              wbsNodeId: wbsFor("2.1", "1.2"),
              code: "02.001",
              description: "Fundação e contenções",
              unit: "vb",
              quantity: "1.000",
              unitPrice: "0.00",
              plannedDurationDays: 28,
              source: "A preencher",
              sortOrder: 1,
            },
            {
              budgetVersionId: versionId,
              wbsNodeId: wbsFor("3.1", "1.3"),
              code: "03.001",
              description: "Estrutura dos pavimentos",
              unit: "vb",
              quantity: "1.000",
              unitPrice: "0.00",
              plannedDurationDays: 178,
              source: "A preencher",
              sortOrder: 2,
            },
          ]);
          return { id: versionId, created: true };
        }
        const [createdId] = await db
          .insert(budgetVersions)
          .values({
            projectId: input.projectId,
            name: "Orçamento inicial — preencher preços",
            versionNumber: 1,
            status: "rascunho",
            currency: "BRL",
            notes:
              "Versão inicial criada para orientar o cadastro; preços ainda precisam ser confirmados.",
            createdBy: ctx.user.id,
          })
          .$returningId();
        await db.insert(budgetItems).values([
          {
            budgetVersionId: createdId.id,
            wbsNodeId: wbsFor("1.1", "1"),
            code: "01.001",
            description: "Mobilização e canteiro",
            unit: "vb",
            quantity: "1.000",
            unitPrice: "0.00",
            plannedDurationDays: 14,
            source: "A preencher",
            sortOrder: 0,
          },
          {
            budgetVersionId: createdId.id,
            wbsNodeId: wbsFor("2.1", "1.2"),
            code: "02.001",
            description: "Fundação e contenções",
            unit: "vb",
            quantity: "1.000",
            unitPrice: "0.00",
            plannedDurationDays: 28,
            source: "A preencher",
            sortOrder: 1,
          },
          {
            budgetVersionId: createdId.id,
            wbsNodeId: wbsFor("3.1", "1.3"),
            code: "03.001",
            description: "Estrutura dos pavimentos",
            unit: "vb",
            quantity: "1.000",
            unitPrice: "0.00",
            plannedDurationDays: 178,
            source: "A preencher",
            sortOrder: 2,
          },
        ]);
        return { id: createdId.id, created: true };
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
    reconcilePreview: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          thresholdPct: z.number().min(0).max(500).optional(),
          minScore: z.number().min(0).max(1).default(0.35),
        })
      )
      .query(async ({ ctx, input }) => {
        const thresholdPct =
          input.thresholdPct ?? ENV.priceVariationThresholdPct;
        const cacheKey = `reconcilePreview:${input.projectId}:${thresholdPct}:${input.minScore}`;
        const cached = cacheGet<
          | {
              catalog: null;
              items: [];
              thresholdPct: number;
              totalBefore: 0;
              totalAfter: 0;
            }
          | {
              catalog: {
                id: number;
                name: string;
                referencePeriod: string | null;
              } | null;
              items: Array<{
                budgetItemId: number;
                code: string;
                description: string;
                unit: string;
                quantity: number;
                manualPrice: number;
                isPriceException: boolean;
                match: {
                  kind: "priceItem" | "composition";
                  id: number;
                  code: string;
                  description: string;
                  unit: string;
                  unitPrice: number;
                  score: number;
                } | null;
                candidates: Array<{
                  kind: "priceItem" | "composition";
                  id: number;
                  code: string;
                  description: string;
                  unit: string;
                  unitPrice: number;
                  score: number;
                }>;
                variation: number | null;
                alert: boolean;
                projectedDelta: number;
              }>;
              thresholdPct: number;
              totalBefore: number;
              totalAfter: number;
            }
        >(cacheKey);
        if (cached) return cached;
        const db = await getDb();
        if (!db)
          return {
            catalog: null,
            items: [] as Array<{
              budgetItemId: number;
              code: string;
              description: string;
              unit: string;
              quantity: number;
              manualPrice: number;
              isPriceException: boolean;
              match: {
                kind: "priceItem" | "composition";
                id: number;
                code: string;
                description: string;
                unit: string;
                unitPrice: number;
                score: number;
              } | null;
              candidates: Array<{
                kind: "priceItem" | "composition";
                id: number;
                code: string;
                description: string;
                unit: string;
                unitPrice: number;
                score: number;
              }>;
              variation: number | null;
              alert: boolean;
              projectedDelta: number;
            }>,
            thresholdPct: ENV.priceVariationThresholdPct,
            totalBefore: 0,
            totalAfter: 0,
          };
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, input.projectId))
          .limit(1);
        const activeVersionId = (
          await db
            .select()
            .from(budgetVersions)
            .where(eq(budgetVersions.projectId, input.projectId))
            .orderBy(desc(budgetVersions.versionNumber))
            .limit(1)
        )[0]?.id;
        if (!project || !activeVersionId)
          return {
            catalog: null,
            items: [] as Array<{
              budgetItemId: number;
              code: string;
              description: string;
              unit: string;
              quantity: number;
              manualPrice: number;
              isPriceException: boolean;
              match: {
                kind: "priceItem" | "composition";
                id: number;
                code: string;
                description: string;
                unit: string;
                unitPrice: number;
                score: number;
              } | null;
              candidates: Array<{
                kind: "priceItem" | "composition";
                id: number;
                code: string;
                description: string;
                unit: string;
                unitPrice: number;
                score: number;
              }>;
              variation: number | null;
              alert: boolean;
              projectedDelta: number;
            }>,
            thresholdPct,
            totalBefore: 0,
            totalAfter: 0,
          };
        const items = await db
          .select()
          .from(budgetItems)
          .where(eq(budgetItems.budgetVersionId, activeVersionId))
          .orderBy(budgetItems.sortOrder);
        const seinfraCatalogs = await db
          .select()
          .from(priceCatalogs)
          .where(eq(priceCatalogs.sourceType, "SEINFRA"))
          .orderBy(desc(priceCatalogs.createdAt));
        const activeCatalog =
          seinfraCatalogs.find(
            row =>
              project.baseReferenciaRef === null ||
              row.referencePeriod === project.baseReferenciaRef
          ) ?? seinfraCatalogs[0];
        const baseItems = activeCatalog
          ? await db
              .select()
              .from(priceItems)
              .where(eq(priceItems.catalogId, activeCatalog.id))
          : [];
        const baseCompositions = await db
          .select()
          .from(serviceCompositions)
          .where(eq(serviceCompositions.sourceCatalogId, activeCatalog?.id ?? -1));
        const compositionIds = baseCompositions.map(row => row.id);
        const compositionComponentRows = compositionIds.length
          ? await db
              .select()
              .from(compositionComponents)
              .where(inArray(compositionComponents.compositionId, compositionIds))
          : [];
        const compositionPriceById = new Map<number, number>();
        for (const component of compositionComponentRows) {
          const current = compositionPriceById.get(component.compositionId) ?? 0;
          compositionPriceById.set(
            component.compositionId,
            current +
              Number(component.coefficient) * Number(component.unitPriceSnapshot)
          );
        }
        const records: ComparableRecord[] = [
          ...baseItems.map(row => ({
            kind: "priceItem" as const,
            id: row.id,
            code: row.code,
            description: row.description,
            unit: row.unit,
            unitPrice: Number(row.unitPrice),
          })),
          ...baseCompositions.map(row => ({
            kind: "composition" as const,
            id: row.id,
            code: row.code,
            description: row.description,
            unit: row.unit,
            unitPrice: compositionPriceById.get(row.id) ?? 0,
          })),
        ];
        const preview = items.map(item => {
          const manualPrice = Number(item.unitPrice);
          const codeCandidates = records.filter(
            record => record.code === item.code
          );
          const scored = [
            ...codeCandidates.map(record => ({ ...record, score: 1 })),
            ...findCandidates(item.description, records, {
              minScore: input.minScore,
              limit: 3,
            }).filter(
              candidate =>
                !codeCandidates.some(
                  existing =>
                    existing.kind === candidate.kind &&
                    existing.id === candidate.id
                )
            ),
          ].sort((a, b) => b.score - a.score);
          const best = scored[0] ?? null;
          const suggestedPrice = best ? best.unitPrice : null;
          const variation =
            suggestedPrice !== null
              ? priceVariation(manualPrice, suggestedPrice)
              : null;
          const alert =
            suggestedPrice !== null &&
            exceedsPriceThreshold(manualPrice, suggestedPrice, thresholdPct);
          const quantity = Number(item.quantity);
          return {
            budgetItemId: item.id,
            code: item.code,
            description: item.description,
            unit: item.unit,
            quantity,
            manualPrice,
            isPriceException: item.isPriceException,
            match: best
              ? {
                  kind: best.kind,
                  id: best.id,
                  code: best.code,
                  description: best.description,
                  unit: best.unit,
                  unitPrice: best.unitPrice,
                  score: best.score,
                }
              : null,
            candidates: scored.slice(1, 4),
            variation,
            alert,
            projectedDelta:
              suggestedPrice !== null
                ? (suggestedPrice - manualPrice) * quantity
                : 0,
          };
        });
        const totalBefore = preview.reduce(
          (sum, row) => sum + row.quantity * row.manualPrice,
          0
        );
        const totalAfter = preview.reduce((sum, row) => {
          const price = row.match ? row.match.unitPrice : row.manualPrice;
          return sum + row.quantity * price;
        }, 0);
        const result = {
          catalog: activeCatalog
            ? {
                id: activeCatalog.id,
                name: activeCatalog.name,
                referencePeriod: activeCatalog.referencePeriod,
              }
            : null,
          items: preview,
          thresholdPct,
          totalBefore,
          totalAfter,
        };
        cacheSet(cacheKey, result);
        return result;
      }),
    applyReconciliation: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          decisions: z
            .array(
              z.object({
                budgetItemId: z.number().int().positive(),
                action: z.enum(["apply_match", "keep_manual"]),
                matchKind: z.enum(["priceItem", "composition"]).optional(),
                matchId: z.number().int().positive().optional(),
                score: z.number().min(0).max(1).optional(),
              })
            )
            .min(1)
            .max(200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const activeVersion = (
          await db
            .select()
            .from(budgetVersions)
            .where(eq(budgetVersions.projectId, input.projectId))
            .orderBy(desc(budgetVersions.versionNumber))
            .limit(1)
        )[0];
        if (!activeVersion) throw new Error("Nenhuma versão de orçamento ativa.");
        if (activeVersion.status === "aprovado" || activeVersion.status === "arquivado")
          throw new Error("Versão aprovada/arquivada não aceita reconciliação.");
        cacheClearPrefix(`reconcilePreview:${input.projectId}:`);
        const itemIds = input.decisions.map(d => d.budgetItemId);
        const existing = await db
          .select()
          .from(budgetItems)
          .where(
            and(
              eq(budgetItems.budgetVersionId, activeVersion.id),
              inArray(budgetItems.id, itemIds)
            )
          );
        const byId = new Map(existing.map(row => [row.id, row]));
        const thresholdPct = ENV.priceVariationThresholdPct;
        const [projectRow] = await db
          .select({
            baseReferenciaRef: projects.baseReferenciaRef,
          })
          .from(projects)
          .where(eq(projects.id, input.projectId))
          .limit(1);
        const projectBaseRef = projectRow?.baseReferenciaRef ?? null;
        let applied = 0;
        let kept = 0;
        let exceptions = 0;
        for (const decision of input.decisions) {
          const item = byId.get(decision.budgetItemId);
          if (!item) throw new Error(`Item ${decision.budgetItemId} não nesta versão.`);
          const manualPrice = Number(item.unitPrice);
          if (decision.action === "keep_manual") {
            await db
              .update(budgetItems)
              .set({ isPriceException: true, source: "manual (fora da base padrão)" })
              .where(eq(budgetItems.id, item.id));
            await db.insert(projectAuditEvents).values({
              projectId: input.projectId,
              userId: ctx.user.id,
              action: "price_match_rejected",
              payload: {
                budgetItemId: item.id,
                manualDescription: item.description,
                manualPrice,
                score: decision.score ?? null,
                at: new Date().toISOString(),
              },
            });
            kept += 1;
            exceptions += 1;
            continue;
          }
          if (!decision.matchKind || !decision.matchId)
            throw new Error("apply_match exige matchKind e matchId.");
          let suggested: {
            description: string;
            unitPrice: number;
            code: string;
            unit: string;
          } | null = null;
          if (decision.matchKind === "priceItem") {
            const [row] = await db
              .select()
              .from(priceItems)
              .where(eq(priceItems.id, decision.matchId!))
              .limit(1);
            if (row)
              suggested = {
                description: row.description,
                unitPrice: Number(row.unitPrice),
                code: row.code,
                unit: row.unit,
              };
          } else {
            const [row] = await db
              .select()
              .from(serviceCompositions)
              .where(eq(serviceCompositions.id, decision.matchId!))
              .limit(1);
            if (row) {
              const components = await db
                .select()
                .from(compositionComponents)
                .where(
                  eq(compositionComponents.compositionId, row.id)
                );
              const computed = components.length
                ? components.reduce(
                    (sum, component) =>
                      sum +
                      Number(component.coefficient) *
                        Number(component.unitPriceSnapshot),
                    0
                  )
                : null;
              suggested = {
                description: row.description,
                unitPrice: computed ?? 0,
                code: row.code,
                unit: row.unit,
              };
            }
          }
          if (!suggested || suggested.unitPrice <= 0)
            throw new Error(
              `Match ${decision.matchKind}:${decision.matchId} não encontrado ou sem preço.`
            );
          const variation = priceVariation(manualPrice, suggested.unitPrice);
          const alert = exceedsPriceThreshold(
            manualPrice,
            suggested.unitPrice,
            thresholdPct
          );
          await db
            .update(budgetItems)
            .set({
              unitPrice: suggested.unitPrice.toFixed(2),
              source: `SEINFRA ${suggested.code}`,
              referencePeriod: projectBaseRef,
              isPriceException: false,
            })
            .where(eq(budgetItems.id, item.id));
          await db.insert(projectAuditEvents).values({
            projectId: input.projectId,
            userId: ctx.user.id,
            action: "price_match_applied",
            payload: {
              budgetItemId: item.id,
              manualDescription: item.description,
              seinfraDescription: suggested.description,
              seinfraCode: suggested.code,
              matchKind: decision.matchKind,
              matchId: decision.matchId,
              score: decision.score ?? null,
              manualPrice,
              seinfraPrice: suggested.unitPrice,
              variation,
              thresholdPct,
              alert,
              at: new Date().toISOString(),
            },
          });
          applied += 1;
        }
        const items = await db
          .select()
          .from(budgetItems)
          .where(eq(budgetItems.budgetVersionId, activeVersion.id));
        const total = items.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
          0
        );
        return { applied, kept, exceptions, total };
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
        const cacheKey = `catalog.list:${input.catalogId ?? "auto"}:${input.compositionId ?? "auto"}`;
        const cached = cacheGet<{
          catalogs: typeof priceCatalogs.$inferSelect[];
          priceItems: typeof priceItems.$inferSelect[];
          compositions: typeof serviceCompositions.$inferSelect[];
          components: typeof compositionComponents.$inferSelect[];
          total: number;
        }>(cacheKey);
        if (cached) return cached;
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
        const result = { catalogs, priceItems: items, compositions, components, total };
        cacheSet(cacheKey, result);
        return result;
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
        cacheClearPrefix("catalog.list:");
        cacheClearPrefix("reconcilePreview:");
        void ctx.user.id;
        return { id: createdId.id };
      }),
    importPriceSheet: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160).optional(),
          sourceType: z.enum(["SEINFRA"]),
          fileName: z.string().trim().min(1).max(240),
          fileDataBase64: z.string().min(1).max(40_000_000),
          referencePeriod: z.string().trim().min(2).max(20),
          state: z.string().trim().length(2).optional(),
          notes: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        const bytes = Buffer.from(input.fileDataBase64, "base64");
        if (!bytes.length) throw new Error("Arquivo vazio ou base64 inválido.");
        const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (!seinfraAdapter.canParse(input.fileName, uint8)) {
          throw new Error("Formato não suportado. Envie .xls ou .xlsx da SEINFRA (download manual do site).");
        }
        const parsed = await seinfraAdapter.parse(input.fileName, uint8);
        if (!parsed.records.length) {
          throw new Error("Nenhum preço reconhecido na planilha (cabeçalho não identificado).");
        }
        const referencePeriod = input.referencePeriod || parsed.referenceHint || "s/ ref";
        // Cada import = 1 NOVO priceCatalogs; nunca sobrescreve meses anteriores.
        const [created] = await db
          .insert(priceCatalogs)
          .values({
            name: input.name ?? `SEINFRA-CE ${referencePeriod}`,
            sourceType: "SEINFRA",
            state: (input.state ?? "CE").toUpperCase(),
            referencePeriod,
            notes: parsed.referenceHint
              ? `ref arquivo: ${parsed.referenceHint}; ${parsed.skipped} linha(s) ignoradas`
              : `${parsed.skipped} linha(s) ignoradas`,
            createdBy: ctx.user.id,
          })
          .$returningId();
        cacheClearPrefix("catalog.list:");
        cacheClearPrefix("reconcilePreview:");
        const chunkSize = 500;
        for (let i = 0; i < parsed.records.length; i += chunkSize) {
          const chunk = parsed.records.slice(i, i + chunkSize);
          await db.insert(priceItems).values(
            chunk.map(record => ({
              catalogId: created.id,
              code: record.code,
              description: record.description,
              unit: record.unit,
              itemType: record.itemType,
              unitPrice: record.unitPrice.toFixed(2),
              notes: record.notes ?? null,
            }))
          );
        }
        cacheClearPrefix("catalog.list:");
        cacheClearPrefix("reconcilePreview:");
        return {
          catalogId: created.id,
          referencePeriod,
          imported: parsed.records.length,
          skipped: parsed.skipped,
          referenceHint: parsed.referenceHint,
        };
      }),
    searchPrices: protectedProcedure
      .input(
        z.object({
          query: z.string().trim().min(2).max(240),
          sourceType: z.enum(["propria", "SINAPI", "SEINFRA", "fornecedor"]).optional(),
          limit: z.number().int().min(1).max(10).default(6),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { candidates: [] };
        const catalogs = input.sourceType
          ? await db
              .select({ id: priceCatalogs.id })
              .from(priceCatalogs)
              .where(eq(priceCatalogs.sourceType, input.sourceType))
          : await db.select({ id: priceCatalogs.id }).from(priceCatalogs);
        const catalogIds = catalogs.map(row => row.id);
        const baseItems = catalogIds.length
          ? await db
              .select()
              .from(priceItems)
              .where(inArray(priceItems.catalogId, catalogIds))
          : [];
        const compositions = await db
          .select({
            id: serviceCompositions.id,
            code: serviceCompositions.code,
            description: serviceCompositions.description,
            unit: serviceCompositions.unit,
          })
          .from(serviceCompositions);
        const records: ComparableRecord[] = [
          ...baseItems.map(row => ({
            kind: "priceItem" as const,
            id: row.id,
            code: row.code,
            description: row.description,
            unit: row.unit,
            unitPrice: Number(row.unitPrice),
          })),
          ...compositions.map(row => ({
            kind: "composition" as const,
            id: row.id,
            code: row.code,
            description: row.description,
            unit: row.unit,
            unitPrice: 0,
          })),
        ];
        const candidates = findCandidates(input.query, records, {
          limit: input.limit,
          minScore: 0.3,
        });
        return { candidates };
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
        cacheClearPrefix("catalog.list:");
        cacheClearPrefix("reconcilePreview:");
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
        const schedule = result.schedule;
        const items = schedule.activities;
        if (items.length) {
          const ids = items.map(item => Number(item.id));
          const critCase = sql.join(items.map(item => sql`WHEN ${Number(item.id)} THEN ${item.critical ? 1 : 0}`), sql` `);
          const esCase = sql.join(items.map(item => sql`WHEN ${Number(item.id)} THEN ${item.earlyStart ?? 0}`), sql` `);
          const efCase = sql.join(items.map(item => sql`WHEN ${Number(item.id)} THEN ${item.earlyFinish ?? 0}`), sql` `);
          const lsCase = sql.join(items.map(item => sql`WHEN ${Number(item.id)} THEN ${item.lateStart ?? 0}`), sql` `);
          const lfCase = sql.join(items.map(item => sql`WHEN ${Number(item.id)} THEN ${item.lateFinish ?? 0}`), sql` `);
          const tfCase = sql.join(items.map(item => sql`WHEN ${Number(item.id)} THEN ${item.totalFloat ?? 0}`), sql` `);
          await db.transaction(async tx => {
            await tx.execute(sql`
              UPDATE schedule_activities
              SET critical = CASE id ${critCase} END,
                  earlyStart = CASE id ${esCase} END,
                  earlyFinish = CASE id ${efCase} END,
                  lateStart = CASE id ${lsCase} END,
                  lateFinish = CASE id ${lfCase} END,
                  totalFloat = CASE id ${tfCase} END,
                  cpmCalculatedAt = ${calculatedAt}
              WHERE projectId = ${input.projectId}
                AND id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
            `);
          });
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
        const [wbsNode] = await db
          .select({ id: wbsNodes.id })
          .from(wbsNodes)
          .where(
            and(
              eq(wbsNodes.projectId, input.projectId),
              eq(wbsNodes.code, input.wbsCode)
            )
          )
          .limit(1);
        if (!wbsNode) throw new Error("O código informado não corresponde a um item da EAP desta obra.");
        const durationDays = input.durationDays ?? (input.plannedQuantity && input.productivity ? Math.max(1, Math.ceil(input.plannedQuantity / input.productivity)) : 1);
        const [createdId] = await db.insert(scheduleActivities).values({ projectId: input.projectId, wbsNodeId: wbsNode.id, wbsCode: input.wbsCode, eapRef: input.wbsCode, name: input.name, phase: input.phase, startOffset: input.startOffset, durationDays, plannedQuantity: input.plannedQuantity?.toFixed(3), productivity: input.productivity?.toFixed(3), budgetItemId: input.budgetItemId, sortOrder: Date.now() }).$returningId();
        return { id: createdId.id };
      }),
    generateFromEap: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const nodes = await db
          .select()
          .from(wbsNodes)
          .where(
            and(
              eq(wbsNodes.projectId, input.projectId),
              eq(wbsNodes.nodeType, "entrega")
            )
          )
          .orderBy(wbsNodes.sortOrder, wbsNodes.id);
        if (!nodes.length) {
          return {
            created: 0,
            skipped: 0,
            message: "A EAP desta obra não possui entregas (nós tipo entrega).",
          };
        }
        const existing = await db
          .select({ wbsCode: scheduleActivities.wbsCode })
          .from(scheduleActivities)
          .where(eq(scheduleActivities.projectId, input.projectId));
        const existingCodes = new Set(existing.map(row => row.wbsCode));
        const byId = new Map(nodes.map(node => [node.id, node]));
        let created = 0;
        let skipped = 0;
        for (const node of nodes) {
          if (existingCodes.has(node.code)) {
            skipped += 1;
            continue;
          }
          const parent = node.parentId != null ? byId.get(node.parentId) : undefined;
          const durationDays =
            node.plannedQuantity && node.plannedQuantity > 0
              ? Math.max(1, node.plannedQuantity)
              : 1;
          await db.insert(scheduleActivities).values({
            projectId: input.projectId,
            wbsNodeId: node.id,
            wbsCode: node.code,
            eapRef: node.code,
            name: node.name,
            phase: parent?.name?.slice(0, 80) || "Execução",
            startOffset: 0,
            durationDays,
            plannedQuantity: node.plannedQuantity
              ? String(node.plannedQuantity)
              : null,
            sortOrder: node.sortOrder * 1000 + node.id,
          });
          existingCodes.add(node.code);
          created += 1;
        }
        return {
          created,
          skipped,
          message: `${created} atividade(s) criada(s) a partir da EAP; ${skipped} já existiam.`,
        };
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
    evm: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), asOf: z.coerce.date().optional() }))
      .query(async ({ ctx, input }) => {
        const empty = {
          available: false as const,
          asOf: input.asOf ?? new Date(),
          bac: 0,
          pv: 0,
          ev: 0,
          ac: null as number | null,
          spi: null as number | null,
          cpi: null as number | null,
          sv: 0,
          cv: null as number | null,
          eac: null as number | null,
          vac: null as number | null,
          etc: null as number | null,
          plannedPct: 0,
          actualPct: 0,
          acLinked: false,
          note: "Banco de dados não configurado.",
        };
        const db = await getDb();
        if (!db) return empty;
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const versions = await db.select().from(budgetVersions).where(eq(budgetVersions.projectId, input.projectId)).orderBy(desc(budgetVersions.versionNumber));
        const active = versions[0];
        const items = active
          ? await db.select().from(budgetItems).where(eq(budgetItems.budgetVersionId, active.id))
          : [];
        const bac = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
        const [project] = await db.select({ plannedStart: projects.plannedStart }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId));
        const entries = await db.select({ activityId: productionEntries.activityId, quantity: productionEntries.quantity }).from(productionEntries).where(and(eq(productionEntries.projectId, input.projectId), eq(productionEntries.status, "confirmada")));
        const actualByActivity = new Map<number, number>();
        for (const entry of entries) actualByActivity.set(entry.activityId, (actualByActivity.get(entry.activityId) ?? 0) + Number(entry.quantity));
        const asOf = input.asOf ?? new Date();
        const start = project?.plannedStart?.getTime() ?? asOf.getTime();
        const elapsedDays = Math.max(0, Math.floor((asOf.getTime() - start) / 86400000));
        let weightedPlanned = 0;
        let weightedActual = 0;
        let totalPlannedQty = 0;
        let ac = 0;
        let acLinked = false;
        const budgetById = new Map(items.map(item => [item.id, item]));
        for (const activity of activities) {
          const plannedQuantity = Number(activity.plannedQuantity ?? 0);
          if (plannedQuantity <= 0) continue;
          const actualQuantity = actualByActivity.get(activity.id) ?? 0;
          const plannedStart = activity.earlyStart ?? activity.startOffset;
          const plannedProgress = Math.max(0, Math.min(100, ((elapsedDays - plannedStart) / Math.max(1, activity.durationDays)) * 100));
          const actualProgress = Math.max(0, Math.min(100, (actualQuantity / plannedQuantity) * 100));
          weightedPlanned += plannedQuantity * plannedProgress;
          weightedActual += plannedQuantity * actualProgress;
          totalPlannedQty += plannedQuantity;
          if (activity.budgetItemId) {
            const item = budgetById.get(activity.budgetItemId);
            if (item && Number(item.quantity) > 0) {
              const unitCost = Number(item.unitPrice) / Number(item.quantity);
              ac += actualQuantity * unitCost;
              acLinked = true;
            }
          }
        }
        const plannedPct = totalPlannedQty ? weightedPlanned / totalPlannedQty : 0;
        const actualPct = totalPlannedQty ? weightedActual / totalPlannedQty : 0;
        const pv = bac * (plannedPct / 100);
        const ev = bac * (actualPct / 100);
        const spi = pv > 0 ? ev / pv : null;
        const cpi = acLinked && ac > 0 ? ev / ac : null;
        const sv = ev - pv;
        const cv = acLinked ? ev - ac : null;
        const eac = cpi && cpi > 0 ? bac / cpi : bac > 0 ? bac : null;
        const vac = eac !== null ? bac - eac : null;
        const etc = eac !== null ? eac - (acLinked ? ac : ev) : null;
        const note = !bac
          ? "Orçamento sem valores — EVM físico (SPI) disponível; custos (CPI/EAC) aguardam preços."
          : !acLinked
            ? "CPI/EAC estimados sem custos vinculados às atividades."
            : null;
        return {
          available: true as const,
          asOf,
          bac,
          pv,
          ev,
          ac: acLinked ? ac : null,
          spi: spi === null ? null : Math.round(spi * 1000) / 1000,
          cpi: cpi === null ? null : Math.round(cpi * 1000) / 1000,
          sv: Math.round(sv * 100) / 100,
          cv: cv === null ? null : Math.round(cv * 100) / 100,
          eac: eac === null ? null : Math.round(eac * 100) / 100,
          vac: vac === null ? null : Math.round(vac * 100) / 100,
          etc: etc === null ? null : Math.round(etc * 100) / 100,
          plannedPct: Math.round(plannedPct * 10) / 10,
          actualPct: Math.round(actualPct * 10) / 10,
          acLinked,
          note,
        };
      }),
    scurve: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), asOf: z.coerce.date().optional() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { available: false as const, points: [] as { date: string; plannedPct: number; actualPct: number }[], note: "Banco de dados não configurado." };
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [project] = await db.select({ plannedStart: projects.plannedStart }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId));
        const entries = await db.select({ productionDate: productionEntries.productionDate, quantity: productionEntries.quantity, activityId: productionEntries.activityId }).from(productionEntries).where(and(eq(productionEntries.projectId, input.projectId), eq(productionEntries.status, "confirmada")));
        if (!activities.length) return { available: true as const, points: [] as { date: string; plannedPct: number; actualPct: number }[], note: "Sem atividades no cronograma." };
        const asOf = input.asOf ?? new Date();
        const startMs = project?.plannedStart?.getTime() ?? asOf.getTime();
        const start = new Date(startMs);
        const endOffset = Math.max(1, ...activities.map(a => (a.earlyStart ?? a.startOffset) + a.durationDays));
        const end = new Date(startMs + (endOffset - 1) * 86400000);
        const endMs = Math.max(end.getTime(), asOf.getTime(), ...entries.map(e => new Date(e.productionDate).getTime()));
        const totalDays = Math.max(1, Math.ceil((endMs - startMs) / 86400000));
        const step = Math.max(1, Math.ceil(totalDays / 90));
        const totalPlannedQty = activities.reduce((sum, a) => sum + Number(a.plannedQuantity ?? 0), 0);
        const actualByDay = new Map<string, number>();
        for (const entry of entries) {
          const key = new Date(entry.productionDate).toISOString().slice(0, 10);
          actualByDay.set(key, (actualByDay.get(key) ?? 0) + Number(entry.quantity));
        }
        const sortedActualDays = [...actualByDay.keys()].sort();
        const points: { date: string; plannedPct: number; actualPct: number }[] = [];
        let cumActual = 0;
        let dayIndex = 0;
        let actualCursor = 0;
        for (let offset = 0; offset <= totalDays; offset += step) {
          const dayMs = startMs + offset * 86400000;
          const dayDate = new Date(dayMs);
          const dayKey = dayDate.toISOString().slice(0, 10);
          while (actualCursor < sortedActualDays.length && sortedActualDays[actualCursor]! <= dayKey) {
            cumActual += actualByDay.get(sortedActualDays[actualCursor]!) ?? 0;
            actualCursor += 1;
          }
          let weightedPlanned = 0;
          for (const activity of activities) {
            const plannedQuantity = Number(activity.plannedQuantity ?? 0);
            if (plannedQuantity <= 0) continue;
            const plannedStart = activity.earlyStart ?? activity.startOffset;
            const progress = Math.max(0, Math.min(100, ((offset - plannedStart) / Math.max(1, activity.durationDays)) * 100));
            weightedPlanned += plannedQuantity * progress;
          }
          const plannedPct = totalPlannedQty ? weightedPlanned / totalPlannedQty : 0;
          const actualPct = totalPlannedQty ? Math.min(100, (cumActual / totalPlannedQty) * 100) : 0;
          points.push({
            date: dayKey,
            plannedPct: Math.round(plannedPct * 10) / 10,
            actualPct: Math.round(actualPct * 10) / 10,
          });
          dayIndex += 1;
        }
        if (points.length && points[points.length - 1]!.date < dayKeyAt(endMs)) {
          const dayKey = dayKeyAt(endMs);
          while (actualCursor < sortedActualDays.length && sortedActualDays[actualCursor]! <= dayKey) {
            cumActual += actualByDay.get(sortedActualDays[actualCursor]!) ?? 0;
            actualCursor += 1;
          }
          let weightedPlanned = 0;
          for (const activity of activities) {
            const plannedQuantity = Number(activity.plannedQuantity ?? 0);
            if (plannedQuantity <= 0) continue;
            const plannedStart = activity.earlyStart ?? activity.startOffset;
            const progress = Math.max(0, Math.min(100, ((endOffset - plannedStart) / Math.max(1, activity.durationDays)) * 100));
            weightedPlanned += plannedQuantity * progress;
          }
          points.push({
            date: dayKey,
            plannedPct: Math.round((totalPlannedQty ? weightedPlanned / totalPlannedQty : 0) * 10) / 10,
            actualPct: Math.round(Math.min(100, totalPlannedQty ? (cumActual / totalPlannedQty) * 100 : 0) * 10) / 10,
          });
        }
        void dayIndex;
        return { available: true as const, points, note: null as string | null };
      }),
    leveling: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return { available: false as const, capacity: 0, histogram: [] as { offset: number; demand: number }[], peaks: [] as { offset: number; demand: number }[], suggestions: [] as { activityId: number; wbsCode: string; name: string; fromOffset: number; toOffset: number; float: number }[], note: "Banco de dados não configurado." };
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const activities = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId)).orderBy(scheduleActivities.sortOrder);
        const resources = await db.select().from(planningResources).where(and(eq(planningResources.projectId, input.projectId), eq(planningResources.resourceType, "mao_de_obra"), eq(planningResources.active, 1)));
        if (!activities.length) return { available: true as const, capacity: 0, histogram: [] as { offset: number; demand: number }[], peaks: [] as { offset: number; demand: number }[], suggestions: [] as { activityId: number; wbsCode: string; name: string; fromOffset: number; toOffset: number; float: number }[], note: "Sem atividades no cronograma." };
        const capacity = resources.reduce((sum, resource) => sum + Number(resource.capacityPerDay ?? 0), 0);
        const activityIds = activities.map(activity => activity.id);
        const allocations = activityIds.length
          ? await db.select().from(activityResourceAllocations).where(inArray(activityResourceAllocations.activityId, activityIds))
          : [];
        const allocByActivity = new Map<number, number>();
        for (const allocation of allocations) {
          allocByActivity.set(allocation.activityId, (allocByActivity.get(allocation.activityId) ?? 0) + Number(allocation.quantity));
        }
        const span = Math.max(1, ...activities.map(a => (a.earlyStart ?? a.startOffset) + a.durationDays));
        const demandByDay = new Array<number>(span).fill(0);
        for (const activity of activities) {
          const start = activity.earlyStart ?? activity.startOffset;
          const duration = Math.max(1, activity.durationDays);
          const demand = allocByActivity.get(activity.id) ?? 0;
          if (demand <= 0) continue;
          for (let day = start; day < start + duration && day < span; day += 1) {
            if (day >= 0) demandByDay[day] = (demandByDay[day] ?? 0) + demand;
          }
        }
        const histogram = demandByDay.map((demand, offset) => ({ offset, demand: Math.round(demand * 1000) / 1000 }));
        const peaks = capacity > 0
          ? histogram.filter(point => point.demand > capacity)
          : [];
        const suggestions: { activityId: number; wbsCode: string; name: string; fromOffset: number; toOffset: number; float: number }[] = [];
        if (peaks.length && capacity > 0) {
          const peakSet = new Set(peaks.map(peak => peak.offset));
          for (const activity of activities) {
            const float = activity.totalFloat ?? 0;
            if (float <= 0 || activity.critical === 1) continue;
            const start = activity.earlyStart ?? activity.startOffset;
            const duration = Math.max(1, activity.durationDays);
            let overlaps = false;
            for (let day = start; day < start + duration; day += 1) {
              if (peakSet.has(day)) {
                overlaps = true;
                break;
              }
            }
            if (!overlaps) continue;
            const toOffset = Math.min(start + float, span - duration);
            if (toOffset <= start) continue;
            suggestions.push({
              activityId: activity.id,
              wbsCode: activity.wbsCode,
              name: activity.name,
              fromOffset: start,
              toOffset,
              float,
            });
            if (suggestions.length >= 12) break;
          }
        }
        const note = !capacity
          ? "Cadastre capacidade/dia nos recursos de mão de obra para detectar picos."
          : !allocations.length
            ? "Aloque recursos nas atividades (allocateResource) para montar a demanda diária."
            : peaks.length
              ? `${peaks.length} dia(s) acima da capacidade de ${capacity}/dia.`
              : "Demanda dentro da capacidade nos dias calculados.";
        return {
          available: true as const,
          capacity: Math.round(capacity * 1000) / 1000,
          histogram,
          peaks,
          suggestions,
          note,
        };
      }),
    applyLevelShift: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive(), activityId: z.number().int().positive(), newStartOffset: z.number().int().min(0) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [activity] = await db.select().from(scheduleActivities).where(and(eq(scheduleActivities.id, input.activityId), eq(scheduleActivities.projectId, input.projectId))).limit(1);
        if (!activity) throw new Error("Atividade não encontrada.");
        const float = activity.totalFloat ?? 0;
        const current = activity.earlyStart ?? activity.startOffset;
        if (activity.critical === 1 && input.newStartOffset !== current) {
          throw new Error("Atividade crítica não pode ser deslocada no nivelamento.");
        }
        if (input.newStartOffset < current || input.newStartOffset > current + float) {
          throw new Error(`Deslocamento fora da folga total (${float} dia(s)).`);
        }
        await db.update(scheduleActivities).set({ startOffset: input.newStartOffset, earlyStart: input.newStartOffset }).where(and(eq(scheduleActivities.id, activity.id), eq(scheduleActivities.projectId, input.projectId)));
        const dependencies = await db.select().from(scheduleDependencies).where(eq(scheduleDependencies.projectId, input.projectId));
        const all = await db.select().from(scheduleActivities).where(eq(scheduleActivities.projectId, input.projectId)).orderBy(scheduleActivities.sortOrder);
        const result = calculateDeterministicCpm(all, dependencies);
        if (result.valid && result.schedule) {
          const calculatedAt = new Date();
          for (const item of result.schedule.activities) {
            await db.update(scheduleActivities).set({ critical: item.critical ? 1 : 0, earlyStart: item.earlyStart, earlyFinish: item.earlyFinish, lateStart: item.lateStart, lateFinish: item.lateFinish, totalFloat: item.totalFloat, cpmCalculatedAt: calculatedAt }).where(and(eq(scheduleActivities.id, Number(item.id)), eq(scheduleActivities.projectId, input.projectId)));
          }
        }
        return { ok: true as const, newStartOffset: input.newStartOffset, cpmValid: result.valid };
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
            ctx.user.id
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
        return { id: created.id };
      }),
    transitionFinding: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          findingId: z.number().int().positive(),
          to: z.enum(["resolved", "open", "obsolete"]),
          note: z.string().trim().max(2000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Banco de dados não configurado.");
        await assertAccessibleProject(db, input.projectId, ctx.user.id);
        const [finding] = await db
          .select()
          .from(agentFindings)
          .where(
            and(
              eq(agentFindings.id, input.findingId),
              eq(agentFindings.projectId, input.projectId)
            )
          )
          .limit(1);
        if (!finding) throw new Error("Achado não encontrado nesta obra.");
        if (!canTransitionFinding(finding.status, input.to)) {
          throw new Error(
            `Transição inválida: ${finding.status} → ${input.to}. Permitido a partir de: ${allowedSourcesFor(input.to).join(", ")}.`
          );
        }
        const reopening = input.to === "open";
        await db
          .update(agentFindings)
          .set({
            status: input.to,
            resolvedAt: reopening ? null : new Date(),
            resolvedBy: reopening ? null : ctx.user.id,
            resolutionNote: input.note ?? null,
          })
          .where(eq(agentFindings.id, input.findingId));
        return loadAgentCoordinatorSnapshot(db, input.projectId, ctx.user.id);
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
