CREATE TABLE `schedule_dependencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`predecessorId` int NOT NULL,
	`successorId` int NOT NULL,
	`type` enum('FS','SS','FF','SF') NOT NULL DEFAULT 'FS',
	`lag` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_dependencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wbs_nodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`parentId` int,
	`code` varchar(32) NOT NULL,
	`name` varchar(220) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`nodeType` enum('grupo','pacote','entrega') NOT NULL DEFAULT 'pacote',
	`unit` varchar(32),
	`plannedQuantity` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wbs_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_predecessorId_schedule_activities_id_fk` FOREIGN KEY (`predecessorId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_successorId_schedule_activities_id_fk` FOREIGN KEY (`successorId`) REFERENCES `schedule_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD CONSTRAINT `wbs_nodes_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;