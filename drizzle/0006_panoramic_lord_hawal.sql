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
ALTER TABLE `mcp_mutation_operations` ADD CONSTRAINT `mcp_mutation_operations_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcp_mutation_operations` ADD CONSTRAINT `mcp_mutation_operations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mcp_mutation_operations_project_idx` ON `mcp_mutation_operations` (`projectId`);--> statement-breakpoint
CREATE INDEX `mcp_mutation_operations_user_idx` ON `mcp_mutation_operations` (`userId`);