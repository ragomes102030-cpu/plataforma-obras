UPDATE `wbs_nodes` child
INNER JOIN `wbs_nodes` parent
  ON parent.`projectId` = child.`projectId`
 AND parent.`code` = SUBSTRING_INDEX(child.`code`, '.', LENGTH(child.`code`) - LENGTH(REPLACE(child.`code`, '.', '')))
SET child.`parentId` = parent.`id`
WHERE child.`parentId` IS NULL
  AND child.`code` LIKE '%.%';--> statement-breakpoint
UPDATE `schedule_activities` activity
INNER JOIN `wbs_nodes` node
  ON node.`projectId` = activity.`projectId`
 AND node.`code` = activity.`wbsCode`
SET activity.`wbsNodeId` = node.`id`, activity.`eapRef` = node.`code`
WHERE activity.`wbsNodeId` IS NULL;--> statement-breakpoint
ALTER TABLE `schedule_activities` MODIFY COLUMN `wbsNodeId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `schedule_activities` ADD CONSTRAINT `schedule_activities_wbsNodeId_wbs_nodes_id_fk` FOREIGN KEY (`wbsNodeId`) REFERENCES `wbs_nodes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wbs_nodes` ADD CONSTRAINT `wbs_nodes_parentId_wbs_nodes_id_fk` FOREIGN KEY (`parentId`) REFERENCES `wbs_nodes`(`id`) ON DELETE restrict ON UPDATE no action;
