ALTER TABLE "budget_items"
  ADD COLUMN IF NOT EXISTS "quantityEvidence" text,
  ADD COLUMN IF NOT EXISTS "quantityEvidenceStatus" varchar(16) NOT NULL DEFAULT 'pendente';
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_items"
    ADD CONSTRAINT "budget_items_quantity_evidence_status_check"
    CHECK ("quantityEvidenceStatus" IN ('pendente', 'cenario', 'validada'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
