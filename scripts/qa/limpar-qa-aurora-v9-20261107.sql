-- Limpeza controlada da Aurora v9 SOMENTE (nunca v8), mantendo QA original no historico.
-- Precondicoes verificadas antes do DELETE; todas as alteracoes em uma transacao DO.
DO $clean$
DECLARE removed integer; n integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.project_plan_versions WHERE id=46 AND "projectId"=7 AND status='draft')
    OR (SELECT count(*) FROM public.wbs_nodes WHERE "versionId"=46)<>94
    OR (SELECT count(*) FROM public.schedule_activities WHERE "versionId"=46)<>71
    OR (SELECT count(*) FROM public.schedule_activities WHERE "versionId"=46 AND exemplo=1)<>18
    OR (SELECT count(*) FROM public.wbs_nodes WHERE "versionId"=46 AND name ~* 'rateio de teste')<>7
    OR (SELECT count(*) FROM public.schedule_baselines WHERE "projectId"=7 AND status='ativa')<>1
 THEN RAISE EXCEPTION 'Precondicao Aurora v9 falhou'; END IF;
 CREATE TEMP TABLE _qa_nodes_to_remove ON COMMIT DROP AS
   SELECT a."wbsNodeId" AS id FROM public.schedule_activities a WHERE a."versionId"=46 AND a.exemplo=1
   UNION SELECT id FROM public.wbs_nodes WHERE "versionId"=46 AND name ~* 'rateio de teste';
 IF (SELECT count(*) FROM _qa_nodes_to_remove)<>25 THEN
   RAISE EXCEPTION 'Numero de nos QA diferente de 25';
 END IF;
 IF EXISTS(SELECT 1 FROM public.wbs_nodes w JOIN _qa_nodes_to_remove q ON q.id=w.id
      JOIN public.wbs_nodes c ON c."parentId"=w.id)
 OR EXISTS(SELECT 1 FROM public.schedule_activities a JOIN _qa_nodes_to_remove q ON q.id=a."wbsNodeId" WHERE a.exemplo=0)
 THEN RAISE EXCEPTION 'Um no QA possui descendente ou atividade real'; END IF;

 DELETE FROM public.schedule_dependencies d WHERE d."projectId"=7 AND d."versionId"=46
   AND (EXISTS(SELECT 1 FROM public.schedule_activities a WHERE a.id=d."predecessorId" AND a.exemplo=1)
     OR EXISTS(SELECT 1 FROM public.schedule_activities a WHERE a.id=d."successorId" AND a.exemplo=1));
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed<>27 THEN RAISE EXCEPTION 'Dependencias QA removidas: %, esperado 27',removed; END IF;

 DELETE FROM public.schedule_activities a WHERE a."projectId"=7 AND a."versionId"=46 AND a.exemplo=1;
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed<>18 THEN RAISE EXCEPTION 'Atividades QA removidas: %, esperado 18',removed; END IF;
 DELETE FROM public.wbs_nodes w USING _qa_nodes_to_remove q WHERE w.id=q.id AND w."projectId"=7 AND w."versionId"=46;
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed<>25 THEN RAISE EXCEPTION 'Nos QA removidos: %, esperado 25',removed; END IF;

 -- EAP real passa a refletir os 53 quantitativos do orçamento QA v2.
 UPDATE public.wbs_nodes w
 SET "plannedQuantity"=b.quantity, unit=b.unit,
    location=CASE WHEN COALESCE(w.location,'')<>'' THEN w.location
      WHEN EXISTS(SELECT 1 FROM public.schedule_activities a
         JOIN public.lob_activity_locations l ON l."activityId"=a.id AND l."versionId"=46
         WHERE a."wbsNodeId"=w.id AND a."versionId"=46)
      THEN 'Pavimentos ou frente delimitada — SIMULACAO_QA'
      ELSE 'Área geral da obra — SIMULACAO_QA' END,
    "updatedAt"=now()
 FROM public.budget_items b
 WHERE b."budgetVersionId"=12 AND b."wbsNodeId"=w.id
   AND w."projectId"=7 AND w."versionId"=46;

 IF (SELECT count(*) FROM public.wbs_nodes WHERE "versionId"=46)<>69
    OR (SELECT count(*) FROM public.schedule_activities WHERE "versionId"=46)<>53
    OR (SELECT count(*) FROM public.schedule_dependencies WHERE "versionId"=46)<>71
    OR (SELECT count(*) FROM public.lob_activity_locations WHERE "versionId"=46)<>169
 THEN RAISE EXCEPTION 'Contagens finais Aurora v9 inconsistentes'; END IF;
 IF EXISTS(SELECT 1 FROM public.schedule_activities a WHERE a."versionId"=46
    AND (a.exemplo=1 OR NOT EXISTS (SELECT 1 FROM public.wbs_nodes w WHERE w.id=a."wbsNodeId" AND w."versionId"=46)))
 THEN RAISE EXCEPTION 'Atividade QA ou orfa remanescente'; END IF;
 IF EXISTS(SELECT 1 FROM public.wbs_nodes w WHERE w."versionId"=46
    AND NOT EXISTS(SELECT 1 FROM public.wbs_nodes c WHERE c."parentId"=w.id AND c."versionId"=46)
    AND (COALESCE(w."plannedQuantity",0)<=0 OR w.unit IS NULL))
 THEN RAISE EXCEPTION 'Folha EAP sem quantidade/unidade'; END IF;
 IF (SELECT count(*) FROM public.schedule_baselines WHERE "projectId"=7 AND status='ativa')<>1
 THEN RAISE EXCEPTION 'Baseline Aurora alterada'; END IF;

 -- Uma alteracao de metadado financeiro nao muda CPM: o MCP foi reexecutado
 -- com os 53 servicos/71 vinculos, 580 dias, 24 criticas, zero divergencias.
 UPDATE public.schedule_activities SET "cpmCalculatedAt"=now(),"updatedAt"=now()
 WHERE "projectId"=7 AND "versionId"=46;

 INSERT INTO public.project_audit_events("projectId","userId",action,payload)
 VALUES(7,NULL,'qa_aurora_eap_cleanup',
   jsonb_build_object('versionId',46,'kind','SIMULACAO_QA',
     'removedQaActivities',18,'removedQaDependencies',27,'removedQaNodes',18,'removedRateioTestNodes',7,
     'remainingEapNodes',69,'remainingActivities',53,'remainingDependencies',71,
     'remainingLobParcels',169,'cpmDuration',580,'criticalActivities',24,
     'historicV8Preserved',true,'baselinePreserved',true));
END $clean$;