import {
  foreignKey,
  boolean,
  customType,
  integer,
  pgEnum,
  pgTable,
  AnyPgColumn,
  numeric,
  index,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* ------------------------------------------------------------------ enums */

/*
 * No PostgreSQL um enum e um TIPO nomeado que vive no schema. Por isso cada
 * coluna abaixo e a segunda chamada a um tipo declarado aqui em cima: a
 * primeira cria o tipo, a segunda cria a coluna. O nome do tipo e global, entao
 * ele carrega o nome da tabela — sem isso, os 14 campos `status` das 14
 * tabelas seriam 14 tipos de mesmo nome, e o banco recusaria o segundo.
 *
 * Os valores sao os mesmos do MySQL, caractere a caractere, com os acentos. Um
 * enum e contrato de dado, nao rotulo de tela.
 */

/** `users_role` — o enum de `users.role`. */
const enumUsersRole = pgEnum("users_role", ["user", "admin"]);

/** `projects_status` — o enum de `projects.status`. */
const enumProjectsStatus = pgEnum("projects_status", ["Em execução",
    "Planejamento",
    "Concluída",
    "Em risco",]);

/** `projects_baseReferencia` — o enum de `projects.baseReferencia`. */
const enumProjectsBaseReferencia = pgEnum("projects_baseReferencia", ["SEINFRA", "SINAPI", "PROPRIA"]);

/** `project_mcp_integrations_provider` — o enum de `project_mcp_integrations.provider`. */
const enumProjectMcpIntegrationsProvider = pgEnum("project_mcp_integrations_provider", ["eap",
      "cronograma",
      "ganttLob",]);

/** `project_mcp_integrations_syncState` — o enum de `project_mcp_integrations.syncState`. */
const enumProjectMcpIntegrationsSyncState = pgEnum("project_mcp_integrations_syncState", ["unconfigured",
      "ready",
      "pending",
      "error",]);

/** `agent_decisions_decision` — o enum de `agent_decisions.decision`. */
const enumAgentDecisionsDecision = pgEnum("agent_decisions_decision", ["approved",
      "partially_approved",
      "rejected",
      "reopen",]);

/** `project_plan_versions_status` — o enum de `project_plan_versions.status`. */
const enumProjectPlanVersionsStatus = pgEnum("project_plan_versions_status", ["draft", "proposed", "approved", "superseded"]);

/** `mcp_mutation_operations_provider` — o enum de `mcp_mutation_operations.provider`. */
const enumMcpMutationOperationsProvider = pgEnum("mcp_mutation_operations_provider", ["eap",
      "cronograma",
      "ganttLob",]);

/** `mcp_mutation_operations_status` — o enum de `mcp_mutation_operations.status`. */
const enumMcpMutationOperationsStatus = pgEnum("mcp_mutation_operations_status", ["preview",
      "confirmed",
      "executing",
      "succeeded",
      "failed",
      "cancelled",]);

/** `mcp_homologation_runs_status` — o enum de `mcp_homologation_runs.status`. */
const enumMcpHomologationRunsStatus = pgEnum("mcp_homologation_runs_status", ["planned",
      "read_only_running",
      "read_only_passed",
      "read_only_degraded",
      "reconciled",
      "failed",]);

/** `schedule_activities_status` — o enum de `schedule_activities.status`. */
const enumScheduleActivitiesStatus = pgEnum("schedule_activities_status", ["Não iniciado",
      "Em andamento",
      "Concluído",
      "Em risco",]);

/** `wbs_nodes_nodeType` — o enum de `wbs_nodes.nodeType`. */
const enumWbsNodesNodeType = pgEnum("wbs_nodes_nodeType", ["grupo", "pacote", "entrega"]);

/** `schedule_dependencies_type` — o enum de `schedule_dependencies.type`. */
const enumScheduleDependenciesType = pgEnum("schedule_dependencies_type", ["FS", "SS", "FF", "SF"]);

/** `planning_resources_resourceType` — o enum de `planning_resources.resourceType`. */
const enumPlanningResourcesResourceType = pgEnum("planning_resources_resourceType", ["mao_de_obra", "equipamento", "material"]);

/** `schedule_baselines_status` — o enum de `schedule_baselines.status`. */
const enumScheduleBaselinesStatus = pgEnum("schedule_baselines_status", ["rascunho", "ativa", "arquivada"]);

/** `production_fronts_status` — o enum de `production_fronts.status`. */
const enumProductionFrontsStatus = pgEnum("production_fronts_status", ["ativa", "pausada", "concluida"]);

/** `production_entries_status` — o enum de `production_entries.status`. */
const enumProductionEntriesStatus = pgEnum("production_entries_status", ["rascunho", "confirmada"]);

/** `budget_versions_status` — o enum de `budget_versions.status`. */
const enumBudgetVersionsStatus = pgEnum("budget_versions_status", ["rascunho", "em_revisao", "aprovado", "arquivado"]);

/** `price_catalogs_sourceType` — o enum de `price_catalogs.sourceType`. */
const enumPriceCatalogsSourceType = pgEnum("price_catalogs_sourceType", ["propria", "SINAPI", "SEINFRA", "fornecedor"]);

/** `price_catalogs_status` — o enum de `price_catalogs.status`. */
const enumPriceCatalogsStatus = pgEnum("price_catalogs_status", ["ativo", "arquivado"]);

/** `price_items_itemType` — o enum de `price_items.itemType`. */
const enumPriceItemsItemType = pgEnum("price_items_itemType", ["material", "mao_de_obra", "equipamento", "servico"]);

/** `service_compositions_status` — o enum de `service_compositions.status`. */
const enumServiceCompositionsStatus = pgEnum("service_compositions_status", ["rascunho", "validada", "arquivada"]);

/** `composition_components_componentType` — o enum de `composition_components.componentType`. */
const enumCompositionComponentsComponentType = pgEnum("composition_components_componentType", ["material", "mao_de_obra", "equipamento"]);

/** `agent_project_states_stage` — o enum de `agent_project_states.stage`. */
const enumAgentProjectStatesStage = pgEnum("agent_project_states_stage", ["DESCRITIVO",
      "EAP_PROPOSTA",
      "EAP_REVISAO",
      "ATIVIDADES_PROPOSTA",
      "DEPENDENCIAS_PROPOSTA",
      "CPM_VALIDADO",
      "CRONOGRAMA_PROPOSTO",
      "BASELINE_PROPOSTA",
      "GANTT_LOB_PROPOSTO",
      "CONTROLE",]);

/** `agent_findings_classification` — o enum de `agent_findings.classification`. */
const enumAgentFindingsClassification = pgEnum("agent_findings_classification", ["blocker",
      "alert",
      "recommendation",]);

/** `agent_findings_confidence` — o enum de `agent_findings.confidence`. */
const enumAgentFindingsConfidence = pgEnum("agent_findings_confidence", ["high", "medium", "low"]);

/** `agent_findings_status` — o enum de `agent_findings.status`. */
const enumAgentFindingsStatus = pgEnum("agent_findings_status", ["open",
      "confirmed",
      "rejected",
      "resolved",
      "obsolete",]);

/** `agent_memories_scope` — o enum de `agent_memories.scope`. */
const enumAgentMemoriesScope = pgEnum("agent_memories_scope", ["project", "client", "library"]);

/** `agent_memories_confidence` — o enum de `agent_memories.confidence`. */
const enumAgentMemoriesConfidence = pgEnum("agent_memories_confidence", ["high", "medium", "low"]);

/** `agent_memories_status` — o enum de `agent_memories.status`. */
const enumAgentMemoriesStatus = pgEnum("agent_memories_status", ["proposed",
      "approved",
      "rejected",
      "obsolete",]);

/** `agent_runs_status` — o enum de `agent_runs.status`. */
const enumAgentRunsStatus = pgEnum("agent_runs_status", ["executando",
      "respondido",
      "falhou",
      "timeout",
      "aguardando_confirmacao",
      "dados_incompletos",]);

/** `calendar_exceptions_type` — o enum de `calendar_exceptions.type`. */
const enumCalendarExceptionsType = pgEnum("calendar_exceptions_type", ["working",
      "national_holiday",
      "facultative",
      "observance",]);

export const users = pgTable("users", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: enumUsersRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  ownerUserId: integer("ownerUserId").references(() => users.id),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  location: varchar("location", { length: 180 }).notNull(),
  status: enumProjectsStatus("status")
    .default("Planejamento")
    .notNull(),
  progress: integer("progress").default(0).notNull(),
  // Descrição livre da obra. É o insumo para a IA conversar sobre o que está
  // sendo construído; a EAP em si vem do catálogo de preços, não daqui.
  descricao: text("descricao"),
  plannedStart: timestamp("plannedStart", { withTimezone: true }).notNull(),
  plannedFinish: timestamp("plannedFinish", { withTimezone: true }).notNull(),
  baseReferencia: enumProjectsBaseReferencia("baseReferencia"),
  baseReferenciaRef: varchar("baseReferenciaRef", { length: 20 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const projectDocuments = pgTable(
  "project_documents",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
    ownerUserId: integer("ownerUserId").references(() => users.id),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    content: bytea("content").notNull(),
    extractedText: text("extractedText"),
    analysisStatus: varchar("analysisStatus", { length: 32 }).default("pending").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("project_documents_project_idx").on(table.projectId),
    index("project_documents_project_status_idx").on(table.projectId, table.analysisStatus),
  ]
);

export const projectMcpIntegrations = pgTable(
  "project_mcp_integrations",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    provider: enumProjectMcpIntegrationsProvider("provider").notNull(),
    externalProjectId: varchar("externalProjectId", { length: 180 }),
    endpointUrl: varchar("endpointUrl", { length: 500 }).notNull(),
    syncState: enumProjectMcpIntegrationsSyncState("syncState")
      .default("unconfigured")
      .notNull(),
    lastSyncedAt: timestamp("lastSyncedAt", { withTimezone: true }),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("project_mcp_integrations_project_provider_idx").on(
      table.projectId,
      table.provider
    ),
    index("project_mcp_integrations_project_idx").on(table.projectId),
  ]
);

export const agentDecisions = pgTable(
  "agent_decisions",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    stage: varchar("stage", { length: 50 }).notNull(),
    decision: enumAgentDecisionsDecision("decision").notNull(),
    scopeJson: text("scopeJson").notNull(),
    reason: text("reason"),
    impactJson: text("impactJson"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("agent_decisions_project_idx").on(table.projectId),
    index("agent_decisions_project_stage_idx").on(
      table.projectId,
      table.stage
    ),
  ]
);

export const projectPlanVersions = pgTable(
  "project_plan_versions",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    versionNumber: integer("versionNumber").notNull(),
    status: enumProjectPlanVersionsStatus("status")
      .default("draft")
      .notNull(),
    baseVersionId: integer("baseVersionId").references(
      (): AnyPgColumn => projectPlanVersions.id
    ),
    decisionId: integer("decisionId").references(() => agentDecisions.id),
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    notes: text("notes"),
    createdBy: integer("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("project_plan_versions_project_version_idx").on(
      table.projectId,
      table.versionNumber
    ),
    index("project_plan_versions_project_idx").on(table.projectId),
  ]
);

export const mcpMutationOperations = pgTable(
  "mcp_mutation_operations",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    provider: enumMcpMutationOperationsProvider("provider").notNull(),
    toolName: varchar("toolName", { length: 100 }).notNull(),
    externalProjectId: varchar("externalProjectId", { length: 180 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    confirmationToken: varchar("confirmationToken", { length: 64 }).notNull(),
    argsJson: text("argsJson").notNull(),
    resultJson: text("resultJson"),
    error: text("error"),
    status: enumMcpMutationOperationsStatus("status")
      .default("preview")
      .notNull(),
    confirmedAt: timestamp("confirmedAt", { withTimezone: true }),
    executedAt: timestamp("executedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("mcp_mutation_operations_idempotency_idx").on(
      table.idempotencyKey
    ),
    index("mcp_mutation_operations_project_idx").on(table.projectId),
    index("mcp_mutation_operations_user_idx").on(table.userId),
  ]
);

export const mcpHomologationRuns = pgTable(
  "mcp_homologation_runs",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    requestId: varchar("requestId", { length: 128 }).notNull(),
    status: enumMcpHomologationRunsStatus("status")
      .default("planned")
      .notNull(),
    planJson: text("planJson").notNull(),
    readOnlyResultJson: text("readOnlyResultJson"),
    reconciliationJson: text("reconciliationJson"),
    error: text("error"),
    startedAt: timestamp("startedAt", { withTimezone: true }),
    finishedAt: timestamp("finishedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("mcp_homologation_runs_project_idx").on(table.projectId),
    index("mcp_homologation_runs_user_idx").on(table.userId),
  ]
);

export const scheduleActivities = pgTable(
  "schedule_activities",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    wbsNodeId: integer("wbsNodeId")
      .notNull()
      .references(() => wbsNodes.id, { onDelete: "restrict" }),
    externalId: varchar("externalId", { length: 180 }),
    eapRef: varchar("eapRef", { length: 180 }),
    wbsCode: varchar("wbsCode", { length: 32 }).notNull(),
    name: varchar("name", { length: 220 }).notNull(),
    phase: varchar("phase", { length: 80 }).notNull(),
    /**
     * Onde a atividade acontece dentro da frente: pavimento, bloco, setor,
     * trecho. É a dimensão de LOCAL, e é ela que permite repetir o mesmo
     * serviço em andares diferentes como linhas distintas do cronograma. Sem
     * ela, "concreto do pavimento 3" e "concreto do pavimento 4" são a mesma
     * linha, e a Linha de Balanço perde a repetição que existe em obra de
     * vários pavimentos.
     */
    pavimento: varchar("pavimento", { length: 80 }),
    startOffset: integer("startOffset").notNull(),
    durationDays: integer("durationDays").notNull(),
    plannedQuantity: numeric("plannedQuantity", { precision: 14, scale: 3 }),
    /**
     * Unidade de medida do quantitativo, herdada da folha da EAP. Fica na
     * atividade porque é ela que o % Real divide: "128 /dia" não significa
     * nada sem saber se a unidade é m3, m2 ou un.
     */
    unit: varchar("unit", { length: 16 }),
    productivity: numeric("productivity", { precision: 14, scale: 3 }),
    budgetItemId: integer("budgetItemId"),
    progress: integer("progress").default(0).notNull(),
    /**
     * Marcado como dado de EXEMPLO, não medido.
     *
     * Serve para avaliar a forma do sistema — ver o painel ponderado, a curva,
     * o status colorido — sem confundir número de tela com quantitativo real.
     * A carga de exemplo só escreve onde esta marca está zerada, e a limpeza
     * apaga exatamente o que tem marca, o que torna as duas operações
     * reversíveis e idempotentes.
     */
    exemplo: integer("exemplo").default(0).notNull(),
    status: enumScheduleActivitiesStatus("status")
      .default("Não iniciado")
      .notNull(),
    critical: integer("critical").default(0).notNull(),
    earlyStart: integer("earlyStart"),
    earlyFinish: integer("earlyFinish"),
    lateStart: integer("lateStart"),
    lateFinish: integer("lateFinish"),
    totalFloat: integer("totalFloat"),
    freeFloat: integer("freeFloat"),
    mustStartOn: timestamp("mustStartOn", { withTimezone: true }),
    finishNoLaterThan: timestamp("finishNoLaterThan", { withTimezone: true }),
    cpmCalculatedAt: timestamp("cpmCalculatedAt", { withTimezone: true }),
    versionId: integer("versionId").references(() => projectPlanVersions.id),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("schedule_activities_project_external_idx").on(
      table.projectId,
      table.externalId
    ),
    index("schedule_activities_project_idx").on(table.projectId),
    index("schedule_activities_plan_version_idx").on(table.versionId),
    index("schedule_activities_wbs_node_idx").on(table.wbsNodeId),
  ]
);

export const wbsNodes = pgTable(
  "wbs_nodes",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    externalId: varchar("externalId", { length: 180 }),
    externalUid: varchar("externalUid", { length: 180 }),
    parentId: integer("parentId").references((): AnyPgColumn => wbsNodes.id, {
      onDelete: "restrict",
    }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 220 }).notNull(),
    description: text("description"),
    inclusions: text("inclusions"),
    exclusions: text("exclusions"),
    location: varchar("location", { length: 180 }),
    responsible: varchar("responsible", { length: 180 }),
    acceptanceCriteria: text("acceptanceCriteria"),
    decompositionBasis: varchar("decompositionBasis", { length: 32 }),
    scopeStatus: varchar("scopeStatus", { length: 24 }).default("rascunho").notNull(),
    level: integer("level").default(1).notNull(),
    nodeType: enumWbsNodesNodeType("nodeType")
      .default("pacote")
      .notNull(),
    unit: varchar("unit", { length: 32 }),
    plannedQuantity: numeric("plannedQuantity", { precision: 14, scale: 3 }),
    versionId: integer("versionId").references(() => projectPlanVersions.id),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
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
    index("wbs_nodes_plan_version_idx").on(table.versionId),
  ]
);

export const scheduleDependencies = pgTable(
  "schedule_dependencies",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    externalId: varchar("externalId", { length: 180 }),
    predecessorId: integer("predecessorId")
      .notNull()
      .references(() => scheduleActivities.id),
    successorId: integer("successorId")
      .notNull()
      .references(() => scheduleActivities.id),
    type: enumScheduleDependenciesType("type").default("FS").notNull(),
    lag: integer("lag").default(0).notNull(),
    versionId: integer("versionId").references(() => projectPlanVersions.id),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("schedule_dependencies_project_external_idx").on(
      table.projectId,
      table.externalId
    ),
    index("schedule_dependencies_plan_version_idx").on(table.versionId),
  ]
);

export const planningResources = pgTable("planning_resources", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 180 }).notNull(),
  resourceType: enumPlanningResourcesResourceType("resourceType").notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  capacityPerDay: numeric("capacityPerDay", { precision: 14, scale: 3 }),
  costPerDay: numeric("costPerDay", { precision: 14, scale: 2 }),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const activityResourceAllocations = pgTable(
  "activity_resource_allocations",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    activityId: integer("activityId").notNull(),
    resourceId: integer("resourceId").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).default("1").notNull(),
    productivity: numeric("productivity", { precision: 14, scale: 3 }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    // Nome explícito: o automático passa de 64 caracteres, e tanto o MySQL
    // quanto o PostgreSQL recusam um identificador longo. O limite é do SQL
    // padronizado, não do motor.
    foreignKey({ name: "act_res_alloc_activity_fk", columns: [table.activityId], foreignColumns: [scheduleActivities.id] }),
    foreignKey({ name: "act_res_alloc_resource_fk", columns: [table.resourceId], foreignColumns: [planningResources.id] }),
    uniqueIndex("activity_resource_unique_idx").on(table.activityId, table.resourceId),
    index("activity_resource_activity_idx").on(table.activityId),
  ]
);

export const scheduleBaselines = pgTable("schedule_baselines", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  projectId: integer("projectId").notNull().references(() => projects.id),
  name: varchar("name", { length: 160 }).notNull(),
  status: enumScheduleBaselinesStatus("status").default("ativa").notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const scheduleBaselineItems = pgTable(
  "schedule_baseline_items",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    baselineId: integer("baselineId").notNull().references(() => scheduleBaselines.id),
    activityId: integer("activityId").notNull().references(() => scheduleActivities.id),
    startOffset: integer("startOffset").notNull(),
    durationDays: integer("durationDays").notNull(),
    earlyStart: integer("earlyStart"),
    earlyFinish: integer("earlyFinish"),
  },
  table => [
    uniqueIndex("schedule_baseline_activity_idx").on(table.baselineId, table.activityId),
    index("schedule_baseline_items_baseline_idx").on(table.baselineId),
  ]
);

export const productionFronts = pgTable("production_fronts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  projectId: integer("projectId")
    .notNull()
    .references(() => projects.id),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  location: varchar("location", { length: 180 }),
  status: enumProductionFrontsStatus("status")
    .default("ativa")
    .notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const productionTeams = pgTable("production_teams", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  projectId: integer("projectId")
    .notNull()
    .references(() => projects.id),
  name: varchar("name", { length: 180 }).notNull(),
  trade: varchar("trade", { length: 120 }).notNull(),
  memberCount: integer("memberCount").default(0).notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const productionUnits = pgTable("production_units", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  projectId: integer("projectId")
    .notNull()
    .references(() => projects.id),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  unitType: varchar("unitType", { length: 80 }).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const productionEntries = pgTable("production_entries", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  projectId: integer("projectId")
    .notNull()
    .references(() => projects.id),
  /**
   * Frente, equipe e unidade de produção, todas OPCIONAIS.
   *
   * Apontavam para `production_fronts`, `production_teams` e
   * `production_units`, e eram NOT NULL. Essas três tabelas são o organograma
   * de campo — frente de serviço, equipe nominal, unidade de produção — e
   * nenhuma obra gerada a partir do catálogo as tem: o catálogo gera EAP e
   * preço, não gente.
   *
   * O efeito era um sistema em que a obra não conseguia registrar produção. O
   * `% Real` da aba CRONOGRAMA é a soma de `production_entries` dividida pela
   * quantidade planejada, e sem lançamento o avanço real era zero por
   * construção — sem erro, sem aviso, só a coluna em 0%.
   *
   * A frente não se perde: ela é `schedule_activities.phase`, a coluna que a
   * grade do cronograma já mostra e que agrupa por etapa. Criar uma segunda
   * dimensão de frente seria duplicar o mesmo dado com dois nomes.
   *
   * Equipe e unidade continuam aqui, opcionais, para quando a Linha de Balanço
   * precisar balancear ritmo entre equipes.
   */
  frontId: integer("frontId").references(() => productionFronts.id),
  teamId: integer("teamId").references(() => productionTeams.id),
  unitId: integer("unitId").references(() => productionUnits.id),
  activityId: integer("activityId")
    .notNull()
    .references(() => scheduleActivities.id),
  productionDate: timestamp("productionDate", { withTimezone: true }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  measurementUnit: varchar("measurementUnit", { length: 32 }).notNull(),
  notes: text("notes"),
  status: enumProductionEntriesStatus("status")
    .default("rascunho")
    .notNull(),
  /**
   * Marcado como dado de EXEMPLO, não medido. Ver `schedule_activities.exemplo`.
   */
  exemplo: integer("exemplo").default(0).notNull(),
  createdBy: integer("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const budgetVersions = pgTable(
  "budget_versions",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 160 }).notNull(),
    versionNumber: integer("versionNumber").notNull(),
    status: enumBudgetVersionsStatus("status")
      .default("rascunho")
      .notNull(),
    currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
    notes: text("notes"),
    createdBy: integer("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("budget_versions_project_version_idx").on(
      table.projectId,
      table.versionNumber
    ),
    index("budget_versions_project_idx").on(table.projectId),
  ]
);

export const budgetItems = pgTable(
  "budget_items",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    budgetVersionId: integer("budgetVersionId")
      .notNull()
      .references(() => budgetVersions.id),
    wbsNodeId: integer("wbsNodeId").references(() => wbsNodes.id),
    code: varchar("code", { length: 48 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unitPrice", { precision: 14, scale: 2 }).notNull(),
    compositionId: integer("compositionId"),
    compositionUnitCost: numeric("compositionUnitCost", { precision: 14, scale: 2 }),
    productivity: numeric("productivity", { precision: 14, scale: 3 }),
    plannedDurationDays: integer("plannedDurationDays"),
    source: varchar("source", { length: 80 }),
    referencePeriod: varchar("referencePeriod", { length: 20 }),
    compositionNote: text("compositionNote"),
    isPriceException: boolean("isPriceException").default(false).notNull(),
    sortOrder: integer("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("budget_items_version_code_idx").on(
      table.budgetVersionId,
      table.code
    ),
    index("budget_items_version_idx").on(table.budgetVersionId),
  ]
);

export const priceCatalogs = pgTable(
  "price_catalogs",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    sourceType: enumPriceCatalogsSourceType("sourceType")
      .notNull(),
    state: varchar("state", { length: 2 }),
    referencePeriod: varchar("referencePeriod", { length: 20 }).notNull(),
    status: enumPriceCatalogsStatus("status").default("ativo").notNull(),
    notes: text("notes"),
    createdBy: integer("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("price_catalogs_reference_idx").on(table.referencePeriod)]
);

export const priceItems = pgTable(
  "price_items",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    catalogId: integer("catalogId")
      .notNull()
      .references(() => priceCatalogs.id),
    code: varchar("code", { length: 64 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    itemType: enumPriceItemsItemType("itemType")
      .notNull(),
    unitPrice: numeric("unitPrice", { precision: 14, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("price_items_catalog_code_idx").on(table.catalogId, table.code),
    index("price_items_catalog_idx").on(table.catalogId),
  ]
);

export const serviceCompositions = pgTable(
  "service_compositions",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    sourceCatalogId: integer("sourceCatalogId").references(() => priceCatalogs.id),
    referencePeriod: varchar("referencePeriod", { length: 20 }),
    status: enumServiceCompositionsStatus("status")
      .default("rascunho")
      .notNull(),
    createdBy: integer("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("service_compositions_code_idx").on(table.code),
    index("service_compositions_source_idx").on(table.sourceCatalogId),
  ]
);

export const compositionComponents = pgTable(
  "composition_components",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    compositionId: integer("compositionId")
      .notNull()
      .references(() => serviceCompositions.id),
    priceItemId: integer("priceItemId")
      .notNull()
      .references(() => priceItems.id),
    componentType: enumCompositionComponentsComponentType("componentType")
      .notNull(),
    coefficient: numeric("coefficient", { precision: 14, scale: 6 }).notNull(),
    unitPriceSnapshot: numeric("unitPriceSnapshot", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("composition_components_unique_idx").on(
      table.compositionId,
      table.priceItemId
    ),
    index("composition_components_composition_idx").on(table.compositionId),
  ]
);

export const llmProviderSettings = pgTable("llm_provider_settings", {
  id: integer("id").primaryKey(),
  encryptedConfig: text("encryptedConfig").notNull(),
  updatedBy: integer("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const agentProjectStates = pgTable(
  "agent_project_states",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    stage: enumAgentProjectStatesStage("stage")
      .default("DESCRITIVO")
      .notNull(),
    activeSection: varchar("activeSection", { length: 40 })
      .default("portfolio")
      .notNull(),
    activeSubtab: varchar("activeSubtab", { length: 40 }),
    blockerCount: integer("blockerCount").default(0).notNull(),
    lastSummary: text("lastSummary"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("agent_project_states_project_idx").on(table.projectId),
    index("agent_project_states_stage_idx").on(table.stage),
  ]
);

export const agentFindings = pgTable(
  "agent_findings",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    stage: varchar("stage", { length: 50 }).notNull(),
    classification: enumAgentFindingsClassification("classification").notNull(),
    entityType: varchar("entityType", { length: 50 }).notNull(),
    entityRef: varchar("entityRef", { length: 180 }),
    sourceJson: text("sourceJson").notNull(),
    originalValueJson: text("originalValueJson"),
    proposedValueJson: text("proposedValueJson"),
    description: text("description").notNull(),
    impact: text("impact"),
    confidence: enumAgentFindingsConfidence("confidence")
      .default("medium")
      .notNull(),
    status: enumAgentFindingsStatus("status")
      .default("open")
      .notNull(),
    resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
    resolvedBy: integer("resolvedBy").references(() => users.id),
    resolutionNote: text("resolutionNote"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("agent_findings_project_idx").on(table.projectId),
    index("agent_findings_project_status_idx").on(
      table.projectId,
      table.status
    ),
  ]
);

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId").references(() => projects.id),
    ownerUserId: integer("ownerUserId")
      .notNull()
      .references(() => users.id),
    scope: enumAgentMemoriesScope("scope").notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    memoryKey: varchar("memoryKey", { length: 180 }).notNull(),
    valueJson: text("valueJson").notNull(),
    sourceType: varchar("sourceType", { length: 80 }).notNull(),
    sourceRef: varchar("sourceRef", { length: 180 }),
    confidence: enumAgentMemoriesConfidence("confidence")
      .default("medium")
      .notNull(),
    status: enumAgentMemoriesStatus("status")
      .default("proposed")
      .notNull(),
    approvedBy: integer("approvedBy").references(() => users.id),
    approvedAt: timestamp("approvedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("agent_memories_project_idx").on(table.projectId),
    index("agent_memories_owner_scope_idx").on(table.ownerUserId, table.scope),
    index("agent_memories_status_idx").on(table.status),
  ]
);

export const arquimedesCapabilities = pgTable(
  "arquimedes_capabilities",
  {
    id: varchar("id", { length: 120 }).primaryKey(),
    kind: varchar("kind", { length: 32 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    version: varchar("version", { length: 40 }).notNull(),
    domain: varchar("domain", { length: 120 }).notNull(),
    description: text("description").notNull(),
    status: varchar("status", { length: 24 }).default("available").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    removable: boolean("removable").default(true).notNull(),
    dependenciesJson: text("dependenciesJson").notNull().default("[]"),
    installedBy: integer("installedBy").references(() => users.id),
    installedAt: timestamp("installedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("arquimedes_capabilities_status_idx").on(table.status),
    index("arquimedes_capabilities_kind_idx").on(table.kind),
  ]
);

export const arquimedesCapabilityEvents = pgTable(
  "arquimedes_capability_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    capabilityId: varchar("capabilityId", { length: 120 })
      .notNull()
      .references(() => arquimedesCapabilities.id, { onDelete: "cascade" }),
    userId: integer("userId").references(() => users.id),
    action: varchar("action", { length: 40 }).notNull(),
    fromStatus: varchar("fromStatus", { length: 40 }),
    toStatus: varchar("toStatus", { length: 40 }),
    detail: text("detail"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("arquimedes_capability_events_capability_idx").on(table.capabilityId, table.createdAt),
    index("arquimedes_capability_events_user_idx").on(table.userId, table.createdAt),
  ]
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    requestId: varchar("requestId", { length: 128 }).notNull().unique(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    status: enumAgentRunsStatus("status")
      .default("executando")
      .notNull(),
    currentStep: varchar("currentStep", { length: 120 }),
    provider: varchar("provider", { length: 80 }),
    model: varchar("model", { length: 160 }),
    contextJson: text("contextJson").notNull(),
    resultJson: text("resultJson"),
    errorCode: varchar("errorCode", { length: 100 }),
    errorMessage: text("errorMessage"),
    iterations: integer("iterations").default(0).notNull(),
    startedAt: timestamp("startedAt", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finishedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("agent_runs_project_idx").on(table.projectId),
    index("agent_runs_user_idx").on(table.userId),
    index("agent_runs_status_idx").on(table.status),
  ]
);

export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    requestId: varchar("requestId", { length: 128 }).notNull(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    userId: integer("userId")
      .notNull()
      .references(() => users.id),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    eventJson: text("eventJson").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("agent_run_events_request_idx").on(table.requestId),
    index("agent_run_events_project_idx").on(table.projectId),
    index("agent_run_events_user_idx").on(table.userId),
  ]
);

export const projectAuditEvents = pgTable(
  "project_audit_events",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    userId: integer("userId").references(() => users.id),
    action: varchar("action", { length: 64 }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("project_audit_events_project_idx").on(table.projectId, table.action),
  ]
);

export const workCalendars = pgTable(
  "work_calendars",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    projectId: integer("projectId")
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 180 }).notNull(),
    weekPattern: jsonb("weekPattern").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("work_calendars_projectId_idx").on(table.projectId),
    uniqueIndex("work_calendars_projectId_unique").on(table.projectId),
  ]
);

export const calendarExceptions = pgTable(
  "calendar_exceptions",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    calendarId: integer("calendarId")
      .notNull()
      .references(() => workCalendars.id),
    date: varchar("date", { length: 10 }).notNull(),
    type: enumCalendarExceptionsType("type").notNull(),
    name: varchar("name", { length: 180 }),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("calendar_exceptions_calendarId_idx").on(table.calendarId),
    index("calendar_exceptions_date_idx").on(table.date),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = typeof projectDocuments.$inferInsert;
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
export type ArquimedesCapability = typeof arquimedesCapabilities.$inferSelect;
export type ArquimedesCapabilityEvent = typeof arquimedesCapabilityEvents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type InsertAgentRunEvent = typeof agentRunEvents.$inferInsert;
export type WorkCalendar = typeof workCalendars.$inferSelect;
export type InsertWorkCalendar = typeof workCalendars.$inferInsert;
export type CalendarException = typeof calendarExceptions.$inferSelect;
export type InsertCalendarException = typeof calendarExceptions.$inferInsert;
