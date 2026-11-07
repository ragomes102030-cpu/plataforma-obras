-- Diagnóstico detalhado de parcelas LOB para os MVPs (SOMENTE LEITURA).
-- Confere o início registrado nas parcelas com a rede CPM, sem tentar
-- recalcular ou deslocar datas, sem escrever no banco e sem tocar na baseline.
-- O campo earlyStart representa deslocamento CPM em dias úteis; não somar
-- diretamente a uma data calendário para concluir se há divergência de dias.
WITH obras AS (
  SELECT p.id AS project_id, p.name, p.code, p."plannedStart"::date AS inicio_obra,
         (SELECT v.id FROM public.project_plan_versions v
          WHERE v."projectId" = p.id AND v.status::text = 'approved'
          ORDER BY v."versionNumber" DESC LIMIT 1) AS versao
    FROM public.projects p
   WHERE (p.id = 7 AND p.code = 'OB-PUPOCN')
      OR (p.id = 25 AND p.code = 'OB-TFECKQ')
),
parcelas AS (
  SELECT o.project_id, o.code, o.name, o.versao, o.inicio_obra,
         a.id AS atividade_id, a."earlyStart" AS inicio_cpm_dias_uteis,
         l."startDate"::date AS inicio_parcela,
         l."activityId" AS atividade_referenciada
    FROM obras o
    JOIN public.lob_activity_locations l
      ON l."projectId" = o.project_id AND l."versionId" = o.versao
    LEFT JOIN public.schedule_activities a
      ON a.id = l."activityId" AND a."projectId" = o.project_id
     AND a."versionId" = o.versao
)
SELECT project_id, code, name, versao, atividade_referenciada,
       atividade_id, inicio_obra, inicio_cpm_dias_uteis, inicio_parcela,
       CASE
         WHEN atividade_id IS NULL THEN 'ORFA: atividade inexistente na versao aprovada'
         WHEN inicio_parcela IS NULL THEN 'ERRO: parcela sem inicio'
         WHEN inicio_cpm_dias_uteis > 0 AND inicio_parcela = inicio_obra
           THEN 'SUSPEITA: inicio no dia zero apesar de CPM posterior'
         ELSE 'REVISAR: compatibilidade com calendario e sequenciamento'
       END AS achado
  FROM parcelas
 ORDER BY project_id, atividade_referenciada, inicio_parcela;
