ALTER TABLE "schedule_activities"
  ADD COLUMN IF NOT EXISTS "physicalWeight" numeric(9,6),
  ADD COLUMN IF NOT EXISTS "physicalWeightApprovedAt" timestamptz;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "schedule_activities"
    ADD CONSTRAINT "schedule_activities_physical_weight_positive"
    CHECK ("physicalWeight" IS NULL OR "physicalWeight" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
