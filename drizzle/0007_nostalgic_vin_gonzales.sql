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
ALTER TABLE `mcp_homologation_runs` ADD CONSTRAINT `mcp_homologation_runs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_homologation_runs` ADD CONSTRAINT `mcp_homologation_runs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mcp_homologation_runs_project_idx` ON `mcp_homologation_runs` (`projectId`);--> statement-breakpoint
CREATE INDEX `mcp_homologation_runs_user_idx` ON `mcp_homologation_runs` (`userId`);