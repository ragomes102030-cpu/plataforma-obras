import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type ScheduleActivity = typeof scheduleActivities.$inferSelect;
export type WbsNode = typeof wbsNodes.$inferSelect;
export type ScheduleDependency = typeof scheduleDependencies.$inferSelect;
