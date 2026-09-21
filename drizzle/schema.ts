import {
  int,
  mysqlEnum,
  mysqlTable,
  AnyMySqlColumn,
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
    provider: mysqlEnum("provider", [
      "eap",
      "cronograma",
      "ganttLob",
    ]).notNull(),
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
    provider: mysqlEnum("provider", [
      "eap",
      "cronograma",
      "ganttLob",
    ]).notNull(),
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

export const mcpHomologationRuns = mysqlTable(
  "mcp_homologation_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    requestId: varchar("requestId", { length: 128 }).notNull(),
    status: mysqlEnum("status", [
      "planned",
      "read_only_running",
      "read_only_passed",
      "read_only_degraded",
      "reconciled",
      "failed",
    ])
      .default("planned")
      .notNull(),
    planJson: text("planJson").notNull(),
    readOnlyResultJson: text("readOnlyResultJson"),
    reconciliationJson: text("reconciliationJson"),
    error: text("error"),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mcp_homologation_runs_project_idx").on(table.projectId),
    index("mcp_homologation_runs_user_idx").on(table.userId),
  ]
);

export const scheduleActivities = mysqlTable(
  "schedule_activities",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    wbsNodeId: int("wbsNodeId")
      .notNull()
      .references(() => wbsNodes.id, { onDelete: "restrict" }),
    externalId: varchar("externalId", { length: 180 }),
    eapRef: varchar("eapRef", { length: 180 }),
    wbsCode: varchar("wbsCode", { length: 32 }).notNull(),
    name: varchar("name", { length: 220 }).notNull(),
    phase: varchar("phase", { length: 80 }).notNull(),
    startOffset: int("startOffset").notNull(),
    durationDays: int("durationDays").notNull(),
    plannedQuantity: decimal("plannedQuantity", { precision: 14, scale: 3 }),
    productivity: decimal("productivity", { precision: 14, scale: 3 }),
    budgetItemId: int("budgetItemId"),
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
    earlyStart: int("earlyStart"),
    earlyFinish: int("earlyFinish"),
    lateStart: int("lateStart"),
    lateFinish: int("lateFinish"),
    totalFloat: int("totalFloat"),
    cpmCalculatedAt: timestamp("cpmCalculatedAt"),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("schedule_activities_project_external_idx").on(
      table.projectId,
      table.externalId
    ),
    index("schedule_activities_project_idx").on(table.projectId),
    index("schedule_activities_wbs_node_idx").on(table.wbsNodeId),
  ]
);

export const wbsNodes = mysqlTable(
  "wbs_nodes",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    externalId: varchar("externalId", { length: 180 }),
    externalUid: varchar("externalUid", { length: 180 }),
    parentId: int("parentId").references((): AnyMySqlColumn => wbsNodes.id, {
      onDelete: "restrict",
    }),
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
  },
  table => [
    uniqueIndex("wbs_nodes_project_external_idx").on(
      table.projectId,
      table.externalId
    ),
    uniqueIndex("wbs_nodes_project_code_unique_idx").on(
      table.projectId,
      table.code
    ),
    index("wbs_nodes_project_idx").on(table.projectId),
  ]
);

export const scheduleDependencies = mysqlTable(
  "schedule_dependencies",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    externalId: varchar("externalId", { length: 180 }),
    predecessorId: int("predecessorId")
      .notNull()
      .references(() => scheduleActivities.id),
    successorId: int("successorId")
      .notNull()
      .references(() => scheduleActivities.id),
    type: mysqlEnum("type", ["FS", "SS", "FF", "SF"]).default("FS").notNull(),
    lag: int("lag").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("schedule_dependencies_project_external_idx").on(
      table.projectId,
      table.externalId
    ),
  ]
);

export const planningResources = mysqlTable("planning_resources", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 180 }).notNull(),
  resourceType: mysqlEnum("resourceType", ["mao_de_obra", "equipamento", "material"]).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  capacityPerDay: decimal("capacityPerDay", { precision: 14, scale: 3 }),
  costPerDay: decimal("costPerDay", { precision: 14, scale: 2 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const activityResourceAllocations = mysqlTable(
  "activity_resource_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId").notNull().references(() => scheduleActivities.id),
    resourceId: int("resourceId").notNull().references(() => planningResources.id),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).default("1").notNull(),
    productivity: decimal("productivity", { precision: 14, scale: 3 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("activity_resource_unique_idx").on(table.activityId, table.resourceId),
    index("activity_resource_activity_idx").on(table.activityId),
  ]
);

export const scheduleBaselines = mysqlTable("schedule_baselines", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["rascunho", "ativa", "arquivada"]).default("ativa").notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scheduleBaselineItems = mysqlTable(
  "schedule_baseline_items",
  {
    id: int("id").autoincrement().primaryKey(),
    baselineId: int("baselineId").notNull().references(() => scheduleBaselines.id),
    activityId: int("activityId").notNull().references(() => scheduleActivities.id),
    startOffset: int("startOffset").notNull(),
    durationDays: int("durationDays").notNull(),
    earlyStart: int("earlyStart"),
    earlyFinish: int("earlyFinish"),
  },
  table => [
    uniqueIndex("schedule_baseline_activity_idx").on(table.baselineId, table.activityId),
    index("schedule_baseline_items_baseline_idx").on(table.baselineId),
  ]
);

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

export const budgetVersions = mysqlTable(
  "budget_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 160 }).notNull(),
    versionNumber: int("versionNumber").notNull(),
    status: mysqlEnum("status", ["rascunho", "em_revisao", "aprovado", "arquivado"])
      .default("rascunho")
      .notNull(),
    currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("budget_versions_project_version_idx").on(
      table.projectId,
      table.versionNumber
    ),
    index("budget_versions_project_idx").on(table.projectId),
  ]
);

export const budgetItems = mysqlTable(
  "budget_items",
  {
    id: int("id").autoincrement().primaryKey(),
    budgetVersionId: int("budgetVersionId")
      .notNull()
      .references(() => budgetVersions.id),
    wbsNodeId: int("wbsNodeId").references(() => wbsNodes.id),
    code: varchar("code", { length: 48 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 14, scale: 2 }).notNull(),
    compositionId: int("compositionId"),
    compositionUnitCost: decimal("compositionUnitCost", { precision: 14, scale: 2 }),
    productivity: decimal("productivity", { precision: 14, scale: 3 }),
    plannedDurationDays: int("plannedDurationDays"),
    source: varchar("source", { length: 80 }),
    referencePeriod: varchar("referencePeriod", { length: 20 }),
    compositionNote: text("compositionNote"),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("budget_items_version_code_idx").on(
      table.budgetVersionId,
      table.code
    ),
    index("budget_items_version_idx").on(table.budgetVersionId),
  ]
);

export const priceCatalogs = mysqlTable(
  "price_catalogs",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    sourceType: mysqlEnum("sourceType", ["propria", "SINAPI", "SEINFRA", "fornecedor"])
      .notNull(),
    state: varchar("state", { length: 2 }),
    referencePeriod: varchar("referencePeriod", { length: 20 }).notNull(),
    status: mysqlEnum("status", ["ativo", "arquivado"]).default("ativo").notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("price_catalogs_reference_idx").on(table.referencePeriod)]
);

export const priceItems = mysqlTable(
  "price_items",
  {
    id: int("id").autoincrement().primaryKey(),
    catalogId: int("catalogId")
      .notNull()
      .references(() => priceCatalogs.id),
    code: varchar("code", { length: 64 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    itemType: mysqlEnum("itemType", ["material", "mao_de_obra", "equipamento", "servico"])
      .notNull(),
    unitPrice: decimal("unitPrice", { precision: 14, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("price_items_catalog_code_idx").on(table.catalogId, table.code),
    index("price_items_catalog_idx").on(table.catalogId),
  ]
);

export const serviceCompositions = mysqlTable(
  "service_compositions",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    sourceCatalogId: int("sourceCatalogId").references(() => priceCatalogs.id),
    referencePeriod: varchar("referencePeriod", { length: 20 }),
    status: mysqlEnum("status", ["rascunho", "validada", "arquivada"])
      .default("rascunho")
      .notNull(),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("service_compositions_code_idx").on(table.code),
    index("service_compositions_source_idx").on(table.sourceCatalogId),
  ]
);

export const compositionComponents = mysqlTable(
  "composition_components",
  {
    id: int("id").autoincrement().primaryKey(),
    compositionId: int("compositionId")
      .notNull()
      .references(() => serviceCompositions.id),
    priceItemId: int("priceItemId")
      .notNull()
      .references(() => priceItems.id),
    componentType: mysqlEnum("componentType", ["material", "mao_de_obra", "equipamento"])
      .notNull(),
    coefficient: decimal("coefficient", { precision: 14, scale: 6 }).notNull(),
    unitPriceSnapshot: decimal("unitPriceSnapshot", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("composition_components_unique_idx").on(
      table.compositionId,
      table.priceItemId
    ),
    index("composition_components_composition_idx").on(table.compositionId),
  ]
);

export const llmProviderSettings = mysqlTable("llm_provider_settings", {
  id: int("id").primaryKey(),
  encryptedConfig: text("encryptedConfig").notNull(),
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const agentProjectStates = mysqlTable(
  "agent_project_states",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    stage: mysqlEnum("stage", [
      "DESCRITIVO",
      "EAP_PROPOSTA",
      "EAP_REVISAO",
      "ATIVIDADES_PROPOSTA",
      "DEPENDENCIAS_PROPOSTA",
      "CPM_VALIDADO",
      "CRONOGRAMA_PROPOSTO",
      "BASELINE_PROPOSTA",
      "GANTT_LOB_PROPOSTO",
      "CONTROLE",
    ])
      .default("DESCRITIVO")
      .notNull(),
    activeSection: varchar("activeSection", { length: 40 })
      .default("portfolio")
      .notNull(),
    activeSubtab: varchar("activeSubtab", { length: 40 }),
    blockerCount: int("blockerCount").default(0).notNull(),
    lastSummary: text("lastSummary"),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("agent_project_states_project_idx").on(table.projectId),
    index("agent_project_states_stage_idx").on(table.stage),
  ]
);

export const agentDecisions = mysqlTable(
  "agent_decisions",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    stage: varchar("stage", { length: 50 }).notNull(),
    decision: mysqlEnum("decision", [
      "approved",
      "partially_approved",
      "rejected",
      "reopen",
    ]).notNull(),
    scopeJson: text("scopeJson").notNull(),
    reason: text("reason"),
    impactJson: text("impactJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("agent_decisions_project_idx").on(table.projectId),
    index("agent_decisions_project_stage_idx").on(table.projectId, table.stage),
  ]
);

export const agentFindings = mysqlTable(
  "agent_findings",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    stage: varchar("stage", { length: 50 }).notNull(),
    classification: mysqlEnum("classification", [
      "blocker",
      "alert",
      "recommendation",
    ]).notNull(),
    entityType: varchar("entityType", { length: 50 }).notNull(),
    entityRef: varchar("entityRef", { length: 180 }),
    sourceJson: text("sourceJson").notNull(),
    originalValueJson: text("originalValueJson"),
    proposedValueJson: text("proposedValueJson"),
    description: text("description").notNull(),
    impact: text("impact"),
    confidence: mysqlEnum("confidence", ["high", "medium", "low"])
      .default("medium")
      .notNull(),
    status: mysqlEnum("status", [
      "open",
      "confirmed",
      "rejected",
      "resolved",
      "obsolete",
    ])
      .default("open")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("agent_findings_project_idx").on(table.projectId),
    index("agent_findings_project_status_idx").on(
      table.projectId,
      table.status
    ),
  ]
);

export const agentMemories = mysqlTable(
  "agent_memories",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").references(() => projects.id),
    ownerUserId: int("ownerUserId")
      .notNull()
      .references(() => users.id),
    scope: mysqlEnum("scope", ["project", "client", "library"]).notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    memoryKey: varchar("memoryKey", { length: 180 }).notNull(),
    valueJson: text("valueJson").notNull(),
    sourceType: varchar("sourceType", { length: 80 }).notNull(),
    sourceRef: varchar("sourceRef", { length: 180 }),
    confidence: mysqlEnum("confidence", ["high", "medium", "low"])
      .default("medium")
      .notNull(),
    status: mysqlEnum("status", [
      "proposed",
      "approved",
      "rejected",
      "obsolete",
    ])
      .default("proposed")
      .notNull(),
    approvedBy: int("approvedBy").references(() => users.id),
    approvedAt: timestamp("approvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("agent_memories_project_idx").on(table.projectId),
    index("agent_memories_owner_scope_idx").on(table.ownerUserId, table.scope),
    index("agent_memories_status_idx").on(table.status),
  ]
);

export const agentRuns = mysqlTable(
  "agent_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: varchar("requestId", { length: 128 }).notNull().unique(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", [
      "executando",
      "respondido",
      "falhou",
      "timeout",
      "aguardando_confirmacao",
      "dados_incompletos",
    ])
      .default("executando")
      .notNull(),
    currentStep: varchar("currentStep", { length: 120 }),
    provider: varchar("provider", { length: 80 }),
    model: varchar("model", { length: 160 }),
    contextJson: text("contextJson").notNull(),
    resultJson: text("resultJson"),
    errorCode: varchar("errorCode", { length: 100 }),
    errorMessage: text("errorMessage"),
    iterations: int("iterations").default(0).notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("agent_runs_project_idx").on(table.projectId),
    index("agent_runs_user_idx").on(table.userId),
    index("agent_runs_status_idx").on(table.status),
  ]
);

export const agentRunEvents = mysqlTable(
  "agent_run_events",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: varchar("requestId", { length: 128 }).notNull(),
    projectId: int("projectId")
      .notNull()
      .references(() => projects.id),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    eventJson: text("eventJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("agent_run_events_request_idx").on(table.requestId),
    index("agent_run_events_project_idx").on(table.projectId),
    index("agent_run_events_user_idx").on(table.userId),
  ]
);

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
export type McpHomologationRun = typeof mcpHomologationRuns.$inferSelect;
export type InsertMcpHomologationRun = typeof mcpHomologationRuns.$inferInsert;
export type ScheduleActivity = typeof scheduleActivities.$inferSelect;
export type WbsNode = typeof wbsNodes.$inferSelect;
export type ScheduleDependency = typeof scheduleDependencies.$inferSelect;
export type ProductionFront = typeof productionFronts.$inferSelect;
export type ProductionTeam = typeof productionTeams.$inferSelect;
export type ProductionUnit = typeof productionUnits.$inferSelect;
export type ProductionEntry = typeof productionEntries.$inferSelect;
export type LlmProviderSettings = typeof llmProviderSettings.$inferSelect;
export type AgentProjectState = typeof agentProjectStates.$inferSelect;
export type InsertAgentProjectState = typeof agentProjectStates.$inferInsert;
export type AgentDecision = typeof agentDecisions.$inferSelect;
export type InsertAgentDecision = typeof agentDecisions.$inferInsert;
export type AgentFinding = typeof agentFindings.$inferSelect;
export type InsertAgentFinding = typeof agentFindings.$inferInsert;
export type AgentMemory = typeof agentMemories.$inferSelect;
export type InsertAgentMemory = typeof agentMemories.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type InsertAgentRunEvent = typeof agentRunEvents.$inferInsert;
