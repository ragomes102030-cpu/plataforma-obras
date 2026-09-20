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
ALTER TABLE `project_mcp_integrations` ADD CONSTRAINT `project_mcp_integrations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_mcp_integrations_project_idx` ON `project_mcp_integrations` (`projectId`);