CREATE TABLE `budget_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`budgetVersionId` int NOT NULL,
	`wbsNodeId` int,
	`code` varchar(48) NOT NULL,
	`description` varchar(240) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unitPrice` decimal(14,2) NOT NULL,
	`source` varchar(80),
	`referencePeriod` varchar(20),
	`compositionNote` text,
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
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_budgetVersionId_budget_versions_id_fk` FOREIGN KEY (`budgetVersionId`) REFERENCES `budget_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_items` ADD CONSTRAINT `budget_items_wbsNodeId_wbs_nodes_id_fk` FOREIGN KEY (`wbsNodeId`) REFERENCES `wbs_nodes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_versions` ADD CONSTRAINT `budget_versions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `budget_versions` ADD CONSTRAINT `budget_versions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `budget_items_version_idx` ON `budget_items` (`budgetVersionId`);--> statement-breakpoint
CREATE INDEX `budget_versions_project_idx` ON `budget_versions` (`projectId`);