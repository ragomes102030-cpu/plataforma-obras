import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  projects,
  productionEntries,
  productionFronts,
  productionTeams,
  productionUnits,
  scheduleActivities,
  scheduleDependencies,
  wbsNodes,
} from "../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { runProjectAgent } from "./agent";
import { runProjectOrchestrator } from "./orchestrator";
import { buildAgentProjectContext } from "./agent/context-builder";
import {
  callReadOnlyMcpTool,
  listConstructionMcpTools,
} from "./integrations/construction-mcps";

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
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return input.projectId === 1 ? demoActivities : [];
        const rows = await db
          .select()
          .from(scheduleActivities)
          .where(eq(scheduleActivities.projectId, input.projectId))
          .orderBy(scheduleActivities.sortOrder);
        return rows.length ? rows : input.projectId === 1 ? demoActivities : [];
      }),
    wbs: publicProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(wbsNodes)
          .where(eq(wbsNodes.projectId, input.projectId))
          .orderBy(wbsNodes.sortOrder);
      }),
    dependencies: publicProcedure
      .input(z.object({ projectId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
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
        await seedStarterPlan(db, createdId.id);
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
    mcpStatus: protectedProcedure.query(async () => {
      const startedAt = Date.now();
      try {
        const tools = await listConstructionMcpTools();
        return {
          status: "online" as const,
          durationMs: Date.now() - startedAt,
          servers: Object.fromEntries(
            Object.entries(tools).map(([name, entries]) => [
              name,
              {
                status: "online" as const,
                toolCount: entries.length,
                tools: entries.map(tool => tool.name),
              },
            ])
          ),
        };
      } catch (error) {
        return {
          status: "degraded" as const,
          durationMs: Date.now() - startedAt,
          error:
            error instanceof Error
              ? error.message
              : "Falha desconhecida nos MCPs",
        };
      }
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
