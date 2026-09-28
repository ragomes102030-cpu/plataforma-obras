CREATE TABLE `activity_resource_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`resourceId` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL DEFAULT '1',
	`productivity` decimal(14,3),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_resource_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_resource_unique_idx` UNIQUE(`activityId`,`resourceId`)
);
--> statement-breakpoint
CREATE TABLE `agent_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`stage` varchar(50) NOT NULL,
	`decision` enum('approved','partially_approved','rejected','reopen') NOT NULL,
	`scopeJson` text NOT NULL,
	`reason` text,
	`impactJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_findings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stage` varchar(50) NOT NULL,
	`classification` enum('blocker','alert','recommendation') NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityRef` varchar(180),
	`sourceJson` text NOT NULL,
	`originalValueJson` text,
	`proposedValueJson` text,
	`description` text NOT NULL,
	`impact` text,
	`confidence` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('open','confirmed','rejected','resolved','obsolete') NOT NULL DEFAULT 'open',
	`resolvedAt` timestamp,
	`resolvedBy` int,
	`resolutionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_findings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`ownerUserId` int NOT NULL,
	`scope` enum('project','client','library') NOT NULL,
	`category` varchar(80) NOT NULL,
	`memoryKey` varchar(180) NOT NULL,
	`valueJson` text NOT NULL,
	`sourceType` varchar(80) NOT NULL,
	`sourceRef` varchar(180),
	`confidence` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`status` enum('proposed','approved','rejected','obsolete') NOT NULL DEFAULT 'proposed',
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_project_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stage` enum('DESCRITIVO','EAP_PROPOSTA','EAP_REVISAO','ATIVIDADES_PROPOSTA','DEPENDENCIAS_PROPOSTA','CPM_VALIDADO','CRONOGRAMA_PROPOSTO','BASELINE_PROPOSTA','GANTT_LOB_PROPOSTO','CONTROLE') NOT NULL DEFAULT 'DESCRITIVO',
	`activeSection` varchar(40) NOT NULL DEFAULT 'portfolio',
	`activeSubtab` varchar(40),
	`blockerCount` int NOT NULL DEFAULT 0,
	`lastSummary` text,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_project_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_project_states_project_idx` UNIQUE(`projectId`)
);
--> statement-breakpoint
CREATE TABLE `agent_run_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` varchar(128) NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`eventJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agent_run_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` varchar(128) NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('executando','respondido','falhou','timeout','aguardando_confirmacao','dados_incompletos') NOT NULL DEFAULT 'executando',
	`currentStep` varchar(120),
	`provider` varchar(80),
	`model` varchar(160),
	`contextJson` text NOT NULL,
	`resultJson` text,
	`errorCode` varchar(100),
	`errorMessage` text,
	`iterations` int NOT NULL DEFAULT 0,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_runs_requestId_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `budget_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetVersionId` int NOT NULL,
	`wbsNodeId` int,
	`code` varchar(48) NOT NULL,
	`description` varchar(240) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unitPrice` decimal(14,2) NOT NULL,
	`compositionId` int,
	`compositionUnitCost` decimal(14,2),
	`productivity` decimal(14,3),
	`plannedDurationDays` int,
	`source` varchar(80),
	`referencePeriod` varchar(20),
	`compositionNote` text,
	`isPriceException` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `budget_items_version_code_idx` UNIQUE(`budgetVersionId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `budget_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`versionNumber` int NOT NULL,
	`status` enum('rascunho','em_revisao','aprovado','arquivado') NOT NULL DEFAULT 'rascunho',
	`currency` varchar(3) NOT NULL DEFAULT 'BRL',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budget_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `budget_versions_project_version_idx` UNIQUE(`projectId`,`versionNumber`)
);
--> statement-breakpoint
CREATE TABLE `composition_components` (
	`id` int AUTO_INCREMENT NOT NULL,
	`compositionId` int NOT NULL,
	`priceItemId` int NOT NULL,
	`componentType` enum('material','mao_de_obra','equipamento') NOT NULL,
	`coefficient` decimal(14,6) NOT NULL,
	`unitPriceSnapshot` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `composition_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `composition_components_unique_idx` UNIQUE(`compositionId`,`priceItemId`)
);
--> statement-breakpoint
CREATE TABLE `llm_provider_settings` (
	`id` int NOT NULL,
	`encryptedConfig` text NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_provider_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_homologation_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`requestId` varchar(128) NOT NULL,
	`status` enum('planned','read_only_running','read_only_passed','read_only_degraded','reconciled','failed') NOT NULL DEFAULT 'planned',
	`planJson` text NOT NULL,
	`readOnlyResultJson` text,
	`reconciliationJson` text,
	`error` text,
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mcp_homologation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mcp_mutation_operations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('eap','cronograma','ganttLob') NOT NULL,
	`toolName` varchar(100) NOT NULL,
	`externalProjectId` varchar(180) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`confirmationToken` varchar(64) NOT NULL,
	`argsJson` text NOT NULL,
	`resultJson` text,
	`error` text,
	`status` enum('preview','confirmed','executing','succeeded','failed','cancelled') NOT NULL DEFAULT 'preview',
	`confirmedAt` timestamp,
	`executedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mcp_mutation_operations_id` PRIMARY KEY(`id`),
	CONSTRAINT `mcp_mutation_operations_idempotency_idx` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `planning_resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`resourceType` enum('mao_de_obra','equipamento','material') NOT NULL,
	`unit` varchar(32) NOT NULL,
	`capacityPerDay` decimal(14,3),
	`costPerDay` decimal(14,2),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `planning_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_catalogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`sourceType` enum('propria','SINAPI','SEINFRA','fornecedor') NOT NULL,
	`state` varchar(2),
	`referencePeriod` varchar(20) NOT NULL,
	`status` enum('ativo','arquivado') NOT NULL DEFAULT 'ativo',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_catalogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`catalogId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`description` varchar(240) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`itemType` enum('material','mao_de_obra','equipamento','servico') NOT NULL,
	`unitPrice` decimal(14,2) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_items_catalog_code_idx` UNIQUE(`catalogId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `production_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`frontId` int NOT NULL,
	`teamId` int NOT NULL,
	`unitId` int NOT NULL,
	`activityId` int NOT NULL,
	`productionDate` timestamp NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`measurementUnit` varchar(32) NOT NULL,
	`notes` text,
	`status` enum('rascunho','confirmada') NOT NULL DEFAULT 'rascunho',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `production_fronts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`location` varchar(180),
	`status` enum('ativa','pausada','concluida') NOT NULL DEFAULT 'ativa',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_fronts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `production_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`trade` varchar(120) NOT NULL,
	`memberCount` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `production_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`unitType` varchar(80) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `production_units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int,
	`action` varchar(64) NOT NULL,
	`payload` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `project_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_mcp_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`provider` enum('eap','cronograma','ganttLob') NOT NULL,
	`externalProjectId` varchar(180),
	`endpointUrl` varchar(500) NOT NULL,
	`syncState` enum('unconfigured','ready','pending','error') NOT NULL DEFAULT 'unconfigured',
	`lastSyncedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_mcp_integrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_mcp_integrations_project_provider_idx` UNIQUE(`projectId`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `project_plan_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`status` enum('draft','proposed','approved','superseded') NOT NULL DEFAULT 'draft',
	`baseVersionId` int,
	`decisionId` int,
	`approvedAt` timestamp,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_plan_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_plan_versions_project_version_idx` UNIQUE(`projectId`,`versionNumber`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int,
	`code` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`location` varchar(180) NOT NULL,
	`status` enum('Em execução','Planejamento','Concluída','Em risco') NOT NULL DEFAULT 'Planejamento',
	`progress` int NOT NULL DEFAULT 0,
	`plannedStart` timestamp NOT NULL,
	`plannedFinish` timestamp NOT NULL,
	`baseReferencia` enum('SEINFRA','SINAPI','PROPRIA'),
	`baseReferenciaRef` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `schedule_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`wbsNodeId` int NOT NULL,
	`externalId` varchar(180),
	`eapRef` varchar(180),
	`wbsCode` varchar(32) NOT NULL,
	`name` varchar(220) NOT NULL,
	`phase` varchar(80) NOT NULL,
	`startOffset` int NOT NULL,
	`durationDays` int NOT NULL,
	`plannedQuantity` decimal(14,3),
	`productivity` decimal(14,3),
	`budgetItemId` int,
	`progress` int NOT NULL DEFAULT 0,
	`status` enum('Não iniciado','Em andamento','Concluído','Em risco') NOT NULL DEFAULT 'Não iniciado',
	`critical` int NOT NULL DEFAULT 0,
	`earlyStart` int,
	`earlyFinish` int,
	`lateStart` int,
	`lateFinish` int,
	`totalFloat` int,
	`cpmCalculatedAt` timestamp,
	`versionId` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_activities_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedule_activities_project_external_idx` UNIQUE(`projectId`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `schedule_baseline_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baselineId` int NOT NULL,
	`activityId` int NOT NULL,
	`startOffset` int NOT NULL,
	`durationDays` int NOT NULL,
	`earlyStart` int,
	`earlyFinish` int,
	CONSTRAINT `schedule_baseline_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedule_baseline_activity_idx` UNIQUE(`baselineId`,`activityId`)
);
--> statement-breakpoint
CREATE TABLE `schedule_baselines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`status` enum('rascunho','ativa','arquivada') NOT NULL DEFAULT 'ativa',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_baselines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_dependencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`externalId` varchar(180),
	`predecessorId` int NOT NULL,
	`successorId` int NOT NULL,
	`type` enum('FS','SS','FF','SF') NOT NULL DEFAULT 'FS',
	`lag` int NOT NULL DEFAULT 0,
	`versionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_dependencies_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedule_dependencies_project_external_idx` UNIQUE(`projectId`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `service_compositions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`description` varchar(240) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`sourceCatalogId` int,
	`referencePeriod` varchar(20),
	`status` enum('rascunho','validada','arquivada') NOT NULL DEFAULT 'rascunho',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_compositions_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_compositions_code_idx` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `wbs_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`externalId` varchar(180),
	`externalUid` varchar(180),
	`parentId` int,
	`code` varchar(32) NOT NULL,
	`name` varchar(220) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`nodeType` enum('grupo','pacote','entrega') NOT NULL DEFAULT 'pacote',
	`unit` varchar(32),
	`plannedQuantity` int,
	`versionId` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wbs_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `wbs_nodes_project_external_idx` UNIQUE(`projectId`,`externalId`),
	CONSTRAINT `wbs_nodes_project_code_unique_idx` UNIQUE(`projectId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `activity_resource_allocations` ADD CONSTRAINT `act_res_alloc_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_resource_allocations` ADD CONSTRAINT `act_res_alloc_resource_fk` FOREIGN KEY (`resourceId`) REFERENCES `planning_resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_findings` ADD CONSTRAINT `agent_findings_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_findings` ADD CONSTRAINT `agent_findings_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_project_states` ADD CONSTRAINT `agent_project_states_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD CONSTRAINT `agent_run_events_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD CONSTRAINT `agent_run_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_budgetVersionId_budget_versions_id_fk` FOREIGN KEY (`budgetVersionId`) REFERENCES `budget_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_wbsNodeId_wbs_nodes_id_fk` FOREIGN KEY (`wbsNodeId`) REFERENCES `wbs_nodes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_versions` ADD CONSTRAINT `budget_versions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_versions` ADD CONSTRAINT `budget_versions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `composition_components` ADD CONSTRAINT `composition_components_compositionId_service_compositions_id_fk` FOREIGN KEY (`compositionId`) REFERENCES `service_compositions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `composition_components` ADD CONSTRAINT `composition_components_priceItemId_price_items_id_fk` FOREIGN KEY (`priceItemId`) REFERENCES `price_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `llm_provider_settings` ADD CONSTRAINT `llm_provider_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_homologation_runs` ADD CONSTRAINT `mcp_homologation_runs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_homologation_runs` ADD CONSTRAINT `mcp_homologation_runs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_mutation_operations` ADD CONSTRAINT `mcp_mutation_operations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_mutation_operations` ADD CONSTRAINT `mcp_mutation_operations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `planning_resources` ADD CONSTRAINT `planning_resources_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_catalogs` ADD CONSTRAINT `price_catalogs_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_items` ADD CONSTRAINT `price_items_catalogId_price_catalogs_id_fk` FOREIGN KEY (`catalogId`) REFERENCES `price_catalogs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_frontId_production_fronts_id_fk` FOREIGN KEY (`frontId`) REFERENCES `production_fronts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_teamId_production_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `production_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_unitId_production_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `production_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_activityId_schedule_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_fronts` ADD CONSTRAINT `production_fronts_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_teams` ADD CONSTRAINT `production_teams_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_units` ADD CONSTRAINT `production_units_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_audit_events` ADD CONSTRAINT `project_audit_events_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_audit_events` ADD CONSTRAINT `project_audit_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_mcp_integrations` ADD CONSTRAINT `project_mcp_integrations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_plan_versions` ADD CONSTRAINT `project_plan_versions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_plan_versions` ADD CONSTRAINT `project_plan_versions_baseVersionId_project_plan_versions_id_fk` FOREIGN KEY (`baseVersionId`) REFERENCES `project_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_plan_versions` ADD CONSTRAINT `project_plan_versions_decisionId_agent_decisions_id_fk` FOREIGN KEY (`decisionId`) REFERENCES `agent_decisions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_plan_versions` ADD CONSTRAINT `project_plan_versions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_wbsNodeId_wbs_nodes_id_fk` FOREIGN KEY (`wbsNodeId`) REFERENCES `wbs_nodes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_versionId_project_plan_versions_id_fk` FOREIGN KEY (`versionId`) REFERENCES `project_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baseline_items` ADD CONSTRAINT `schedule_baseline_items_baselineId_schedule_baselines_id_fk` FOREIGN KEY (`baselineId`) REFERENCES `schedule_baselines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baseline_items` ADD CONSTRAINT `schedule_baseline_items_activityId_schedule_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baselines` ADD CONSTRAINT `schedule_baselines_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baselines` ADD CONSTRAINT `schedule_baselines_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_predecessorId_schedule_activities_id_fk` FOREIGN KEY (`predecessorId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_successorId_schedule_activities_id_fk` FOREIGN KEY (`successorId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_versionId_project_plan_versions_id_fk` FOREIGN KEY (`versionId`) REFERENCES `project_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_compositions` ADD CONSTRAINT `service_compositions_sourceCatalogId_price_catalogs_id_fk` FOREIGN KEY (`sourceCatalogId`) REFERENCES `price_catalogs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_compositions` ADD CONSTRAINT `service_compositions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD CONSTRAINT `wbs_nodes_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD CONSTRAINT `wbs_nodes_parentId_wbs_nodes_id_fk` FOREIGN KEY (`parentId`) REFERENCES `wbs_nodes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD CONSTRAINT `wbs_nodes_versionId_project_plan_versions_id_fk` FOREIGN KEY (`versionId`) REFERENCES `project_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_resource_activity_idx` ON `activity_resource_allocations` (`activityId`);--> statement-breakpoint
CREATE INDEX `agent_decisions_project_idx` ON `agent_decisions` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_decisions_project_stage_idx` ON `agent_decisions` (`projectId`,`stage`);--> statement-breakpoint
CREATE INDEX `agent_findings_project_idx` ON `agent_findings` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_findings_project_status_idx` ON `agent_findings` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `agent_memories_project_idx` ON `agent_memories` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_memories_owner_scope_idx` ON `agent_memories` (`ownerUserId`,`scope`);--> statement-breakpoint
CREATE INDEX `agent_memories_status_idx` ON `agent_memories` (`status`);--> statement-breakpoint
CREATE INDEX `agent_project_states_stage_idx` ON `agent_project_states` (`stage`);--> statement-breakpoint
CREATE INDEX `agent_run_events_request_idx` ON `agent_run_events` (`requestId`);--> statement-breakpoint
CREATE INDEX `agent_run_events_project_idx` ON `agent_run_events` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_run_events_user_idx` ON `agent_run_events` (`userId`);--> statement-breakpoint
CREATE INDEX `agent_runs_project_idx` ON `agent_runs` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_runs_user_idx` ON `agent_runs` (`userId`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);--> statement-breakpoint
CREATE INDEX `budget_items_version_idx` ON `budget_items` (`budgetVersionId`);--> statement-breakpoint
CREATE INDEX `budget_versions_project_idx` ON `budget_versions` (`projectId`);--> statement-breakpoint
CREATE INDEX `composition_components_composition_idx` ON `composition_components` (`compositionId`);--> statement-breakpoint
CREATE INDEX `mcp_homologation_runs_project_idx` ON `mcp_homologation_runs` (`projectId`);--> statement-breakpoint
CREATE INDEX `mcp_homologation_runs_user_idx` ON `mcp_homologation_runs` (`userId`);--> statement-breakpoint
CREATE INDEX `mcp_mutation_operations_project_idx` ON `mcp_mutation_operations` (`projectId`);--> statement-breakpoint
CREATE INDEX `mcp_mutation_operations_user_idx` ON `mcp_mutation_operations` (`userId`);--> statement-breakpoint
CREATE INDEX `price_catalogs_reference_idx` ON `price_catalogs` (`referencePeriod`);--> statement-breakpoint
CREATE INDEX `price_items_catalog_idx` ON `price_items` (`catalogId`);--> statement-breakpoint
CREATE INDEX `project_audit_events_project_idx` ON `project_audit_events` (`projectId`,`action`);--> statement-breakpoint
CREATE INDEX `project_mcp_integrations_project_idx` ON `project_mcp_integrations` (`projectId`);--> statement-breakpoint
CREATE INDEX `project_plan_versions_project_idx` ON `project_plan_versions` (`projectId`);--> statement-breakpoint
CREATE INDEX `schedule_activities_project_idx` ON `schedule_activities` (`projectId`);--> statement-breakpoint
CREATE INDEX `schedule_activities_plan_version_idx` ON `schedule_activities` (`versionId`);--> statement-breakpoint
CREATE INDEX `schedule_activities_wbs_node_idx` ON `schedule_activities` (`wbsNodeId`);--> statement-breakpoint
CREATE INDEX `schedule_baseline_items_baseline_idx` ON `schedule_baseline_items` (`baselineId`);--> statement-breakpoint
CREATE INDEX `schedule_dependencies_plan_version_idx` ON `schedule_dependencies` (`versionId`);--> statement-breakpoint
CREATE INDEX `service_compositions_source_idx` ON `service_compositions` (`sourceCatalogId`);--> statement-breakpoint
CREATE INDEX `wbs_nodes_project_idx` ON `wbs_nodes` (`projectId`);--> statement-breakpoint
CREATE INDEX `wbs_nodes_plan_version_idx` ON `wbs_nodes` (`versionId`);