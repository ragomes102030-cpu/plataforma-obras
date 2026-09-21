ALTER TABLE `schedule_activities` ADD `wbsNodeId` int;--> statement-breakpoint
CREATE INDEX `schedule_activities_wbs_node_idx` ON `schedule_activities` (`wbsNodeId`);
UPDATE `schedule_activities` AS activity
INNER JOIN `wbs_nodes` AS node
  ON node.`projectId` = activity.`projectId`
 AND node.`code` = activity.`wbsCode`
SET activity.`wbsNodeId` = node.`id`
WHERE activity.`wbsNodeId` IS NULL;--> statement-breakpoint
ALTER TABLE `schedule_activities`
  ADD CONSTRAINT `schedule_activities_wbsNodeId_wbs_nodes_id_fk`
  FOREIGN KEY (`wbsNodeId`) REFERENCES `wbs_nodes`(`id`)
  ON DELETE SET NULL ON UPDATE NO ACTION;
