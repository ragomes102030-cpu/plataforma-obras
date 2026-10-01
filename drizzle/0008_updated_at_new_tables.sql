CREATE TRIGGER "trg_project_documents_updated_at"
BEFORE UPDATE ON "project_documents"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();

--> statement-breakpoint
CREATE TRIGGER "trg_arquimedes_capabilities_updated_at"
BEFORE UPDATE ON "arquimedes_capabilities"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();
