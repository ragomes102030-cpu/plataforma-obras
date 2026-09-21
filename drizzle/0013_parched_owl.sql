CREATE TABLE `composition_components` (
	`id` int AUTO_INCREMENT NOT NULL,
	`compositionId` int NOT NULL,
	`priceItemId` int NOT NULL,
	`componentType` enum('material','mao_de_obra','equipamento') NOT NULL,
	`coefficient` decimal(14,6) NOT NULL,
	`unitPriceSnapshot` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `composition_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `composition_components_unique_idx` UNIQUE(`compositionId`,`priceItemId`)
);
--> statement-breakpoint
CREATE TABLE `price_catalogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`sourceType` enum('propria','SINAPI','SEINFRA','fornecedor') NOT NULL,
	`state` varchar(2),
	`referencePeriod` varchar(20) NOT NULL,
	`status` enum('ativo','arquivado') NOT NULL DEFAULT 'ativo',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_catalogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`catalogId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`description` varchar(240) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`itemType` enum('material','mao_de_obra','equipamento','servico') NOT NULL,
	`unitPrice` decimal(14,2) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_items_catalog_code_idx` UNIQUE(`catalogId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `service_compositions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`description` varchar(240) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`sourceCatalogId` int,
	`referencePeriod` varchar(20),
	`status` enum('rascunho','validada','arquivada') NOT NULL DEFAULT 'rascunho',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_compositions_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_compositions_code_idx` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `composition_components` ADD CONSTRAINT `composition_components_compositionId_service_compositions_id_fk` FOREIGN KEY (`compositionId`) REFERENCES `service_compositions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `composition_components` ADD CONSTRAINT `composition_components_priceItemId_price_items_id_fk` FOREIGN KEY (`priceItemId`) REFERENCES `price_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_catalogs` ADD CONSTRAINT `price_catalogs_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_items` ADD CONSTRAINT `price_items_catalogId_price_catalogs_id_fk` FOREIGN KEY (`catalogId`) REFERENCES `price_catalogs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_compositions` ADD CONSTRAINT `service_compositions_sourceCatalogId_price_catalogs_id_fk` FOREIGN KEY (`sourceCatalogId`) REFERENCES `price_catalogs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_compositions` ADD CONSTRAINT `service_compositions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `composition_components_composition_idx` ON `composition_components` (`compositionId`);--> statement-breakpoint
CREATE INDEX `price_catalogs_reference_idx` ON `price_catalogs` (`referencePeriod`);--> statement-breakpoint
CREATE INDEX `price_items_catalog_idx` ON `price_items` (`catalogId`);--> statement-breakpoint
CREATE INDEX `service_compositions_source_idx` ON `service_compositions` (`sourceCatalogId`);