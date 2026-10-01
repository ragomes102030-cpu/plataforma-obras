ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deletedAtBy" INTEGER REFERENCES "users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_owner_deleted_idx" ON "projects" ("ownerUserId", "deletedAt");
