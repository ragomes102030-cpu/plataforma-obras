-- As 23 triggers de `updatedAt`.
--
-- O schema usava `onUpdateNow()`, que o drizzle traduz para
-- `ON UPDATE CURRENT_TIMESTAMP`: um recurso do MySQL. O PostgreSQL nao tem
-- equivalente — o `DEFAULT now()` do baseline vale no INSERT e a coluna fica
-- parada depois. A unica forma de reproduzir o comportamento e trigger.
--
-- Uma funcao para as 23. Com uma por tabela, a primeira que alguem editasse
-- deixaria as outras 22 erradas em silencio.
--
-- A lista vem do schema: sao as tabelas cujo bloco declara
-- `updatedAt: timestamp(...)`. Nenhuma tabela foi escolhida a mao.

CREATE OR REPLACE FUNCTION "set_updated_at"() RETURNS trigger AS $$
BEGIN
	NEW."updatedAt" := now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "trg_users_updated_at"
	BEFORE UPDATE ON "users"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_projects_updated_at"
	BEFORE UPDATE ON "projects"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_project_mcp_integrations_updated_at"
	BEFORE UPDATE ON "project_mcp_integrations"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_project_plan_versions_updated_at"
	BEFORE UPDATE ON "project_plan_versions"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_mcp_mutation_operations_updated_at"
	BEFORE UPDATE ON "mcp_mutation_operations"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_mcp_homologation_runs_updated_at"
	BEFORE UPDATE ON "mcp_homologation_runs"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_schedule_activities_updated_at"
	BEFORE UPDATE ON "schedule_activities"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_wbs_nodes_updated_at"
	BEFORE UPDATE ON "wbs_nodes"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_planning_resources_updated_at"
	BEFORE UPDATE ON "planning_resources"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_production_fronts_updated_at"
	BEFORE UPDATE ON "production_fronts"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_production_teams_updated_at"
	BEFORE UPDATE ON "production_teams"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_production_entries_updated_at"
	BEFORE UPDATE ON "production_entries"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_budget_versions_updated_at"
	BEFORE UPDATE ON "budget_versions"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_budget_items_updated_at"
	BEFORE UPDATE ON "budget_items"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_price_catalogs_updated_at"
	BEFORE UPDATE ON "price_catalogs"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_price_items_updated_at"
	BEFORE UPDATE ON "price_items"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_service_compositions_updated_at"
	BEFORE UPDATE ON "service_compositions"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_llm_provider_settings_updated_at"
	BEFORE UPDATE ON "llm_provider_settings"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_agent_project_states_updated_at"
	BEFORE UPDATE ON "agent_project_states"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_agent_findings_updated_at"
	BEFORE UPDATE ON "agent_findings"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_agent_memories_updated_at"
	BEFORE UPDATE ON "agent_memories"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_agent_runs_updated_at"
	BEFORE UPDATE ON "agent_runs"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "trg_work_calendars_updated_at"
	BEFORE UPDATE ON "work_calendars"
	FOR EACH ROW
	EXECUTE FUNCTION "set_updated_at"();
