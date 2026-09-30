ALTER TABLE wbs_nodes
  ALTER COLUMN "plannedQuantity" TYPE numeric(14,3)
  USING "plannedQuantity"::numeric(14,3);

ALTER TABLE wbs_nodes
  ADD COLUMN "description" text,
  ADD COLUMN "inclusions" text,
  ADD COLUMN "exclusions" text,
  ADD COLUMN "location" varchar(180),
  ADD COLUMN "responsible" varchar(180),
  ADD COLUMN "acceptanceCriteria" text,
  ADD COLUMN "scopeStatus" varchar(24) DEFAULT 'rascunho' NOT NULL;
