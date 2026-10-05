ALTER TABLE public.schedule_activities
  ADD CONSTRAINT schedule_activities_duration_positive
  CHECK ("durationDays" > 0);