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
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_decisions` ADD CONSTRAINT `agent_decisions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_findings` ADD CONSTRAINT `agent_findings_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_project_states` ADD CONSTRAINT `agent_project_states_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agent_decisions_project_idx` ON `agent_decisions` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_decisions_project_stage_idx` ON `agent_decisions` (`projectId`,`stage`);--> statement-breakpoint
CREATE INDEX `agent_findings_project_idx` ON `agent_findings` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_findings_project_status_idx` ON `agent_findings` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `agent_memories_project_idx` ON `agent_memories` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_memories_owner_scope_idx` ON `agent_memories` (`ownerUserId`,`scope`);--> statement-breakpoint
CREATE INDEX `agent_memories_status_idx` ON `agent_memories` (`status`);--> statement-breakpoint
CREATE INDEX `agent_project_states_stage_idx` ON `agent_project_states` (`stage`);