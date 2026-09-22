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
ALTER TABLE `agent_findings` ADD `resolvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `agent_findings` ADD `resolvedBy` int;--> statement-breakpoint
ALTER TABLE `agent_findings` ADD `resolutionNote` text;--> statement-breakpoint
ALTER TABLE `budget_items` ADD `isPriceException` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `baseReferencia` enum('SEINFRA','SINAPI','PROPRIA');--> statement-breakpoint
ALTER TABLE `projects` ADD `baseReferenciaRef` varchar(20);--> statement-breakpoint
ALTER TABLE `project_audit_events` ADD CONSTRAINT `project_audit_events_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_audit_events` ADD CONSTRAINT `project_audit_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_audit_events_project_idx` ON `project_audit_events` (`projectId`,`action`);--> statement-breakpoint
ALTER TABLE `agent_findings` ADD CONSTRAINT `agent_findings_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;