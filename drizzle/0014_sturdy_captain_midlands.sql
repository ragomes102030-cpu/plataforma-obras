ALTER TABLE `budget_items` ADD `compositionId` int;--> statement-breakpoint
ALTER TABLE `budget_items` ADD `compositionUnitCost` decimal(14,2);--> statement-breakpoint
ALTER TABLE `budget_items` ADD `productivity` decimal(14,3);--> statement-breakpoint
ALTER TABLE `budget_items` ADD `plannedDurationDays` int;