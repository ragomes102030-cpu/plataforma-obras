import { and, desc, eq, isNull, or } from "drizzle-orm";
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
  scheduleActivities,
  scheduleDependencies,
  wbsNodes,
} from "../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { runProjectAgent } from "./agent";
import { runProjectOrchestrator } from "./orchestrator";
import { buildAgentProjectContext } from "./agent/context-builder";
import {
  callControlledMcpTool,
  callReadOnlyMcpTool,
  CONTROLLED_MUTATION_POLICY,
  getConstructionMcpStatus,
  runConstructionMcpHomologation,
} from "./integrations/construction-mcps";
import {
  buildPhase7ImportPlan,
  type Phase7ImportPlan,
} from "./integrations/phase7-import";

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
  and(
    eq(projects.id, projectId),
    or(eq(projects.ownerUserId, userId), isNull(projects.ownerUserId))
  );

const mcpProviderSchema = z.enum(["eap", "cronograma", "ganttLob"]);
const mcpProviders = ["eap", "cronograma", "ganttLob"] as const;
type McpProvider = (typeof mcpProviders)[number];

function mcpEndpoint(provider: McpProvider) {
  return {
    eap: ENV.mcpEapUrl,
    cronograma: ENV.mcpCronogramaUrl,
    ganttLob: ENV.mcpGanttLobUrl,
  }[provider];
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

async function buildPhase7PlanForProject(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  projectId: number
): Promise<Phase7ImportPlan> {
  const mappings = await db
    .select()
    .from(projectMcpIntegrations)
    .where(eq(projectMcpIntegrations.projectId, projectId));
  const externalProjectId = (provider: McpProvider) => {
    const value = mappings.find(item => item.provider === provider)?.externalProjectId;
    if (!value || value.toLowerCase() === "default") {
      throw new Error(`Cadastre um project_id de homologação válido para o MCP ${provider}.`);
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
  const cpmResult = await callReadOnlyMcpTool("cronograma", "calcular_caminho_critico", {
    project_id: cronogramaProjectId,
  });
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
        ? localWbsByExternalId.get(node.parentExternalId) ?? null
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
                (Date.parse(activity.startDate) - project.plannedStart.getTime()) /
                  86400000
              )
            )
          : 0,
        durationDays: activity.durationDays,
        progress: activity.progress,
        status: activity.progress >= 100
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
      const predecessorId = localActivitiesByExternalId.get(dependency.predecessorExternalId);
      const successorId = localActivitiesByExternalId.get(dependency.successorExternalId);
      if (!predecessorId || !successorId) throw new Error("Dependência sem atividades locais correspondentes.");
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
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  projects: router({
    list: publicProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db || !ctx.user) return demoProjects;
      const rows = await db
        .select()
        .from(projects)
        .where(
          or(
            eq(projects.ownerUserId, ctx.user.id),
            isNull(projects.ownerUserId)
          )
        )
        .orderBy(desc(projects.updatedAt));
      return rows.length ? rows : demoProjects;
    }),
    activities: publicProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return input.projectId === 1 ? demoActivities : [];
        if (ctx.user) {
          await assertAccessibleProject(db, input.projectId, ctx.user.id);
        }
        const rows = await db
          .select()
          .from(scheduleActivities)
          .where(eq(scheduleActivities.projectId, input.projectId))
          .orderBy(scheduleActivities.sortOrder);
        return rows.length ? rows : input.projectId === 1 ? demoActivities : [];
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
            progress: input.progress,
            status: input.status,
          })
          .where(eq(scheduleActivities.id, input.activityId));
        return { updated: true as const };
      }),
    wbs: publicProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        if (ctx.user) {
          await assertAccessibleProject(db, input.projectId, ctx.user.id);
        }
        return db
          .select()
          .from(wbsNodes)
          .where(eq(wbsNodes.projectId, input.projectId))
          .orderBy(wbsNodes.sortOrder);
      }),
    dependencies: publicProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        if (ctx.user) {
          await assertAccessibleProject(db, input.projectId, ctx.user.id);
        }
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
        const [createdId] = await db
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
        const [created] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, createdId.id))
          .limit(1);
        return created;
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
  }),
  agent: router({
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
          project = demoProjects.find(item => item.id === input.projectId);
          activities = input.projectId === 1 ? demoActivities : [];
          if (!project) throw new Error("Obra não encontrada.");
        }
        return runProjectAgent({ project, activities }, input.messages);
      }),
    orchestrate: protectedProcedure
      .input(
        z.object({
          projectId: z.number().int().positive(),
          mcpProjectId: z.string().trim().min(1).max(120).optional(),
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
          project = demoProjects.find(item => item.id === input.projectId);
          activities = input.projectId === 1 ? demoActivities : [];
          if (!project) throw new Error("Obra não encontrada.");
        }
        return runProjectOrchestrator(
          buildAgentProjectContext(project, activities, input.context),
          input.messages,
          { mcpProjectId: input.mcpProjectId }
        );
      }),
  }),
  integrations: router({
    projectMappings: protectedProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return mcpProviders.map(provider => ({
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
          return row ?? {
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
            syncState: "ready",
            lastError: null,
          })
          .onDuplicateKeyUpdate({
            set: {
              externalProjectId: input.externalProjectId,
              endpointUrl: mcpEndpoint(input.provider),
              syncState: "ready",
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
            const value = mappings.find(item => item.provider === provider)
              ?.externalProjectId;
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
          throw new Error("Os argumentos da mutação excedem o limite permitido.");
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
        if (!externalProjectId || externalProjectId.toLowerCase() === "default") {
          throw new Error("Cadastre um project_id externo válido antes da prévia.");
        }
        const idempotencyKey = input.idempotencyKey ?? randomUUID();
        const existing = await db
          .select()
          .from(mcpMutationOperations)
          .where(eq(mcpMutationOperations.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing[0]) {
          if (existing[0].userId !== ctx.user.id) {
            throw new Error("A chave de idempotência já pertence a outro usuário.");
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
        if (!created[0]) throw new Error("Não foi possível registrar a prévia.");
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
            result: operation.resultJson ? JSON.parse(operation.resultJson) : null,
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
          return { operationId: operation.id, replayed: false as const, result };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha na mutação MCP.";
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
          if (!operation[0]) throw new Error("Mutação de evidência não encontrada.");
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
            const value = mappings.find(item => item.provider === provider)
              ?.externalProjectId;
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
        await db
          .insert(mcpHomologationRuns)
          .values({
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
          domain: z.enum(["eap", "cronograma", "ganttLob"]),
          toolName: z.string().min(1).max(100),
          args: z.record(z.string(), z.unknown()).default({}),
        })
      )
      .mutation(({ input }) =>
        callReadOnlyMcpTool(input.domain, input.toolName, input.args)
      ),
  }),
});

export type AppRouter = typeof appRouter;
