-- QA EXCLUSIVO: AURORA TESTE, projeto 7. Execução manual; NÃO é migração de schema.
-- Execução idempotente por recusa: se v7 existir, aborta antes de gravar.
-- Executar primeiro substituindo COMMIT por ROLLBACK para validar.
-- Preserva v1-v6, versão aprovada v5 e todas as baselines.
BEGIN;
DO $qa$
DECLARE
  v7 integer;
  old_node record;
  old_activity record;
  old_dependency record;
  new_id integer;
  old_to_new_wbs jsonb := '{}'::jsonb;
  old_to_new_act jsonb := '{}'::jsonb;
  qa_activities jsonb := '{}'::jsonb;
  parent_code text;
  service_name text;
  local_name text;
  code_name text;
  activity_start integer;
  activity_duration integer;
  activity_late_start integer;
  activity_free_float integer;
  parent_id integer;
  qa_id integer;
  anchor_id integer;
  service_idx integer;
  floor_idx integer;
  source_id integer;
BEGIN
  PERFORM 1 FROM projects WHERE id = 7 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projeto AURORA 7 inexistente'; END IF;

  IF EXISTS (SELECT 1 FROM project_plan_versions WHERE "projectId"=7 AND "versionNumber">=7)
  THEN RAISE EXCEPTION 'Versão 7+ já existe; operação QA não será repetida'; END IF;

  IF (SELECT status::text FROM project_plan_versions WHERE id=31 AND "projectId"=7) <> 'draft'
     OR (SELECT status::text FROM project_plan_versions WHERE id=30 AND "projectId"=7) <> 'approved'
     OR (SELECT count(*) FROM wbs_nodes WHERE "projectId"=7 AND "versionId"=31) <> 69
     OR (SELECT count(*) FROM schedule_activities WHERE "projectId"=7 AND "versionId"=31) <> 53
     OR (SELECT count(*) FROM schedule_dependencies WHERE "projectId"=7 AND "versionId"=31) <> 71
     OR (SELECT count(*) FROM schedule_baselines WHERE "projectId"=7 AND status='ativa') <> 1
  THEN RAISE EXCEPTION 'Precondições alteradas; versão QA bloqueada'; END IF;

  INSERT INTO project_plan_versions ("projectId","versionNumber",status,"baseVersionId",notes,"createdBy")
  SELECT 7,7,'draft',31,
    'QA Linha de Balanço: cópia integral da v6 + 3 serviços repetitivos em 6 pavimentos. NÃO APROVAR / NÃO USAR COMO OBRA REAL.',
    "createdBy"
  FROM project_plan_versions WHERE id=31 RETURNING id INTO v7;

  FOR old_node IN
    SELECT * FROM wbs_nodes WHERE "projectId"=7 AND "versionId"=31
    ORDER BY level,"sortOrder",id
  LOOP
    parent_id := CASE WHEN old_node."parentId" IS NULL THEN NULL
      ELSE (old_to_new_wbs ->> old_node."parentId"::text)::integer END;
    IF old_node."parentId" IS NOT NULL AND parent_id IS NULL
    THEN RAISE EXCEPTION 'Pai WBS ausente no clone: %',old_node.code; END IF;
    INSERT INTO wbs_nodes
      ("projectId","externalId","externalUid","parentId",code,name,level,"nodeType",unit,
       "plannedQuantity","versionId","sortOrder",description,inclusions,exclusions,
       location,responsible,"acceptanceCriteria","scopeStatus","decompositionBasis")
    VALUES
      (7,old_node."externalId",old_node."externalUid",parent_id,old_node.code,old_node.name,
       old_node.level,old_node."nodeType",old_node.unit,old_node."plannedQuantity",
       v7,old_node."sortOrder",old_node.description,old_node.inclusions,old_node.exclusions,
       old_node.location,old_node.responsible,old_node."acceptanceCriteria",
       old_node."scopeStatus",old_node."decompositionBasis")
    RETURNING id INTO new_id;
    old_to_new_wbs := jsonb_set(old_to_new_wbs,ARRAY[old_node.id::text],to_jsonb(new_id));
  END LOOP;

  FOR old_activity IN
    SELECT * FROM schedule_activities WHERE "projectId"=7 AND "versionId"=31
    ORDER BY "sortOrder",id
  LOOP
    qa_id := (old_to_new_wbs ->> old_activity."wbsNodeId"::text)::integer;
    IF qa_id IS NULL THEN RAISE EXCEPTION 'Atividade sem pacote no clone: %',old_activity.name; END IF;
    INSERT INTO schedule_activities
      ("projectId","wbsNodeId","externalId","eapRef","wbsCode",name,phase,pavimento,
       "startOffset","durationDays","plannedQuantity",unit,productivity,"budgetItemId",
       progress,exemplo,status,critical,"earlyStart","earlyFinish","lateStart","lateFinish",
       "totalFloat","freeFloat","mustStartOn","finishNoLaterThan","cpmCalculatedAt",
       "versionId","sortOrder","durationOptimisticDays","durationPessimisticDays","is_milestone")
    VALUES
      (7,qa_id,old_activity."externalId",old_activity."eapRef",old_activity."wbsCode",
       old_activity.name,old_activity.phase,old_activity.pavimento,old_activity."startOffset",
       old_activity."durationDays",old_activity."plannedQuantity",old_activity.unit,
       old_activity.productivity,old_activity."budgetItemId",old_activity.progress,
       old_activity.exemplo,old_activity.status,old_activity.critical,
       old_activity."earlyStart",old_activity."earlyFinish",old_activity."lateStart",
       old_activity."lateFinish",old_activity."totalFloat",old_activity."freeFloat",
       old_activity."mustStartOn",old_activity."finishNoLaterThan",
       old_activity."cpmCalculatedAt",v7,old_activity."sortOrder",
       old_activity."durationOptimisticDays",old_activity."durationPessimisticDays",
       old_activity.is_milestone)
    RETURNING id INTO new_id;
    old_to_new_act := jsonb_set(old_to_new_act,ARRAY[old_activity.id::text],to_jsonb(new_id));
  END LOOP;

  FOR old_dependency IN
    SELECT * FROM schedule_dependencies WHERE "projectId"=7 AND "versionId"=31
  LOOP
    INSERT INTO schedule_dependencies
      ("projectId","externalId","predecessorId","successorId",type,lag,"versionId")
    VALUES
      (7,old_dependency."externalId",
       (old_to_new_act ->> old_dependency."predecessorId"::text)::integer,
       (old_to_new_act ->> old_dependency."successorId"::text)::integer,
       old_dependency.type,old_dependency.lag,v7);
  END LOOP;

  -- Três sequências físicas com códigos próprios, sem duplicar wbsCode.
  -- QA didático: quantidade fictícia explicitamente identificada como exemplo.
  -- Inícios e folgas obtidos analiticamente na malha FS abaixo (prazo total 580d).
  FOR service_idx IN 1..3 LOOP
    parent_code := CASE service_idx WHEN 1 THEN '1.5' WHEN 2 THEN '1.8' ELSE '1.12' END;
    service_name := CASE service_idx WHEN 1 THEN 'Alvenaria de vedação'
                    WHEN 2 THEN 'Chapisco interno' ELSE 'Pintura interna' END;
    activity_duration := CASE service_idx WHEN 1 THEN 4 WHEN 2 THEN 3 ELSE 2 END;
    SELECT id INTO parent_id FROM wbs_nodes
      WHERE "projectId"=7 AND "versionId"=v7 AND code=parent_code;
    IF parent_id IS NULL THEN RAISE EXCEPTION 'Grupo WBS não encontrado: %',parent_code; END IF;

    FOR floor_idx IN 1..6 LOOP
      local_name := 'P' || lpad(floor_idx::text,2,'0');
      code_name := parent_code || '.' || (100+floor_idx)::text;
      activity_start := CASE service_idx
        WHEN 1 THEN 353+4*(floor_idx-1)
        WHEN 2 THEN 357+4*(floor_idx-1)
        ELSE 360+4*(floor_idx-1) END;
      activity_late_start := CASE service_idx
        WHEN 1 THEN 551+4*(floor_idx-1)
        WHEN 2 THEN 560+3*(floor_idx-1)
        ELSE 568+2*(floor_idx-1) END;
      activity_free_float := CASE WHEN service_idx=3 AND floor_idx<6 THEN 2
                                WHEN service_idx=3 AND floor_idx=6 THEN 198
                                ELSE 0 END;

      INSERT INTO wbs_nodes
        ("projectId","parentId",code,name,level,"nodeType",unit,"plannedQuantity",
         "versionId","sortOrder",location,description,"scopeStatus","acceptanceCriteria")
      VALUES
        (7,parent_id,code_name,service_name||' — '||local_name,3,'pacote','m²',120,
         v7,100+floor_idx,local_name,
         'PACOTE DE TESTE QA LOB. Quantidade indicativa, sem medição real. Não utilizar para obra real.',
         'rascunho','Validar execução visual por pavimento e lógica de precedência FS.')
      RETURNING id INTO qa_id;

      INSERT INTO schedule_activities
        ("projectId","wbsNodeId","wbsCode","eapRef",name,phase,pavimento,
         "startOffset","durationDays","plannedQuantity",unit,progress,exemplo,
         critical,"earlyStart","earlyFinish","lateStart","lateFinish",
         "totalFloat","freeFloat","versionId","sortOrder")
      VALUES
        (7,qa_id,code_name,code_name,service_name,'Execução',local_name,
         activity_start,activity_duration,120,'m²',0,1,
         0,activity_start,activity_start+activity_duration,
         activity_late_start,activity_late_start+activity_duration,
         activity_late_start-activity_start,activity_free_float,v7,
         1000+service_idx*10+floor_idx)
      RETURNING id INTO new_id;
      qa_activities := jsonb_set(qa_activities,
        ARRAY[service_idx::text||':'||floor_idx::text],to_jsonb(new_id));
    END LOOP;
  END LOOP;

  -- A sequência QA começa após Alvenarias original, sem mudar as sucessoras
  -- históricas nem alongar o prazo de 580 dias (termina no dia 382).
  SELECT id INTO anchor_id FROM schedule_activities
   WHERE "projectId"=7 AND "versionId"=v7 AND "wbsCode"='1.5.1';
  IF anchor_id IS NULL OR (SELECT "earlyFinish" FROM schedule_activities WHERE id=anchor_id)<>353
  THEN RAISE EXCEPTION 'Âncora da malha QA alterada'; END IF;
  INSERT INTO schedule_dependencies("projectId","predecessorId","successorId",type,lag,"versionId")
    VALUES(7,anchor_id,(qa_activities ->> '1:1')::integer,'FS',0,v7);

  FOR floor_idx IN 1..6 LOOP
    -- Em cada pavimento: Alvenaria → Chapisco → Pintura.
    INSERT INTO schedule_dependencies("projectId","predecessorId","successorId",type,lag,"versionId")
    VALUES
      (7,(qa_activities ->> ('1:'||floor_idx::text))::integer,
         (qa_activities ->> ('2:'||floor_idx::text))::integer,'FS',0,v7),
      (7,(qa_activities ->> ('2:'||floor_idx::text))::integer,
         (qa_activities ->> ('3:'||floor_idx::text))::integer,'FS',0,v7);
    IF floor_idx>1 THEN
      FOR service_idx IN 1..3 LOOP
        -- Cada equipe avança para o próximo pavimento sem sobreposição.
        INSERT INTO schedule_dependencies("projectId","predecessorId","successorId",type,lag,"versionId")
        VALUES(7,(qa_activities ->> (service_idx::text||':'||(floor_idx-1)::text))::integer,
                 (qa_activities ->> (service_idx::text||':'||floor_idx::text))::integer,'FS',0,v7);
      END LOOP;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM wbs_nodes WHERE "versionId"=v7)<>87
     OR (SELECT count(*) FROM schedule_activities WHERE "versionId"=v7)<>71
     OR (SELECT count(*) FROM schedule_dependencies WHERE "versionId"=v7)<>99
  THEN RAISE EXCEPTION 'Contagens QA inesperadas'; END IF;
  RAISE NOTICE 'AURORA QA LOB v7 id %, 87 nós EAP, 71 atividades e 99 vínculos',v7;
END $qa$;

-- Vetores de integridade e não interferência nas versões históricas.
SELECT
 (SELECT count(*) FROM project_plan_versions WHERE "projectId"=7 AND "versionNumber"=7 AND status='draft') AS qa_draft,
 (SELECT count(*) FROM wbs_nodes n JOIN project_plan_versions v ON n."versionId"=v.id WHERE v."projectId"=7 AND v."versionNumber"=7) AS qa_wbs,
 (SELECT count(*) FROM schedule_activities a JOIN project_plan_versions v ON a."versionId"=v.id WHERE v."projectId"=7 AND v."versionNumber"=7) AS qa_activities,
 (SELECT count(*) FROM schedule_dependencies d JOIN project_plan_versions v ON d."versionId"=v.id WHERE v."projectId"=7 AND v."versionNumber"=7) AS qa_dependencies,
 (SELECT count(*) FROM schedule_activities WHERE "projectId"=7 AND "versionId"=30) AS approved_v5_activities,
 (SELECT count(*) FROM schedule_activities WHERE "projectId"=7 AND "versionId"=31) AS preserved_v6_activities,
 (SELECT count(*) FROM schedule_baselines WHERE "projectId"=7 AND status='ativa') AS active_baselines;
COMMIT;
