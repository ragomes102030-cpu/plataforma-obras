ALTER TABLE wbs_nodes
  ADD COLUMN "decompositionBasis" varchar(32);

--> statement-breakpoint
UPDATE wbs_nodes
SET "decompositionBasis" = CASE
  WHEN "parentId" IS NULL THEN 'project'
  ELSE 'deliverable'
END
WHERE "decompositionBasis" IS NULL;
