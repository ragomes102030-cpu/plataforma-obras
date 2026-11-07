-- RECONSTRUÇÃO FÍSICA DIDÁTICA, ESCOLA e AURORA — 2026-11-07
-- Atomicidade: uma única instrução DO; falha em qualquer invariante desfaz tudo.
-- A nova v9 é DRAFT. A v8 e as baselines ativas não sofrem alteração.
-- Produção real/financeiro não são alterados. Quantidades simuladas identificadas.
DO $rebuild$
#variable_conflict use_variable
DECLARE
  pid integer; base_id integer; next_id integer; new_id integer; mapped_id integer;
  mapped_parent integer; mapped_succ integer; mapped_pred integer;
  r record; tab text; cols text; expr text;
  base_count integer; new_count integer; day_count integer;
BEGIN
  CREATE TEMP TABLE _qa_wbs_map (pid integer, old_id integer, new_id integer, PRIMARY KEY(pid,old_id)) ON COMMIT DROP;
  CREATE TEMP TABLE _qa_act_map (pid integer, old_id integer, new_id integer, PRIMARY KEY(pid,old_id)) ON COMMIT DROP;
  CREATE TEMP TABLE _qa_workdays (pid integer, idx integer, day date, PRIMARY KEY(pid,idx)) ON COMMIT DROP;

  FOR pid IN SELECT unnest(ARRAY[7,25]) LOOP
    SELECT id INTO base_id FROM public.project_plan_versions
      WHERE "projectId"=pid AND "versionNumber"=8 AND status='approved';
    IF base_id IS NULL THEN RAISE EXCEPTION 'Projeto % sem v8 aprovada',pid; END IF;
    IF EXISTS(SELECT 1 FROM public.project_plan_versions WHERE "projectId"=pid AND "versionNumber">8) THEN
      RAISE EXCEPTION 'Projeto % ja possui versao posterior; evitar sobrescrita',pid;
    END IF;
    SELECT count(*) INTO base_count FROM public.schedule_baselines WHERE "projectId"=pid AND status='ativa';
    IF base_count<>1 THEN RAISE EXCEPTION 'Projeto % baseline irregular: %',pid,base_count; END IF;
    IF (SELECT count(*) FROM public.wbs_nodes WHERE "projectId"=pid AND "versionId"=base_id) <> (CASE WHEN pid=7 THEN 94 ELSE 37 END)
      THEN RAISE EXCEPTION 'Contagem WBS fonte alterada para projeto %',pid; END IF;
    IF (SELECT count(*) FROM public.schedule_activities WHERE "projectId"=pid AND "versionId"=base_id) <> (CASE WHEN pid=7 THEN 71 ELSE 30 END)
      THEN RAISE EXCEPTION 'Contagem atividades fonte alterada para projeto %',pid; END IF;
    IF (SELECT count(*) FROM public.lob_activity_locations WHERE "projectId"=pid AND "versionId"=base_id) <> (CASE WHEN pid=7 THEN 169 ELSE 90 END)
      THEN RAISE EXCEPTION 'Contagem parcelas fonte alterada para projeto %',pid; END IF;

    INSERT INTO public.project_plan_versions ("projectId","versionNumber",status,"baseVersionId",notes)
    VALUES(pid,9,'draft',base_id,
      '[SIMULACAO_QA] Reconstrucao fisica para ensaio engenharia 2026-11-07; v8/baseline preservadas. Quantitativos por local e ritmos são premissas simuladas, não extração de planta.')
    RETURNING id INTO next_id;

    SELECT string_agg(format('%I',column_name),',' ORDER BY ordinal_position),
           string_agg(CASE column_name WHEN 'versionId' THEN '$2::integer'
                           WHEN 'parentId' THEN '$3::integer'
                           WHEN 'updatedAt' THEN 'now()'
                           ELSE format('s.%I',column_name) END,',' ORDER BY ordinal_position)
    INTO cols,expr FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wbs_nodes' AND column_name<>'id';
    FOR r IN SELECT * FROM public.wbs_nodes
       WHERE "projectId"=pid AND "versionId"=base_id
       ORDER BY level,"sortOrder",id LOOP
      mapped_parent:=NULL;
      IF r."parentId" IS NOT NULL THEN
        SELECT m.new_id INTO mapped_parent FROM _qa_wbs_map m WHERE m.pid=pid AND old_id=r."parentId";
        IF mapped_parent IS NULL THEN RAISE EXCEPTION 'Pai WBS sem mapeamento: %',r.id; END IF;
      END IF;
      EXECUTE format('INSERT INTO public.wbs_nodes(%s) SELECT %s FROM public.wbs_nodes s WHERE s.id=$1 RETURNING id',cols,expr)
        INTO new_id USING r.id,next_id,mapped_parent;
      INSERT INTO _qa_wbs_map VALUES(pid,r.id,new_id);
    END LOOP;

    SELECT string_agg(format('%I',column_name),',' ORDER BY ordinal_position),
           string_agg(CASE column_name WHEN 'versionId' THEN '$2::integer'
                           WHEN 'wbsNodeId' THEN '$3::integer'
                           WHEN 'physicalWeightApprovedAt' THEN 'NULL'
                           WHEN 'updatedAt' THEN 'now()'
                           ELSE format('s.%I',column_name) END,',' ORDER BY ordinal_position)
    INTO cols,expr FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schedule_activities' AND column_name<>'id';
    FOR r IN SELECT * FROM public.schedule_activities
      WHERE "projectId"=pid AND "versionId"=base_id
      ORDER BY "sortOrder",id LOOP
      SELECT m.new_id INTO mapped_id FROM _qa_wbs_map m WHERE m.pid=pid AND old_id=r."wbsNodeId";
      IF mapped_id IS NULL THEN RAISE EXCEPTION 'Atividade % com WBS nao mapeada',r.id; END IF;
      EXECUTE format('INSERT INTO public.schedule_activities(%s) SELECT %s FROM public.schedule_activities s WHERE s.id=$1 RETURNING id',cols,expr)
        INTO new_id USING r.id,next_id,mapped_id;
      INSERT INTO _qa_act_map VALUES(pid,r.id,new_id);
    END LOOP;

    SELECT string_agg(format('%I',column_name),',' ORDER BY ordinal_position),
           string_agg(CASE column_name WHEN 'versionId' THEN '$2::integer'
                           WHEN 'predecessorId' THEN '$3::integer'
                           WHEN 'successorId' THEN '$4::integer'
                           ELSE format('s.%I',column_name) END,',' ORDER BY ordinal_position)
    INTO cols,expr FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schedule_dependencies' AND column_name<>'id';
    FOR r IN SELECT * FROM public.schedule_dependencies
       WHERE "projectId"=pid AND "versionId"=base_id LOOP
      SELECT m.new_id INTO mapped_pred FROM _qa_act_map m WHERE m.pid=pid AND old_id=r."predecessorId";
      SELECT m.new_id INTO mapped_succ FROM _qa_act_map m WHERE m.pid=pid AND old_id=r."successorId";
      IF mapped_pred IS NULL OR mapped_succ IS NULL THEN RAISE EXCEPTION 'Dependencia % orfa no fork',r.id; END IF;
      EXECUTE format('INSERT INTO public.schedule_dependencies(%s) SELECT %s FROM public.schedule_dependencies s WHERE s.id=$1 RETURNING id',cols,expr)
        INTO new_id USING r.id,next_id,mapped_pred,mapped_succ;
    END LOOP;

    -- Calendario fisico baseado em dias uteis do projeto. Excecoes registradas
    -- respeitadas; sem calendario proprio: seg-sex para o estudo ficticio.
    INSERT INTO _qa_workdays(pid,idx,day)
    SELECT pid,ROW_NUMBER() OVER (ORDER BY d.day)::integer-1,d.day::date
    FROM public.projects p
    CROSS JOIN LATERAL generate_series(p."plannedStart"::date,p."plannedFinish"::date+60,INTERVAL '1 day') AS d(day)
    LEFT JOIN public.work_calendars wc ON wc."projectId"=p.id
    WHERE p.id=pid AND
     (
       (extract(isodow from d.day)::integer=ANY(ARRAY[1,2,3,4,5])
        AND NOT EXISTS(SELECT 1 FROM public.calendar_exceptions ce
           WHERE ce."calendarId"=wc.id AND ce.date=d.day::date::text AND ce.type<>'working'))
       OR EXISTS(SELECT 1 FROM public.calendar_exceptions ce
           WHERE ce."calendarId"=wc.id AND ce.date=d.day::date::text AND ce.type='working')
     );

    IF pid=7 THEN
      -- AURORA: usa as 169 parcelas originais, remapeadas aos IDs da v9.
      SELECT string_agg(format('%I',column_name),',' ORDER BY ordinal_position),
             string_agg(CASE column_name WHEN 'versionId' THEN '$2::integer'
                             WHEN 'activityId' THEN '$3::integer'
                             ELSE format('s.%I',column_name) END,',' ORDER BY ordinal_position)
      INTO cols,expr FROM information_schema.columns
      WHERE table_schema='public' AND table_name='lob_activity_locations' AND column_name<>'id';
      FOR r IN SELECT * FROM public.lob_activity_locations
          WHERE "projectId"=pid AND "versionId"=base_id LOOP
        SELECT m.new_id INTO mapped_id FROM _qa_act_map m WHERE m.pid=pid AND old_id=r."activityId";
        IF mapped_id IS NULL THEN RAISE EXCEPTION 'Parcela % orfa no fork',r.id; END IF;
        EXECUTE format('INSERT INTO public.lob_activity_locations(%s) SELECT %s FROM public.lob_activity_locations s WHERE s.id=$1 RETURNING id',cols,expr)
          INTO new_id USING r.id,next_id,mapped_id;
      END LOOP;
      -- Balancear 7 pavimentos sequencialmente dentro da janela da propria
      -- atividade CPM: dias curtos implicam equipes paralelas no cenario.
      WITH ordered AS (
        SELECT l.id,a."earlyStart" AS es,a."durationDays" AS duration,
          ROW_NUMBER() OVER (PARTITION BY l."activityId" ORDER BY u."sortOrder",u.id) AS pos,
          COUNT(*) OVER (PARTITION BY l."activityId") AS n
        FROM public.lob_activity_locations l
        JOIN public.schedule_activities a ON a.id=l."activityId" AND a."versionId"=next_id
        JOIN public.production_units u ON u.id=l."unitId"
        WHERE l."projectId"=pid AND l."versionId"=next_id
      ), intervals AS (
        SELECT id,es,
          CASE WHEN n=1 THEN 0
            WHEN duration>=n THEN floor(((pos-1)*duration)::numeric/n)::integer
            ELSE floor(((pos-1)*(duration-1))::numeric/(n-1))::integer END AS ds,
          CASE WHEN n=1 THEN duration-1
            WHEN duration>=n THEN GREATEST(floor(((pos-1)*duration)::numeric/n)::integer,floor((pos*duration)::numeric/n)::integer-1)
            ELSE floor(((pos-1)*(duration-1))::numeric/(n-1))::integer END AS de
        FROM ordered
      )
      UPDATE public.lob_activity_locations l
         SET "startDate"=to_char(startday.day,'YYYY-MM-DD'),
             "finishDate"=to_char(endday.day,'YYYY-MM-DD'),"updatedAt"=now()
      FROM intervals v
      JOIN _qa_workdays startday ON startday.pid=pid AND startday.idx=v.es+v.ds
      JOIN _qa_workdays endday ON endday.pid=pid AND endday.idx=v.es+v.de
      WHERE l.id=v.id;
    ELSE
      -- ESCOLA: nunca clonar 90 parcelas artificiais. Administrativo permanece
      -- no Gantt/CPM; repeticao so nos servicos pertinentes ao edifício terreo.
      INSERT INTO public.production_units("projectId",code,name,"unitType","sortOrder") VALUES
        (25,'SIM-BLOCO-A','Bloco A — térreo (cenário simulado)','setor',10),
        (25,'SIM-BLOCO-B','Bloco B — térreo (cenário simulado)','setor',11),
        (25,'SIM-IMPL','Implantação/edificação — cenário simulado','setor',12);

      -- Distribuicao ficticia por dois blocos de atividades localizaveis.
      -- O peso 0,5/0,5 e uma HIPOTESE DE TREINAMENTO, nao levantamento.
      WITH twin AS (
        SELECT a.id AS act_id,a."earlyStart" es,a."durationDays" dur,
               a."plannedQuantity"::numeric qty,u.id AS uid,
               ROW_NUMBER() OVER(PARTITION BY a.id ORDER BY u."sortOrder") AS pos
        FROM public.schedule_activities a JOIN public.production_units u ON
           u."projectId"=25 AND u.code IN ('SIM-BLOCO-A','SIM-BLOCO-B')
        WHERE a."projectId"=25 AND a."versionId"=next_id AND a.exemplo=0
          AND a."plannedQuantity"::numeric>0
          AND (a.name ~* 'executar vedações|executar instalações elétricas|executar instalações hidrossanitárias|executar pisos|executar acabamentos|instalar portas internas|executar interfaces')
      )
      INSERT INTO public.lob_activity_locations ("projectId","versionId","activityId","unitId","plannedQuantity","startDate","finishDate")
      SELECT 25,next_id,t.act_id,t.uid,CASE WHEN t.pos=1 THEN round(t.qty/2,3) ELSE t.qty-round(t.qty/2,3) END,
         to_char(sd.day,'YYYY-MM-DD'),to_char(fd.day,'YYYY-MM-DD')
      FROM twin t
      JOIN _qa_workdays sd ON sd.pid=25 AND sd.idx=t.es+
            CASE WHEN t.pos=1 THEN 0 ELSE GREATEST(0,floor(t.dur::numeric/2)::integer) END
      JOIN _qa_workdays fd ON fd.pid=25 AND fd.idx=t.es+
            CASE WHEN t.pos=1 THEN GREATEST(0,floor(t.dur::numeric/2)::integer-1) ELSE t.dur-1 END;

      -- Serviços localizados únicos: terreno, fundações, estrutura e cobertura;
      -- não repetidos artificialmente em cada bloco.
      INSERT INTO public.lob_activity_locations ("projectId","versionId","activityId","unitId","plannedQuantity","startDate","finishDate")
      SELECT 25,next_id,a.id,u.id,a."plannedQuantity",
        to_char(sd.day,'YYYY-MM-DD'),to_char(fd.day,'YYYY-MM-DD')
      FROM public.schedule_activities a
      JOIN public.production_units u ON u."projectId"=25 AND u.code='SIM-IMPL'
      JOIN _qa_workdays sd ON sd.pid=25 AND sd.idx=a."earlyStart"
      JOIN _qa_workdays fd ON fd.pid=25 AND fd.idx=a."earlyStart"+a."durationDays"-1
      WHERE a."projectId"=25 AND a."versionId"=next_id AND a.exemplo=0
        AND a."plannedQuantity"::numeric>0
        AND (a.name ~* 'preparação do terreno|executar as fundações|executar a estrutura portante|executar cobertura')
        AND NOT EXISTS(SELECT 1 FROM public.lob_activity_locations l
           WHERE l."activityId"=a.id AND l."versionId"=next_id);
    END IF;

    -- Integridade de mapeamento: nenhum nó, atividade ou dependência se perde.
    IF (SELECT count(*) FROM public.wbs_nodes WHERE "projectId"=pid AND "versionId"=next_id)
       <> (SELECT count(*) FROM public.wbs_nodes WHERE "projectId"=pid AND "versionId"=base_id)
      THEN RAISE EXCEPTION 'WBS divergente no fork %',pid; END IF;
    IF (SELECT count(*) FROM public.schedule_activities WHERE "projectId"=pid AND "versionId"=next_id)
       <> (SELECT count(*) FROM public.schedule_activities WHERE "projectId"=pid AND "versionId"=base_id)
      THEN RAISE EXCEPTION 'Atividades divergentes no fork %',pid; END IF;
    IF (SELECT count(*) FROM public.schedule_dependencies WHERE "projectId"=pid AND "versionId"=next_id)
       <> (SELECT count(*) FROM public.schedule_dependencies WHERE "projectId"=pid AND "versionId"=base_id)
      THEN RAISE EXCEPTION 'Dependencias divergentes no fork %',pid; END IF;
    IF (SELECT count(*) FROM public.lob_activity_locations l
        JOIN public.production_units u ON u.id=l."unitId"
        WHERE l."projectId"=pid AND l."versionId"=next_id AND u.name ~* 'did[aá]tic')>0
      THEN RAISE EXCEPTION 'Local didatico persistiu na v9 %',pid; END IF;
    IF EXISTS (
      SELECT 1 FROM public.lob_activity_locations l
      JOIN public.schedule_activities a ON a.id=l."activityId" AND a."versionId"=next_id
      JOIN _qa_workdays st ON st.pid=pid AND st.idx=a."earlyStart"
      JOIN _qa_workdays fn ON fn.pid=pid AND fn.idx=a."earlyStart"+a."durationDays"-1
      WHERE l."projectId"=pid AND l."versionId"=next_id
        AND (l."startDate"<to_char(st.day,'YYYY-MM-DD')
             OR l."finishDate">to_char(fn.day,'YYYY-MM-DD')
             OR l."finishDate"<l."startDate")
    ) THEN RAISE EXCEPTION 'Parcela fora da janela CPM em %',pid; END IF;
    IF EXISTS (
      SELECT 1 FROM public.lob_activity_locations l
      JOIN public.schedule_activities a ON a.id=l."activityId"
      WHERE l."projectId"=pid AND l."versionId"=next_id
      GROUP BY a.id,a."plannedQuantity"
      HAVING abs(sum(l."plannedQuantity"::numeric)-a."plannedQuantity"::numeric)>0.001
    ) THEN RAISE EXCEPTION 'Quantitativo duplicado no fork %',pid; END IF;
    IF (SELECT count(*) FROM public.schedule_baselines WHERE "projectId"=pid AND status='ativa')<>1
      THEN RAISE EXCEPTION 'Baseline alterada no projeto %',pid; END IF;

    INSERT INTO public.project_audit_events("projectId","userId",action,payload)
      VALUES(pid,NULL,'qa_lob_reconstruction',
       jsonb_build_object('versionId',next_id,'baseVersionId',base_id,'kind','SIMULACAO_QA',
          'baselineUntouched',true,'approved',false,
          'method','LOB por locais e calendario CPM, premissas fisicas de treinamento, sem comprovacao de produtividade',
          'purpose','MVP demonstrativo com evidencias; nao medicao contratual'));
    RAISE NOTICE 'Projeto %, v9 %, parcelas %, status draft',pid,next_id,
      (SELECT count(*) FROM public.lob_activity_locations WHERE "projectId"=pid AND "versionId"=next_id);
  END LOOP;
END $rebuild$;
