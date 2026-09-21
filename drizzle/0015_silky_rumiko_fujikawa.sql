CREATE TABLE `activity_resource_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`resourceId` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL DEFAULT '1',
	`productivity` decimal(14,3),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_resource_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_resource_unique_idx` UNIQUE(`activityId`,`resourceId`)
);
--> statement-breakpoint
CREATE TABLE `planning_resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`resourceType` enum('mao_de_obra','equipamento','material') NOT NULL,
	`unit` varchar(32) NOT NULL,
	`capacityPerDay` decimal(14,3),
	`costPerDay` decimal(14,2),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `planning_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD `plannedQuantity` decimal(14,3);--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD `productivity` decimal(14,3);--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD `budgetItemId` int;--> statement-breakpoint
ALTER TABLE `activity_resource_allocations` ADD CONSTRAINT `activity_resource_allocations_activityId_schedule_activities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_resource_allocations` ADD CONSTRAINT `activity_resource_allocations_resourceId_planning_resources_id_fk` FOREIGN KEY (`resourceId`) REFERENCES `planning_resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `planning_resources` ADD CONSTRAINT `planning_resources_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `activity_resource_activity_idx` ON `activity_resource_allocations` (`activityId`);