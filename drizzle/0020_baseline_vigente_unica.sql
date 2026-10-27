-- Uma única baseline vigente por obra. Preserva TODAS as fotografias,
-- atividades e IDs históricos. Apenas altera o status das anteriores.
-- A mais recente (createdAt DESC, id DESC) continua vigente, igual à
-- referência automática usada pelo sistema antes desta migração.
--
-- Em projetos sem baseline ativa, não se ativa nenhuma por suposição.
WITH ordenadas AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "createdAt" DESC, id DESC
    ) AS ordem
  FROM "schedule_baselines"
  WHERE status = 'ativa'
)
UPDATE "schedule_baselines" AS b
SET status = 'arquivada'
FROM ordenadas AS o
WHERE b.id = o.id AND o.ordem > 1;
--> statement-breakpoint
-- Proteção permanente contra duplicação, inclusive em concorrência.
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_baselines_uma_ativa_por_obra_idx"
  ON "schedule_baselines" ("projectId")
  WHERE status = 'ativa';
