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
ALTER TABLE `agent_run_events` ADD CONSTRAINT `agent_run_events_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_run_events` ADD CONSTRAINT `agent_run_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agent_run_events_request_idx` ON `agent_run_events` (`requestId`);--> statement-breakpoint
CREATE INDEX `agent_run_events_project_idx` ON `agent_run_events` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_run_events_user_idx` ON `agent_run_events` (`userId`);--> statement-breakpoint
CREATE INDEX `agent_runs_project_idx` ON `agent_runs` (`projectId`);--> statement-breakpoint
CREATE INDEX `agent_runs_user_idx` ON `agent_runs` (`userId`);--> statement-breakpoint
CREATE INDEX `agent_runs_status_idx` ON `agent_runs` (`status`);