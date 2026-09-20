ALTER TABLE `schedule_activities` ADD `externalId` varchar(180);--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD `eapRef` varchar(180);--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD `externalId` varchar(180);--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD `externalId` varchar(180);--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD `externalUid` varchar(180);--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_project_external_idx` UNIQUE(`projectId`,`externalId`);--> statement-breakpoint
ALTER TABLE `schedule_dependencies` ADD CONSTRAINT `schedule_dependencies_project_external_idx` UNIQUE(`projectId`,`externalId`);--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD CONSTRAINT `wbs_nodes_project_external_idx` UNIQUE(`projectId`,`externalId`);--> statement-breakpoint
CREATE INDEX `schedule_activities_project_idx` ON `schedule_activities` (`projectId`);--> statement-breakpoint
CREATE INDEX `wbs_nodes_project_idx` ON `wbs_nodes` (`projectId`);