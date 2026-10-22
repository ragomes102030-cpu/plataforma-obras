-- schedule_baselines."versionId" nunca teve migration.
--
-- A coluna está em drizzle/schema.ts e é usada por planning.list desde que a
-- baseline passou a apontar para a versão do plano, mas nenhum arquivo desta
-- pasta a criava: em produção ela foi criada à mão. Consequência: um banco
-- novo, montado só pelas migrations, quebrava em `select ... "versionId" from
-- "schedule_baselines"` — a tela de baseline não abria, e nenhum teste pegava
-- porque as suítes rodavam contra uma cópia do banco de produção.
--
-- Idempotente de propósito: em produção a coluna já existe.
ALTER TABLE "schedule_baselines" ADD COLUMN IF NOT EXISTS "versionId" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_baselines_versionId_project_plan_versions_id_fk'
  ) THEN
    ALTER TABLE "schedule_baselines"
      ADD CONSTRAINT "schedule_baselines_versionId_project_plan_versions_id_fk"
      FOREIGN KEY ("versionId") REFERENCES "public"."project_plan_versions"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_baselines_plan_version_idx"
  ON "schedule_baselines" USING btree ("versionId");
