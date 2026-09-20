CREATE TABLE IF NOT EXISTS `llm_provider_settings` (
	`id` int NOT NULL,
	`encryptedConfig` text NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_provider_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
SET @llm_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'llm_provider_settings'
    AND CONSTRAINT_NAME = 'llm_provider_settings_updatedBy_users_id_fk'
);
--> statement-breakpoint
SET @llm_fk_sql = IF(
  @llm_fk_exists = 0,
  'ALTER TABLE `llm_provider_settings` ADD CONSTRAINT `llm_provider_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action',
  'SELECT 1'
);
--> statement-breakpoint
PREPARE llm_fk_stmt FROM @llm_fk_sql;
--> statement-breakpoint
EXECUTE llm_fk_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE llm_fk_stmt;
