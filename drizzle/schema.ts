// PostgreSQL schema generated from the live Supabase schema.
// Source: Supabase project tromrvfijbtihuilvnuk, 2026-10-05.
// This is the runtime Drizzle model; existing DB constraints remain owned by PostgreSQL.
import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, bytea, date, integer, jsonb, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const activityResourceAllocations = pgTable("activity_resource_allocations", {
  "id": serial("id").notNull(),
  "activityId": integer("activityId").notNull(),
  "resourceId": integer("resourceId").notNull(),
  "quantity": numeric("quantity", { precision: 14, scale: 3, mode: "number" }).default("1").notNull(),
  "productivity": numeric("productivity", { precision: 14, scale: 3, mode: "number" }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const agentDecisions = pgTable("agent_decisions", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "userId": integer("userId").notNull(),
  "stage": varchar("stage", { length: 50 }).notNull(),
  "decision": text("decision").notNull(),
  "scopeJson": text("scopeJson").notNull(),
  "reason": text("reason"),
  "impactJson": text("impactJson"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const agentFindings = pgTable("agent_findings", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "stage": varchar("stage", { length: 50 }).notNull(),
  "classification": text("classification").notNull(),
  "entityType": varchar("entityType", { length: 50 }).notNull(),
  "entityRef": varchar("entityRef", { length: 180 }),
  "sourceJson": text("sourceJson").notNull(),
  "originalValueJson": text("originalValueJson"),
  "proposedValueJson": text("proposedValueJson"),
  "description": text("description").notNull(),
  "impact": text("impact"),
  "confidence": text("confidence").default("medium").notNull(),
  "status": text("status").default("open").notNull(),
  "resolvedAt": timestamp("resolvedAt", { withTimezone: true, mode: "date" }),
  "resolvedBy": integer("resolvedBy"),
  "resolutionNote": text("resolutionNote"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const agentMemories = pgTable("agent_memories", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId"),
  "ownerUserId": integer("ownerUserId").notNull(),
  "scope": text("scope").notNull(),
  "category": varchar("category", { length: 80 }).notNull(),
  "memoryKey": varchar("memoryKey", { length: 180 }).notNull(),
  "valueJson": text("valueJson").notNull(),
  "sourceType": varchar("sourceType", { length: 80 }).notNull(),
  "sourceRef": varchar("sourceRef", { length: 180 }),
  "confidence": text("confidence").default("medium").notNull(),
  "status": text("status").default("proposed").notNull(),
  "approvedBy": integer("approvedBy"),
  "approvedAt": timestamp("approvedAt", { withTimezone: true, mode: "date" }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const agentProjectStates = pgTable("agent_project_states", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "stage": text("stage").default("DESCRITIVO").notNull(),
  "activeSection": varchar("activeSection", { length: 40 }).default("portfolio").notNull(),
  "activeSubtab": varchar("activeSubtab", { length: 40 }),
  "blockerCount": integer("blockerCount").default(0).notNull(),
  "lastSummary": text("lastSummary"),
  "version": integer("version").default(1).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const agentRunEvents = pgTable("agent_run_events", {
  "id": serial("id").notNull(),
  "requestId": varchar("requestId", { length: 128 }).notNull(),
  "projectId": integer("projectId").notNull(),
  "userId": integer("userId").notNull(),
  "eventType": varchar("eventType", { length: 80 }).notNull(),
  "eventJson": text("eventJson").notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const agentRuns = pgTable("agent_runs", {
  "id": serial("id").notNull(),
  "requestId": varchar("requestId", { length: 128 }).notNull(),
  "projectId": integer("projectId").notNull(),
  "userId": integer("userId").notNull(),
  "status": text("status").default("executando").notNull(),
  "currentStep": varchar("currentStep", { length: 120 }),
  "provider": varchar("provider", { length: 80 }),
  "model": varchar("model", { length: 160 }),
  "contextJson": text("contextJson").notNull(),
  "resultJson": text("resultJson"),
  "errorCode": varchar("errorCode", { length: 100 }),
  "errorMessage": text("errorMessage"),
  "iterations": integer("iterations").default(0).notNull(),
  "startedAt": timestamp("startedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "finishedAt": timestamp("finishedAt", { withTimezone: true, mode: "date" }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const arquimedesCapabilities = pgTable("arquimedes_capabilities", {
  "id": varchar("id", { length: 120 }).notNull(),
  "kind": varchar("kind", { length: 32 }).notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "version": varchar("version", { length: 40 }).notNull(),
  "domain": varchar("domain", { length: 120 }).notNull(),
  "description": text("description").notNull(),
  "status": varchar("status", { length: 24 }).default("available").notNull(),
  "enabled": boolean("enabled").default(false).notNull(),
  "removable": boolean("removable").default(true).notNull(),
  "dependenciesJson": text("dependenciesJson").default("[]").notNull(),
  "installedBy": integer("installedBy"),
  "installedAt": timestamp("installedAt", { withTimezone: true, mode: "date" }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const arquimedesCapabilityEvents = pgTable("arquimedes_capability_events", {
  "id": serial("id").notNull(),
  "capabilityId": varchar("capabilityId", { length: 120 }).notNull(),
  "userId": integer("userId"),
  "action": varchar("action", { length: 40 }).notNull(),
  "fromStatus": varchar("fromStatus", { length: 40 }),
  "toStatus": varchar("toStatus", { length: 40 }),
  "detail": text("detail"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const budgetItems = pgTable("budget_items", {
  "id": serial("id").notNull(),
  "budgetVersionId": integer("budgetVersionId").notNull(),
  "wbsNodeId": integer("wbsNodeId"),
  "code": varchar("code", { length: 48 }).notNull(),
  "description": varchar("description", { length: 240 }).notNull(),
  "unit": varchar("unit", { length: 32 }).notNull(),
  "quantity": numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull(),
  "unitPrice": numeric("unitPrice", { precision: 14, scale: 2, mode: "number" }).notNull(),
  "compositionId": integer("compositionId"),
  "compositionUnitCost": numeric("compositionUnitCost", { precision: 14, scale: 2, mode: "number" }),
  "productivity": numeric("productivity", { precision: 14, scale: 3, mode: "number" }),
  "plannedDurationDays": integer("plannedDurationDays"),
  "source": varchar("source", { length: 80 }),
  "referencePeriod": varchar("referencePeriod", { length: 20 }),
  "compositionNote": text("compositionNote"),
  "isPriceException": boolean("isPriceException").default(false).notNull(),
  "sortOrder": integer("sortOrder").default(0).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const budgetVersions = pgTable("budget_versions", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "name": varchar("name", { length: 160 }).notNull(),
  "versionNumber": integer("versionNumber").notNull(),
  "status": text("status").default("rascunho").notNull(),
  "currency": varchar("currency", { length: 3 }).default("BRL").notNull(),
  "notes": text("notes"),
  "createdBy": integer("createdBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const calendarExceptions = pgTable("calendar_exceptions", {
  "id": serial("id").notNull(),
  "calendarId": integer("calendarId").notNull(),
  "date": varchar("date", { length: 10 }).notNull(),
  "type": text("type").notNull(),
  "name": varchar("name", { length: 180 }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const compositionComponents = pgTable("composition_components", {
  "id": serial("id").notNull(),
  "compositionId": integer("compositionId").notNull(),
  "priceItemId": integer("priceItemId").notNull(),
  "componentType": text("componentType").notNull(),
  "coefficient": numeric("coefficient", { precision: 14, scale: 6, mode: "number" }).notNull(),
  "unitPriceSnapshot": numeric("unitPriceSnapshot", { precision: 14, scale: 2, mode: "number" }).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const llmProviderSettings = pgTable("llm_provider_settings", {
  "id": integer("id").notNull(),
  "encryptedConfig": text("encryptedConfig").notNull(),
  "updatedBy": integer("updatedBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const mcpHomologationRuns = pgTable("mcp_homologation_runs", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "userId": integer("userId").notNull(),
  "requestId": varchar("requestId", { length: 128 }).notNull(),
  "status": text("status").default("planned").notNull(),
  "planJson": text("planJson").notNull(),
  "readOnlyResultJson": text("readOnlyResultJson"),
  "reconciliationJson": text("reconciliationJson"),
  "error": text("error"),
  "startedAt": timestamp("startedAt", { withTimezone: true, mode: "date" }),
  "finishedAt": timestamp("finishedAt", { withTimezone: true, mode: "date" }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const mcpMutationOperations = pgTable("mcp_mutation_operations", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "userId": integer("userId").notNull(),
  "provider": text("provider").notNull(),
  "toolName": varchar("toolName", { length: 100 }).notNull(),
  "externalProjectId": varchar("externalProjectId", { length: 180 }).notNull(),
  "idempotencyKey": varchar("idempotencyKey", { length: 128 }).notNull(),
  "confirmationToken": varchar("confirmationToken", { length: 64 }).notNull(),
  "argsJson": text("argsJson").notNull(),
  "resultJson": text("resultJson"),
  "error": text("error"),
  "status": text("status").default("preview").notNull(),
  "confirmedAt": timestamp("confirmedAt", { withTimezone: true, mode: "date" }),
  "executedAt": timestamp("executedAt", { withTimezone: true, mode: "date" }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const planningResources = pgTable("planning_resources", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "resourceType": text("resourceType").notNull(),
  "unit": varchar("unit", { length: 32 }).notNull(),
  "capacityPerDay": numeric("capacityPerDay", { precision: 14, scale: 3, mode: "number" }),
  "costPerDay": numeric("costPerDay", { precision: 14, scale: 2, mode: "number" }),
  "active": integer("active").default(1).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const priceCatalogs = pgTable("price_catalogs", {
  "id": serial("id").notNull(),
  "name": varchar("name", { length: 160 }).notNull(),
  "sourceType": text("sourceType").notNull(),
  "state": varchar("state", { length: 2 }),
  "referencePeriod": varchar("referencePeriod", { length: 20 }).notNull(),
  "status": text("status").default("ativo").notNull(),
  "notes": text("notes"),
  "createdBy": integer("createdBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const priceItems = pgTable("price_items", {
  "id": serial("id").notNull(),
  "catalogId": integer("catalogId").notNull(),
  "code": varchar("code", { length: 64 }).notNull(),
  "description": varchar("description", { length: 240 }).notNull(),
  "unit": varchar("unit", { length: 32 }).notNull(),
  "itemType": text("itemType").notNull(),
  "unitPrice": numeric("unitPrice", { precision: 14, scale: 2, mode: "number" }).notNull(),
  "notes": text("notes"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const productionEntries = pgTable("production_entries", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "frontId": integer("frontId"),
  "teamId": integer("teamId"),
  "unitId": integer("unitId"),
  "activityId": integer("activityId").notNull(),
  "productionDate": timestamp("productionDate", { withTimezone: true, mode: "date" }).notNull(),
  "quantity": numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
  "measurementUnit": varchar("measurementUnit", { length: 32 }).notNull(),
  "notes": text("notes"),
  "status": text("status").default("rascunho").notNull(),
  "exemplo": integer("exemplo").default(0).notNull(),
  "createdBy": integer("createdBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const productionFronts = pgTable("production_fronts", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "code": varchar("code", { length: 32 }).notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "location": varchar("location", { length: 180 }),
  "status": text("status").default("ativa").notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const productionTeams = pgTable("production_teams", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "trade": varchar("trade", { length: 120 }).notNull(),
  "memberCount": integer("memberCount").default(0).notNull(),
  "active": integer("active").default(1).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const productionUnits = pgTable("production_units", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "code": varchar("code", { length: 32 }).notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "unitType": varchar("unitType", { length: 80 }).notNull(),
  "sortOrder": integer("sortOrder").default(0).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const projectAuditEvents = pgTable("project_audit_events", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "userId": integer("userId"),
  "action": varchar("action", { length: 64 }).notNull(),
  "payload": jsonb("payload").notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const projectDocuments = pgTable("project_documents", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "ownerUserId": integer("ownerUserId"),
  "fileName": varchar("fileName", { length: 255 }).notNull(),
  "mimeType": varchar("mimeType", { length: 120 }).notNull(),
  "sizeBytes": integer("sizeBytes").notNull(),
  "content": bytea("content").notNull(),
  "extractedText": text("extractedText"),
  "analysisStatus": varchar("analysisStatus", { length: 32 }).default("pending").notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const projectMcpIntegrations = pgTable("project_mcp_integrations", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "provider": text("provider").notNull(),
  "externalProjectId": varchar("externalProjectId", { length: 180 }),
  "endpointUrl": varchar("endpointUrl", { length: 500 }).notNull(),
  "syncState": text("syncState").default("unconfigured").notNull(),
  "lastSyncedAt": timestamp("lastSyncedAt", { withTimezone: true, mode: "date" }),
  "lastError": text("lastError"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const projectPlanVersions = pgTable("project_plan_versions", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "versionNumber": integer("versionNumber").notNull(),
  "status": text("status").default("draft").notNull(),
  "baseVersionId": integer("baseVersionId"),
  "decisionId": integer("decisionId"),
  "approvedAt": timestamp("approvedAt", { withTimezone: true, mode: "date" }),
  "notes": text("notes"),
  "createdBy": integer("createdBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  "id": serial("id").notNull(),
  "ownerUserId": integer("ownerUserId"),
  "code": varchar("code", { length: 32 }).notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "location": varchar("location", { length: 180 }).notNull(),
  "status": text("status").default("Planejamento").notNull(),
  "progress": integer("progress").default(0).notNull(),
  "descricao": text("descricao"),
  "plannedStart": timestamp("plannedStart", { withTimezone: true, mode: "date" }).notNull(),
  "plannedFinish": timestamp("plannedFinish", { withTimezone: true, mode: "date" }).notNull(),
  "baseReferencia": text("baseReferencia"),
  "baseReferenciaRef": varchar("baseReferenciaRef", { length: 20 }),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "deletedAt": timestamp("deletedAt", { withTimezone: true, mode: "date" }),
  "deletedAtBy": integer("deletedAtBy"),
  "tipoDeObra": varchar("tipoDeObra", { length: 32 }),
});

export const scheduleActivities = pgTable("schedule_activities", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "wbsNodeId": integer("wbsNodeId").notNull(),
  "externalId": varchar("externalId", { length: 180 }),
  "eapRef": varchar("eapRef", { length: 180 }),
  "wbsCode": varchar("wbsCode", { length: 32 }).notNull(),
  "name": varchar("name", { length: 220 }).notNull(),
  "phase": varchar("phase", { length: 80 }).notNull(),
  "pavimento": varchar("pavimento", { length: 80 }),
  "startOffset": integer("startOffset").notNull(),
  "durationDays": integer("durationDays").notNull(),
  "plannedQuantity": numeric("plannedQuantity", { precision: 14, scale: 3, mode: "number" }),
  "unit": varchar("unit", { length: 16 }),
  "productivity": numeric("productivity", { precision: 14, scale: 3, mode: "number" }),
  "budgetItemId": integer("budgetItemId"),
  "progress": integer("progress").default(0).notNull(),
  "exemplo": integer("exemplo").default(0).notNull(),
  "status": text("status").default("Não iniciado").notNull(),
  "critical": integer("critical").default(0).notNull(),
  "earlyStart": integer("earlyStart"),
  "earlyFinish": integer("earlyFinish"),
  "lateStart": integer("lateStart"),
  "lateFinish": integer("lateFinish"),
  "totalFloat": integer("totalFloat"),
  "freeFloat": integer("freeFloat"),
  "mustStartOn": timestamp("mustStartOn", { withTimezone: true, mode: "date" }),
  "finishNoLaterThan": timestamp("finishNoLaterThan", { withTimezone: true, mode: "date" }),
  "cpmCalculatedAt": timestamp("cpmCalculatedAt", { withTimezone: true, mode: "date" }),
  "versionId": integer("versionId"),
  "sortOrder": integer("sortOrder").default(0).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const scheduleBaselineItems = pgTable("schedule_baseline_items", {
  "id": serial("id").notNull(),
  "baselineId": integer("baselineId").notNull(),
  "activityId": integer("activityId").notNull(),
  "startOffset": integer("startOffset").notNull(),
  "durationDays": integer("durationDays").notNull(),
  "earlyStart": integer("earlyStart"),
  "earlyFinish": integer("earlyFinish"),
});

export const scheduleBaselines = pgTable("schedule_baselines", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "name": varchar("name", { length: 160 }).notNull(),
  "status": text("status").default("ativa").notNull(),
  "createdBy": integer("createdBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const scheduleDependencies = pgTable("schedule_dependencies", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "externalId": varchar("externalId", { length: 180 }),
  "predecessorId": integer("predecessorId").notNull(),
  "successorId": integer("successorId").notNull(),
  "type": text("type").default("FS").notNull(),
  "lag": integer("lag").default(0).notNull(),
  "versionId": integer("versionId"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const serviceCompositions = pgTable("service_compositions", {
  "id": serial("id").notNull(),
  "code": varchar("code", { length: 64 }).notNull(),
  "description": varchar("description", { length: 240 }).notNull(),
  "unit": varchar("unit", { length: 32 }).notNull(),
  "sourceCatalogId": integer("sourceCatalogId"),
  "referencePeriod": varchar("referencePeriod", { length: 20 }),
  "status": text("status").default("rascunho").notNull(),
  "createdBy": integer("createdBy"),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  "id": serial("id").notNull(),
  "openId": varchar("openId", { length: 64 }).notNull(),
  "name": text("name"),
  "email": varchar("email", { length: 320 }),
  "loginMethod": varchar("loginMethod", { length: 64 }),
  "role": text("role").default("user").notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "lastSignedIn": timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const wbsNodes = pgTable("wbs_nodes", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "externalId": varchar("externalId", { length: 180 }),
  "externalUid": varchar("externalUid", { length: 180 }),
  "parentId": integer("parentId"),
  "code": varchar("code", { length: 32 }).notNull(),
  "name": varchar("name", { length: 220 }).notNull(),
  "level": integer("level").default(1).notNull(),
  "nodeType": text("nodeType").default("pacote").notNull(),
  "unit": varchar("unit", { length: 32 }),
  "plannedQuantity": numeric("plannedQuantity", { precision: 14, scale: 3, mode: "number" }),
  "versionId": integer("versionId"),
  "sortOrder": integer("sortOrder").default(0).notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "description": text("description"),
  "inclusions": text("inclusions"),
  "exclusions": text("exclusions"),
  "location": varchar("location", { length: 180 }),
  "responsible": varchar("responsible", { length: 180 }),
  "acceptanceCriteria": text("acceptanceCriteria"),
  "scopeStatus": varchar("scopeStatus", { length: 24 }).default("rascunho").notNull(),
  "decompositionBasis": varchar("decompositionBasis", { length: 32 }),
});

export const workCalendars = pgTable("work_calendars", {
  "id": serial("id").notNull(),
  "projectId": integer("projectId").notNull(),
  "name": varchar("name", { length: 180 }).notNull(),
  "weekPattern": jsonb("weekPattern").notNull(),
  "createdAt": timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  "updatedAt": timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type ActivityResourceAllocations = typeof activityResourceAllocations.$inferSelect;
export type InsertActivityResourceAllocations = typeof activityResourceAllocations.$inferInsert;
export type ActivityResourceAllocation = typeof activityResourceAllocations.$inferSelect;
export type InsertActivityResourceAllocation = typeof activityResourceAllocations.$inferInsert;
export type AgentDecisions = typeof agentDecisions.$inferSelect;
export type InsertAgentDecisions = typeof agentDecisions.$inferInsert;
export type AgentDecision = typeof agentDecisions.$inferSelect;
export type InsertAgentDecision = typeof agentDecisions.$inferInsert;
export type AgentFindings = typeof agentFindings.$inferSelect;
export type InsertAgentFindings = typeof agentFindings.$inferInsert;
export type AgentFinding = typeof agentFindings.$inferSelect;
export type InsertAgentFinding = typeof agentFindings.$inferInsert;
export type AgentMemories = typeof agentMemories.$inferSelect;
export type InsertAgentMemories = typeof agentMemories.$inferInsert;
export type AgentMemory = typeof agentMemories.$inferSelect;
export type InsertAgentMemory = typeof agentMemories.$inferInsert;
export type AgentProjectStates = typeof agentProjectStates.$inferSelect;
export type InsertAgentProjectStates = typeof agentProjectStates.$inferInsert;
export type AgentProjectState = typeof agentProjectStates.$inferSelect;
export type InsertAgentProjectState = typeof agentProjectStates.$inferInsert;
export type AgentRunEvents = typeof agentRunEvents.$inferSelect;
export type InsertAgentRunEvents = typeof agentRunEvents.$inferInsert;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type InsertAgentRunEvent = typeof agentRunEvents.$inferInsert;
export type AgentRuns = typeof agentRuns.$inferSelect;
export type InsertAgentRuns = typeof agentRuns.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type InsertAgentRun = typeof agentRuns.$inferInsert;
export type ArquimedesCapabilities = typeof arquimedesCapabilities.$inferSelect;
export type InsertArquimedesCapabilities = typeof arquimedesCapabilities.$inferInsert;
export type ArquimedesCapability = typeof arquimedesCapabilities.$inferSelect;
export type InsertArquimedesCapability = typeof arquimedesCapabilities.$inferInsert;
export type ArquimedesCapabilityEvents = typeof arquimedesCapabilityEvents.$inferSelect;
export type InsertArquimedesCapabilityEvents = typeof arquimedesCapabilityEvents.$inferInsert;
export type ArquimedesCapabilityEvent = typeof arquimedesCapabilityEvents.$inferSelect;
export type InsertArquimedesCapabilityEvent = typeof arquimedesCapabilityEvents.$inferInsert;
export type BudgetItems = typeof budgetItems.$inferSelect;
export type InsertBudgetItems = typeof budgetItems.$inferInsert;
export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;
export type BudgetVersions = typeof budgetVersions.$inferSelect;
export type InsertBudgetVersions = typeof budgetVersions.$inferInsert;
export type BudgetVersion = typeof budgetVersions.$inferSelect;
export type InsertBudgetVersion = typeof budgetVersions.$inferInsert;
export type CalendarExceptions = typeof calendarExceptions.$inferSelect;
export type InsertCalendarExceptions = typeof calendarExceptions.$inferInsert;
export type CalendarException = typeof calendarExceptions.$inferSelect;
export type InsertCalendarException = typeof calendarExceptions.$inferInsert;
export type CompositionComponents = typeof compositionComponents.$inferSelect;
export type InsertCompositionComponents = typeof compositionComponents.$inferInsert;
export type CompositionComponent = typeof compositionComponents.$inferSelect;
export type InsertCompositionComponent = typeof compositionComponents.$inferInsert;
export type LlmProviderSettings = typeof llmProviderSettings.$inferSelect;
export type InsertLlmProviderSettings = typeof llmProviderSettings.$inferInsert;
export type LlmProviderSetting = typeof llmProviderSettings.$inferSelect;
export type InsertLlmProviderSetting = typeof llmProviderSettings.$inferInsert;
export type McpHomologationRuns = typeof mcpHomologationRuns.$inferSelect;
export type InsertMcpHomologationRuns = typeof mcpHomologationRuns.$inferInsert;
export type McpHomologationRun = typeof mcpHomologationRuns.$inferSelect;
export type InsertMcpHomologationRun = typeof mcpHomologationRuns.$inferInsert;
export type McpMutationOperations = typeof mcpMutationOperations.$inferSelect;
export type InsertMcpMutationOperations = typeof mcpMutationOperations.$inferInsert;
export type McpMutationOperation = typeof mcpMutationOperations.$inferSelect;
export type InsertMcpMutationOperation = typeof mcpMutationOperations.$inferInsert;
export type PlanningResources = typeof planningResources.$inferSelect;
export type InsertPlanningResources = typeof planningResources.$inferInsert;
export type PlanningResource = typeof planningResources.$inferSelect;
export type InsertPlanningResource = typeof planningResources.$inferInsert;
export type PriceCatalogs = typeof priceCatalogs.$inferSelect;
export type InsertPriceCatalogs = typeof priceCatalogs.$inferInsert;
export type PriceCatalog = typeof priceCatalogs.$inferSelect;
export type InsertPriceCatalog = typeof priceCatalogs.$inferInsert;
export type PriceItems = typeof priceItems.$inferSelect;
export type InsertPriceItems = typeof priceItems.$inferInsert;
export type PriceItem = typeof priceItems.$inferSelect;
export type InsertPriceItem = typeof priceItems.$inferInsert;
export type ProductionEntries = typeof productionEntries.$inferSelect;
export type InsertProductionEntries = typeof productionEntries.$inferInsert;
export type ProductionEntry = typeof productionEntries.$inferSelect;
export type InsertProductionEntry = typeof productionEntries.$inferInsert;
export type ProductionFronts = typeof productionFronts.$inferSelect;
export type InsertProductionFronts = typeof productionFronts.$inferInsert;
export type ProductionFront = typeof productionFronts.$inferSelect;
export type InsertProductionFront = typeof productionFronts.$inferInsert;
export type ProductionTeams = typeof productionTeams.$inferSelect;
export type InsertProductionTeams = typeof productionTeams.$inferInsert;
export type ProductionTeam = typeof productionTeams.$inferSelect;
export type InsertProductionTeam = typeof productionTeams.$inferInsert;
export type ProductionUnits = typeof productionUnits.$inferSelect;
export type InsertProductionUnits = typeof productionUnits.$inferInsert;
export type ProductionUnit = typeof productionUnits.$inferSelect;
export type InsertProductionUnit = typeof productionUnits.$inferInsert;
export type ProjectAuditEvents = typeof projectAuditEvents.$inferSelect;
export type InsertProjectAuditEvents = typeof projectAuditEvents.$inferInsert;
export type ProjectAuditEvent = typeof projectAuditEvents.$inferSelect;
export type InsertProjectAuditEvent = typeof projectAuditEvents.$inferInsert;
export type ProjectDocuments = typeof projectDocuments.$inferSelect;
export type InsertProjectDocuments = typeof projectDocuments.$inferInsert;
export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = typeof projectDocuments.$inferInsert;
export type ProjectMcpIntegrations = typeof projectMcpIntegrations.$inferSelect;
export type InsertProjectMcpIntegrations = typeof projectMcpIntegrations.$inferInsert;
export type ProjectMcpIntegration = typeof projectMcpIntegrations.$inferSelect;
export type InsertProjectMcpIntegration = typeof projectMcpIntegrations.$inferInsert;
export type ProjectPlanVersions = typeof projectPlanVersions.$inferSelect;
export type InsertProjectPlanVersions = typeof projectPlanVersions.$inferInsert;
export type ProjectPlanVersion = typeof projectPlanVersions.$inferSelect;
export type InsertProjectPlanVersion = typeof projectPlanVersions.$inferInsert;
export type Projects = typeof projects.$inferSelect;
export type InsertProjects = typeof projects.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type ScheduleActivities = typeof scheduleActivities.$inferSelect;
export type InsertScheduleActivities = typeof scheduleActivities.$inferInsert;
export type ScheduleActivity = typeof scheduleActivities.$inferSelect;
export type InsertScheduleActivity = typeof scheduleActivities.$inferInsert;
export type ScheduleBaselineItems = typeof scheduleBaselineItems.$inferSelect;
export type InsertScheduleBaselineItems = typeof scheduleBaselineItems.$inferInsert;
export type ScheduleBaselineItem = typeof scheduleBaselineItems.$inferSelect;
export type InsertScheduleBaselineItem = typeof scheduleBaselineItems.$inferInsert;
export type ScheduleBaselines = typeof scheduleBaselines.$inferSelect;
export type InsertScheduleBaselines = typeof scheduleBaselines.$inferInsert;
export type ScheduleBaseline = typeof scheduleBaselines.$inferSelect;
export type InsertScheduleBaseline = typeof scheduleBaselines.$inferInsert;
export type ScheduleDependencies = typeof scheduleDependencies.$inferSelect;
export type InsertScheduleDependencies = typeof scheduleDependencies.$inferInsert;
export type ScheduleDependency = typeof scheduleDependencies.$inferSelect;
export type InsertScheduleDependency = typeof scheduleDependencies.$inferInsert;
export type ServiceCompositions = typeof serviceCompositions.$inferSelect;
export type InsertServiceCompositions = typeof serviceCompositions.$inferInsert;
export type ServiceComposition = typeof serviceCompositions.$inferSelect;
export type InsertServiceComposition = typeof serviceCompositions.$inferInsert;
export type Users = typeof users.$inferSelect;
export type InsertUsers = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WbsNodes = typeof wbsNodes.$inferSelect;
export type InsertWbsNodes = typeof wbsNodes.$inferInsert;
export type WbsNode = typeof wbsNodes.$inferSelect;
export type InsertWbsNode = typeof wbsNodes.$inferInsert;
export type WorkCalendars = typeof workCalendars.$inferSelect;
export type InsertWorkCalendars = typeof workCalendars.$inferInsert;
export type WorkCalendar = typeof workCalendars.$inferSelect;
export type InsertWorkCalendar = typeof workCalendars.$inferInsert;
