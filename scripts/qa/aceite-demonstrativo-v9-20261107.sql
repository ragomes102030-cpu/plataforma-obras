-- Aceite EXCLUSIVAMENTE DIDÁTICO dos dois MVPs fictícios.
-- A autorização do usuário no chat não constitui assinatura de engenheiro,
-- ART/RRT, aceite de obra, fiscalizacao contratual ou faturamento.
-- Atomico e idempotente por precondicoes: recusa nova execucao.
DO $qa_release$
#variable_conflict use_variable
DECLARE
  pid integer; planid integer; oldplan integer; newbudget integer; oldbudget integer;
  expected_nodes integer; expected_activities integer; expected_deps integer;
  expected_leaves integer; expected_parcels integer;
  owner_id integer; decision_id integer; oldbaseline integer; newbaseline integer;
  n integer; bad integer; amount numeric;
BEGIN
 FOR pid IN SELECT unnest(ARRAY[7,25]) LOOP
   planid:=CASE pid WHEN 7 THEN 46 ELSE 47 END;
   oldplan:=CASE pid WHEN 7 THEN 34 ELSE 43 END;
   newbudget:=CASE pid WHEN 7 THEN 12 ELSE 13 END;
   oldbudget:=CASE pid WHEN 7 THEN 4 ELSE 11 END;
   expected_nodes:=CASE pid WHEN 7 THEN 69 ELSE 37 END;
   expected_activities:=CASE pid WHEN 7 THEN 53 ELSE 30 END;
   expected_deps:=CASE pid WHEN 7 THEN 71 ELSE 39 END;
   expected_leaves:=CASE pid WHEN 7 THEN 53 ELSE 27 END;
   expected_parcels:=CASE pid WHEN 7 THEN 169 ELSE 20 END;

   SELECT "ownerUserId" INTO owner_id FROM public.projects WHERE id=pid;
   IF owner_id IS NULL THEN RAISE EXCEPTION 'Obra % sem titular; aprovação proibida',pid; END IF;
   IF (SELECT count(*) FROM public.project_plan_versions
       WHERE "projectId"=pid AND id=planid AND status='draft')<>1
     OR (SELECT count(*) FROM public.project_plan_versions
       WHERE "projectId"=pid AND id=oldplan AND status='approved')<>1
     OR (SELECT count(*) FROM public.budget_versions
       WHERE "projectId"=pid AND id=oldbudget AND status='aprovado')<>1
     OR (SELECT count(*) FROM public.budget_versions
       WHERE "projectId"=pid AND id=newbudget AND status='rascunho')<>1
     OR (SELECT count(*) FROM public.schedule_baselines
       WHERE "projectId"=pid AND status='ativa' AND "versionId"=oldplan)<>1
   THEN RAISE EXCEPTION 'Plano, orçamento ou baseline do projeto % mudou; abortar',pid; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.agent_decisions d
       WHERE d."projectId"=pid AND d.stage='EAP_DICIONARIO' AND d.decision='approved')
   THEN RAISE EXCEPTION 'Dicionario nao aprovado em %',pid; END IF;
   IF (SELECT count(*) FROM public.wbs_nodes w
       WHERE w."projectId"=pid AND w."versionId"=planid)<>expected_nodes
      OR (SELECT count(*) FROM public.schedule_activities a
       WHERE a."projectId"=pid AND a."versionId"=planid)<>expected_activities
      OR (SELECT count(*) FROM public.schedule_dependencies d
       WHERE d."projectId"=pid AND d."versionId"=planid)<>expected_deps
      OR (SELECT count(*) FROM public.lob_activity_locations l
       WHERE l."projectId"=pid AND l."versionId"=planid)<>expected_parcels
   THEN RAISE EXCEPTION 'Modelo incompleto %',pid; END IF;
   IF EXISTS(SELECT 1 FROM public.schedule_activities a
       WHERE a."projectId"=pid AND a."versionId"=planid
        AND (a.exemplo=1 OR a."earlyStart" IS NULL OR a."earlyFinish" IS NULL
          OR a."totalFloat" IS NULL OR a."cpmCalculatedAt" IS NULL
          OR a."cpmCalculatedAt"<a."updatedAt"))
   THEN RAISE EXCEPTION 'Atividade QA ou CPM desatualizado no projeto %',pid; END IF;

   SELECT count(*) INTO n FROM public.wbs_nodes w
       WHERE w."projectId"=pid AND w."versionId"=planid
       AND NOT EXISTS(SELECT 1 FROM public.wbs_nodes c
         WHERE c."parentId"=w.id AND c."versionId"=planid);
   IF n<>expected_leaves THEN RAISE EXCEPTION 'Folhas EAP % diferentes do esperado %',n,expected_leaves; END IF;
   IF EXISTS(SELECT 1 FROM public.wbs_nodes w
       WHERE w."projectId"=pid AND w."versionId"=planid
         AND NOT EXISTS(SELECT 1 FROM public.wbs_nodes c WHERE c."parentId"=w.id AND c."versionId"=planid)
         AND (coalesce(w."plannedQuantity",0)<=0 OR coalesce(trim(w.unit),'')=''
           OR coalesce(trim(w.description),'')='' OR coalesce(trim(w.inclusions),'')=''
           OR coalesce(trim(w.exclusions),'')='' OR coalesce(trim(w."acceptanceCriteria"),'')=''
           OR coalesce(trim(w.responsible),'')='' OR coalesce(trim(w."decompositionBasis"),'')=''
           OR coalesce(trim(w."scopeStatus"),'')='' OR coalesce(trim(w.location),'')=''))
   THEN RAISE EXCEPTION 'Dicionario EAP incompleto %',pid; END IF;
   IF (SELECT count(*) FROM public.budget_items
        WHERE "budgetVersionId"=newbudget)<>expected_leaves
      OR EXISTS(SELECT 1 FROM public.budget_items b WHERE b."budgetVersionId"=newbudget
        AND (b.source NOT LIKE 'SIMULACAO_QA%' OR b."isPriceException" IS NOT TRUE
             OR b."unitPrice"::numeric<=1 OR b.quantity::numeric<=0))
   THEN RAISE EXCEPTION 'Orçamento QA nao rastreavel %',pid; END IF;
   IF EXISTS(
      SELECT 1 FROM public.schedule_activities a
      LEFT JOIN public.budget_items b ON b.id=a."budgetItemId" AND b."budgetVersionId"=newbudget
      WHERE a."projectId"=pid AND a."versionId"=planid AND b.id IS NULL
   ) THEN RAISE EXCEPTION 'Atividade sem item QA orcado %',pid; END IF;
   IF EXISTS(
      SELECT 1 FROM public.schedule_activities a JOIN public.budget_items b ON b.id=a."budgetItemId"
      WHERE a."projectId"=pid AND a."versionId"=planid
      GROUP BY b.id,b.quantity
      HAVING abs(sum(a."plannedQuantity"::numeric)-b.quantity::numeric)>0.001
   ) THEN RAISE EXCEPTION 'Quantidade atividade/orcamento diferente %',pid; END IF;
   IF EXISTS(SELECT 1 FROM public.lob_activity_locations l
      JOIN public.production_units u ON u.id=l."unitId"
      WHERE l."projectId"=pid AND l."versionId"=planid AND u.name ~* 'did[aá]tic')
     OR EXISTS(SELECT 1 FROM public.lob_activity_locations l
      JOIN public.schedule_activities a ON a.id=l."activityId"
      WHERE l."projectId"=pid AND l."versionId"=planid
      GROUP BY a.id,a."plannedQuantity"
      HAVING abs(sum(l."plannedQuantity"::numeric)-a."plannedQuantity"::numeric)>0.001)
   THEN RAISE EXCEPTION 'LOB com setor didatico ou quantidade duplicada %',pid; END IF;
   IF EXISTS(SELECT 1 FROM public.measurements m WHERE m."projectId"=pid
     AND m.status IN ('aprovada','faturada','paga'))
   THEN RAISE EXCEPTION 'Aprovacao indevida de medicao %',pid; END IF;

   -- Nota: a decisão registra delegação para TESTES DE SOFTWARE. Não registra
   -- ateste profissional, ART/RRT ou validação de preços de mercado.
   INSERT INTO public.agent_decisions("projectId","userId",stage,decision,"scopeJson",reason)
   VALUES(pid,owner_id,'EAP_REVISAO','approved',
      jsonb_build_object('origem','qa_reconstrucao_20261107','versionNumber',9,
       'kind','SIMULACAO_QA','professionalSigned',false,'marketPriceVerified',false,
       'userAuthorizedChat',true,'scope','somente demonstracao software')::text,
      'Aceite demonstrativo do cenário FICTÍCIO v9 solicitado pelo titular. Sem assinatura profissional, sem comprovação de preços e sem medição contratual.')
   RETURNING id INTO decision_id;

   UPDATE public.project_plan_versions
     SET status='superseded',"updatedAt"=now() WHERE id=oldplan AND "projectId"=pid;
   UPDATE public.project_plan_versions
     SET status='approved',"decisionId"=decision_id,"approvedAt"=now(),"updatedAt"=now(),
       notes=concat(COALESCE(notes,''),' [SIMULACAO_QA] Aceite exclusivo para homologação de software, sem ART/RRT ou validação econômica.')
     WHERE id=planid AND "projectId"=pid;

   UPDATE public.budget_versions
     SET status='arquivado',"updatedAt"=now() WHERE id=oldbudget AND "projectId"=pid;
   UPDATE public.budget_versions
     SET status='aprovado',"updatedAt"=now(),
       notes=concat(COALESCE(notes,''),' [SIMULACAO_QA] Orçamento aceito exclusivamente para apresentação do fluxo fictício; não é preço de obra real.')
     WHERE id=newbudget AND "projectId"=pid;

   UPDATE public.schedule_baselines SET status='arquivada'
     WHERE "projectId"=pid AND status='ativa' AND "versionId"=oldplan;
   INSERT INTO public.schedule_baselines("projectId",name,status,"createdBy","versionId")
   VALUES(pid,CASE pid WHEN 7 THEN 'QA AURORA v9 — baseline demonstrativa, não contratual'
                        ELSE 'QA ESCOLA v9 — baseline demonstrativa, não contratual' END,
      'ativa',owner_id,planid)
   RETURNING id INTO newbaseline;
   INSERT INTO public.schedule_baseline_items("baselineId","activityId","startOffset","durationDays","earlyStart","earlyFinish")
     SELECT newbaseline,a.id,a."startOffset",a."durationDays",a."earlyStart",a."earlyFinish"
     FROM public.schedule_activities a WHERE a."projectId"=pid AND a."versionId"=planid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>expected_activities THEN RAISE EXCEPTION 'Baseline QA % com % itens, esperado %',pid,n,expected_activities; END IF;
   IF (SELECT count(*) FROM public.schedule_baselines
       WHERE "projectId"=pid AND status='ativa')<>1
   THEN RAISE EXCEPTION 'Restricao 1 baseline ativa falhou em %',pid; END IF;
   INSERT INTO public.project_audit_events("projectId","userId",action,payload)
   VALUES(pid,NULL,'qa_mvp_simulated_accepted',
     jsonb_build_object('versionId',planid,'budgetVersionId',newbudget,
       'baselineId',newbaseline,'previousPlanId',oldplan,'previousBudgetId',oldbudget,
       'kind','SIMULACAO_QA','approvedForDemonstration',true,
       'professionalSigned',false,'pricesFromOfficialSources',false,
       'actualMeasurementsApproved',false,'historicalDataPreserved',true));
 END LOOP;
END $qa_release$;