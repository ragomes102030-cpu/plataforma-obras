ALTER TABLE `schedule_activities` ADD COLUMN `mustStartOn` timestamp NULL;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD COLUMN `finishNoLaterThan` timestamp NULL;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD COLUMN `freeFloat` int;--> statement-breakpoint
CREATE TABLE `work_calendars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`weekPattern` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_calendars_id` PRIMARY KEY(`id`),
	CONSTRAINT `work_calendars_projectId_unique` UNIQUE(`projectId`)
);
--> statement-breakpoint
ALTER TABLE `work_calendars` ADD CONSTRAINT `work_calendars_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `work_calendars_projectId_idx` ON `work_calendars` (`projectId`);--> statement-breakpoint
CREATE TABLE `calendar_exceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`calendarId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`type` enum('working','national_holiday','facultative','observance') NOT NULL,
	`name` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendar_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `calendar_exceptions` ADD CONSTRAINT `calendar_exceptions_calendarId_work_calendars_id_fk` FOREIGN KEY (`calendarId`) REFERENCES `work_calendars`(`id`) ON DELETE CASCADE ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `calendar_exceptions_calendarId_idx` ON `calendar_exceptions` (`calendarId`);
