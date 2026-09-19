CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`location` varchar(180) NOT NULL,
	`status` enum('Em execução','Planejamento','Concluída','Em risco') NOT NULL DEFAULT 'Planejamento',
	`progress` int NOT NULL DEFAULT 0,
	`plannedStart` timestamp NOT NULL,
	`plannedFinish` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `schedule_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`wbsCode` varchar(32) NOT NULL,
	`name` varchar(220) NOT NULL,
	`phase` varchar(80) NOT NULL,
	`startOffset` int NOT NULL,
	`durationDays` int NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`status` enum('Não iniciado','Em andamento','Concluído','Em risco') NOT NULL DEFAULT 'Não iniciado',
	`critical` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;