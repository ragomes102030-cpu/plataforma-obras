DROP INDEX IF EXISTS "wbs_nodes_project_external_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "wbs_nodes_project_code_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "wbs_nodes_project_external_idx" ON "wbs_nodes" USING btree ("projectId","versionId","externalId");
--> statement-breakpoint
CREATE UNIQUE INDEX "wbs_nodes_project_code_unique_idx" ON "wbs_nodes" USING btree ("projectId","versionId","code");
--> statement-breakpoint
DROP INDEX IF EXISTS "schedule_activities_project_external_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_activities_project_external_idx" ON "schedule_activities" USING btree ("projectId","versionId","externalId");
--> statement-breakpoint
DROP INDEX IF EXISTS "schedule_dependencies_project_external_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_dependencies_project_external_idx" ON "schedule_dependencies" USING btree ("projectId","versionId","externalId");
