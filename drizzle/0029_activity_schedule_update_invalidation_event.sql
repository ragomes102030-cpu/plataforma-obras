ALTER TABLE "activity_schedule_updates"
  DROP CONSTRAINT IF EXISTS "activity_schedule_updates_status_valid";
--> statement-breakpoint
ALTER TABLE "activity_schedule_updates"
  ADD CONSTRAINT "activity_schedule_updates_status_valid"
  CHECK ("status" IN ('nao_iniciada', 'em_andamento', 'concluida', 'bloqueada', 'relato_invalidado'));
