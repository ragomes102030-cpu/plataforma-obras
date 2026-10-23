-- Marco de cronograma: atividade de data única (entrega de projeto, aprovação,
-- virada de fase). Em vez de barra, aparece como losango no Gantt.
--
-- `durationDays` continua >= 1: o CHECK `schedule_activities_duration_positive`
-- e o CPM raciocinam em dias úteis. Este campo é que diz "esta atividade é um
-- ponto", e quem desenha (Gantt, planilha, Linha de Balanço) é que achata a
-- duração na leitura. Nada de dado existente muda: o default é falso.
--
-- Idempotente de propósito: pode rodar duas vezes sem quebrar.
ALTER TABLE "schedule_activities"
  ADD COLUMN IF NOT EXISTS "is_milestone" boolean DEFAULT false NOT NULL;
