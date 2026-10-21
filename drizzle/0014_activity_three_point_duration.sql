-- Duracao em tres pontos (otimista / mais provavel / pessimista).
--
-- `durationDays` continua sendo a duracao que o CPM usa: e o mais provavel.
-- As duas colunas novas sao OPCIONAIS e existem para o Monte Carlo ter uma
-- faixa declarada pelo planejador, em vez de derivar a dispersao de um
-- percentual unico (25%) aplicado a todas as atividades.
--
-- Nulo significa "nao declarado": a simulacao cai no percentual de incerteza
-- do painel. Nao gravamos otimista = pessimista para atividade sem risco
-- conhecido, porque isso seria afirmar certeza que nao existe.
--
-- DUAS DECISOES DE FORMA, e as duas sao para o runner:
--
-- 1. Uma coluna por ALTER. O verificador de retry olha o PRIMEIRO alvo do
--    statement; com `ADD COLUMN a, ADD COLUMN b` no mesmo comando, uma
--    aplicacao interrompida entre as duas deixaria o verificador convencido de
--    que a migracao inteira ja entrou.
-- 2. Sem comentario imediatamente acima do ALTER. O reconhecedor casa
--    `^\s*ALTER`, e uma linha de comentario antes faz o alvo virar nulo — o
--    statement passa a rodar sem conferencia e quebra no retry com
--    "constraint already exists".
--
-- O CHECK existe porque a faixa tem de conter o mais provavel. Sem isso o
-- triangulo recebe moda fora de [min, max] e o sorteio degenera: a atividade
-- passa a ter sempre o mesmo valor, com aparencia de risco zero.
ALTER TABLE "schedule_activities" ADD COLUMN "durationOptimisticDays" integer;--> statement-breakpoint
ALTER TABLE "schedule_activities" ADD COLUMN "durationPessimisticDays" integer;--> statement-breakpoint
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_three_point_positive" CHECK (
  ("durationOptimisticDays" IS NULL OR "durationOptimisticDays" >= 1)
  AND ("durationPessimisticDays" IS NULL OR "durationPessimisticDays" >= 1)
);--> statement-breakpoint
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_three_point_window" CHECK (
  "durationOptimisticDays" IS NULL
  OR "durationPessimisticDays" IS NULL
  OR (
    "durationOptimisticDays" <= "durationDays"
    AND "durationDays" <= "durationPessimisticDays"
  )
);
