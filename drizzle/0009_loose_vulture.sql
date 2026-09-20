CREATE TABLE `llm_provider_settings` (
	`id` int NOT NULL,
	`encryptedConfig` text NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_provider_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `llm_provider_settings` ADD CONSTRAINT `llm_provider_settings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;