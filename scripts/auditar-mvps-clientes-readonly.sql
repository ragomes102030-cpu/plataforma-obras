-- Auditoria somente-leitura: MVP Escola (25) e AURORA (7).
-- Executar no SQL Editor do Supabase / base oficial. Nenhum INSERT/UPDATE/DELETE.
-- Uma versão approved não é homologação comercial. O resultado identifica
-- divergências LOB, orçamento fictício, produção real e medição.
WITH targets AS (
  SELECT p.id AS project_id, p.code, p.name,
    (SELECT id FROM public.project_plan_versions v
      WHERE v."projectId" = p.id AND v.status::text = 'approved'
      ORDER BY v."versionNumber" DESC LIMIT 1) AS approved_version_id,
    p."plannedStart"::date AS project_start
  FROM public.projects p
  WHERE (p.id = 7 AND p.code = 'OB-PUPOCN')
     OR (p.id = 25 AND p.code = 'OB-TFECKQ')
), checks AS (
  SELECT t.project_id, t.code, t.name, t.approved_version_id,
    (SELECT COUNT(*) FROM public.wbs_nodes w
      WHERE w."projectId" = t.project_id AND w."versionId" = t.approved_version_id) AS eap_nodes,
    (SELECT COUNT(*) FROM public.schedule_activities a
      WHERE a."projectId" = t.project_id AND a."versionId" = t.approved_version_id AND a.exemplo = 0) AS real_activities,
    (SELECT COUNT(*) FROM public.schedule_activities a
      WHERE a."projectId" = t.project_id AND a."versionId" = t.approved_version_id AND a.exemplo = 1) AS example_activities,
    (SELECT COUNT(*) FROM public.schedule_dependencies d
      WHERE d."projectId" = t.project_id AND d."versionId" = t.approved_version_id) AS dependencies,
    (SELECT COUNT(*) FROM public.schedule_baselines b
      WHERE b."projectId" = t.project_id AND b.status::text = 'ativa') AS active_baselines,
    (SELECT COUNT(*) FROM public.lob_activity_locations l
      WHERE l."projectId" = t.project_id AND l."versionId" = t.approved_version_id) AS lob_segments,
    (SELECT COUNT(*) FROM public.lob_activity_locations l
      JOIN public.schedule_activities a ON a.id = l."activityId"
      WHERE l."projectId" = t.project_id AND l."versionId" = t.approved_version_id
        AND a."projectId" = t.project_id AND a."versionId" = t.approved_version_id
        AND a."earlyStart" > 0 AND l."startDate"::date = t.project_start
    ) AS lob_segments_collapsed_at_day_zero,
    (SELECT COUNT(*) FROM (
      SELECT l."activityId" FROM public.lob_activity_locations l
      WHERE l."projectId" = t.project_id AND l."versionId" = t.approved_version_id
      GROUP BY l."activityId" HAVING COUNT(*) > 1 AND COUNT(DISTINCT l."startDate") = 1
    ) x) AS repeated_activities_without_start_lag,
    (SELECT COUNT(*) FROM public.budget_items bi
      JOIN public.budget_versions b ON b.id = bi."budgetVersionId"
      WHERE b."projectId" = t.project_id AND b.status::text = 'aprovado'
        AND (bi.source ILIKE '%didatic%' OR bi.source ILIKE '%rateio uniforme%')
    ) AS didactic_budget_items,
    (SELECT COUNT(*) FROM public.measurements m
      WHERE m."projectId" = t.project_id) AS measurements,
    (SELECT COUNT(*) FROM public.production_entries pe
      WHERE pe."projectId" = t.project_id AND pe.exemplo = 0
        AND pe.status::text = 'confirmada') AS real_production_entries,
    (SELECT COUNT(*) FROM public.production_entries pe
      WHERE pe."projectId" = t.project_id AND pe.exemplo = 1
        AND pe.status::text = 'confirmada') AS example_production_entries
  FROM targets t
)
SELECT *,
  CASE WHEN approved_version_id IS NULL OR active_baselines <> 1
    THEN 'BLOQUEADO: versao/baseline'
    WHEN eap_nodes = 0 OR real_activities = 0 OR dependencies = 0
    THEN 'BLOQUEADO: fluxo de planejamento incompleto'
    WHEN lob_segments_collapsed_at_day_zero > 0
    THEN 'BLOQUEADO: parcelas da LOB contradizem a rede CPM'
    WHEN repeated_activities_without_start_lag > 0
    THEN 'PENDENTE: validar cadencia entre locais'
    WHEN didactic_budget_items > 0
    THEN 'PENDENTE: orcamento apenas didatico'
    WHEN measurements = 0
    THEN 'PENDENTE: sem medicao para o fluxo completo'
    ELSE 'CANDIDATA A HOMOLOGACAO: revisar calculos MCP e interface'
  END AS etapa_de_aceite,
  (approved_version_id IS NOT NULL AND active_baselines = 1
    AND eap_nodes > 0 AND real_activities > 0 AND dependencies > 0
    AND lob_segments_collapsed_at_day_zero = 0
    AND repeated_activities_without_start_lag = 0
    AND didactic_budget_items = 0 AND measurements > 0
  ) AS elegivel_a_revisao_final
FROM checks ORDER BY project_id;
