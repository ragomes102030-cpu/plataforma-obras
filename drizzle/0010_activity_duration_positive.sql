-- CHECK de duracao positiva em schedule_activities.
--
-- Ja existe no banco: foi aplicado como migration activity_duration_positive
-- (version 20261005180621) via Supabase, mas nunca teve arquivo neste repo. O
-- journal do Drizzle nao a conhecia, e o codigo declara o CHECK em
-- drizzle/schema.ts. Versiona-la aqui fecha essa lacuna.
--
-- Sem DROP previo: o verificador por statement do migrate-core-pg confere a
-- existencia da constraint no catalogo (information_schema.table_constraints,
-- que inclui CHECK) e pula o statement quando ela ja existe. O DROP existiria
-- so para permitir reaplicacao manual, e custaria um alvo de DDL nao
-- verificavel.
ALTER TABLE "schedule_activities"
  ADD CONSTRAINT "schedule_activities_duration_positive"
  CHECK ("durationDays" > 0);
