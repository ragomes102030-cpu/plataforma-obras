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
ALTER TABLE `schedule_baseline_items` ADD CONSTRAINT `schedule_baseline_items_baselineId_schedule_baselines_id_fk` FOREIGN KEY (`baselineId`) REFERENCES `schedule_baselines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baseline_items` ADD CONSTRAINT `schedule_baseline_items_activityId_schedule_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baselines` ADD CONSTRAINT `schedule_baselines_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_baselines` ADD CONSTRAINT `schedule_baselines_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `schedule_baseline_items_baseline_idx` ON `schedule_baseline_items` (`baselineId`);