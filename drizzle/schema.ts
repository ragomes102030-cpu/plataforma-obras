import {
  int,
  mysqlEnum,
  mysqlTable,
  decimal,
  index,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  ownerUserId: int("ownerUserId").references(() => users.id),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  location: varchar("location", { length: 180 }).notNull(),
  status: mysqlEnum("status", [
    "Em execução",
    "Planejamento",
    "Concluída",
    "Em risco",
  ])
    .default("Planejamento")
    .notNull(),
  progress: int("progress").default(0).notNull(),
  plannedStart: timestamp("plannedStart").notNull(),
  plannedFinish: timestamp("plannedFinish").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectMcpIntegrations = mysqlTable(
  "project_mcp_integrations",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    provider: mysqlEnum("provider", ["eap", "cronograma", "ganttLob"]).notNull(),
    externalProjectId: varchar("externalProjectId", { length: 180 }),
    endpointUrl: varchar("endpointUrl", { length: 500 }).notNull(),
    syncState: mysqlEnum("syncState", [
      "unconfigured",
      "ready",
      "pending",
      "error",
    ])
      .default("unconfigured")
      .notNull(),
    lastSyncedAt: timestamp("lastSyncedAt"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("project_mcp_integrations_project_provider_idx").on(
      table.projectId,
      table.provider
    ),
    index("project_mcp_integrations_project_idx").on(table.projectId),
  ]
);

export const mcpMutationOperations = mysqlTable(
  "mcp_mutation_operations",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    provider: mysqlEnum("provider", ["eap", "cronograma", "ganttLob"]).notNull(),
    toolName: varchar("toolName", { length: 100 }).notNull(),
    externalProjectId: varchar("externalProjectId", { length: 180 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    confirmationToken: varchar("confirmationToken", { length: 64 }).notNull(),
    argsJson: text("argsJson").notNull(),
    resultJson: text("resultJson"),
    error: text("error"),
    status: mysqlEnum("status", [
      "preview",
      "confirmed",
      "executing",
      "succeeded",
      "failed",
      "cancelled",
    ])
      .default("preview")
      .notNull(),
    confirmedAt: timestamp("confirmedAt"),
    executedAt: timestamp("executedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mcp_mutation_operations_idempotency_idx").on(
      table.idempotencyKey
    ),
    index("mcp_mutation_operations_project_idx").on(table.projectId),
    index("mcp_mutation_operations_user_idx").on(table.userId),
  ]
);

export const scheduleActivities = mysqlTable("schedule_activities", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  wbsCode: varchar("wbsCode", { length: 32 }).notNull(),
  name: varchar("name", { length: 220 }).notNull(),
  phase: varchar("phase", { length: 80 }).notNull(),
  startOffset: int("startOffset").notNull(),
  durationDays: int("durationDays").notNull(),
  progress: int("progress").default(0).notNull(),
  status: mysqlEnum("status", [
    "Não iniciado",
    "Em andamento",
    "Concluído",
    "Em risco",
  ])
    .default("Não iniciado")
    .notNull(),
  critical: int("critical").default(0).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const wbsNodes = mysqlTable("wbs_nodes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  parentId: int("parentId"),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 220 }).notNull(),
  level: int("level").default(1).notNull(),
  nodeType: mysqlEnum("nodeType", ["grupo", "pacote", "entrega"])
    .default("pacote")
    .notNull(),
  unit: varchar("unit", { length: 32 }),
  plannedQuantity: int("plannedQuantity"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const scheduleDependencies = mysqlTable("schedule_dependencies", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  predecessorId: int("predecessorId")
    .notNull()
    .references(() => scheduleActivities.id),
  successorId: int("successorId")
    .notNull()
    .references(() => scheduleActivities.id),
  type: mysqlEnum("type", ["FS", "SS", "FF", "SF"]).default("FS").notNull(),
  lag: int("lag").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const productionFronts = mysqlTable("production_fronts", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  location: varchar("location", { length: 180 }),
  status: mysqlEnum("status", ["ativa", "pausada", "concluida"])
    .default("ativa")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productionTeams = mysqlTable("production_teams", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  name: varchar("name", { length: 180 }).notNull(),
  trade: varchar("trade", { length: 120 }).notNull(),
  memberCount: int("memberCount").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productionUnits = mysqlTable("production_units", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  unitType: varchar("unitType", { length: 80 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const productionEntries = mysqlTable("production_entries", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId")
    .notNull()
    .references(() => projects.id),
  frontId: int("frontId")
    .notNull()
    .references(() => productionFronts.id),
  teamId: int("teamId")
    .notNull()
    .references(() => productionTeams.id),
  unitId: int("unitId")
    .notNull()
    .references(() => productionUnits.id),
  activityId: int("activityId")
    .notNull()
    .references(() => scheduleActivities.id),
  productionDate: timestamp("productionDate").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  measurementUnit: varchar("measurementUnit", { length: 32 }).notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["rascunho", "confirmada"])
    .default("rascunho")
    .notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type ProjectMcpIntegration = typeof projectMcpIntegrations.$inferSelect;
export type InsertProjectMcpIntegration =
  typeof projectMcpIntegrations.$inferInsert;
export type McpMutationOperation = typeof mcpMutationOperations.$inferSelect;
export type InsertMcpMutationOperation =
  typeof mcpMutationOperations.$inferInsert;
export type ScheduleActivity = typeof scheduleActivities.$inferSelect;
export type WbsNode = typeof wbsNodes.$inferSelect;
export type ScheduleDependency = typeof scheduleDependencies.$inferSelect;
export type ProductionFront = typeof productionFronts.$inferSelect;
export type ProductionTeam = typeof productionTeams.$inferSelect;
export type ProductionUnit = typeof productionUnits.$inferSelect;
export type ProductionEntry = typeof productionEntries.$inferSelect;
