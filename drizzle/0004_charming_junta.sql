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
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_frontId_production_fronts_id_fk` FOREIGN KEY (`frontId`) REFERENCES `production_fronts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_teamId_production_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `production_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_unitId_production_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `production_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_activityId_schedule_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_entries` ADD CONSTRAINT `production_entries_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_fronts` ADD CONSTRAINT `production_fronts_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_teams` ADD CONSTRAINT `production_teams_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `production_units` ADD CONSTRAINT `production_units_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;