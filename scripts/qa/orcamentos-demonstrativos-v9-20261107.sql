-- QA FICTICIO: cenarios economicos de Escola e Aurora, sem cotacao externa.
-- Nao substitui referencias oficiais de custo nem assinatura de engenheiro.
-- Os orcamentos v1 permanecem historicos; a nova versao fica RASCUNHO
-- ate revisao de integridade, sem alterar medições existentes ou baselines.
DO $budget$
#variable_conflict use_variable
DECLARE
  pid integer; plan_id integer; old_budget_id integer; new_budget_id integer;
  sources integer; inserted integer; fixed integer;
  rates jsonb := '{
    "1.1":45000,"1.2.1":35000,"1.2.2":220000,
    "1.3.1":80000,"1.3.2":380000,"1.3.3":18000,"1.3.4":12000,
    "1.4.1":95000,"1.4.2":125000,"1.4.3":18000,"1.4.4":9000,
    "1.5.1":125000,"1.5.2":105000,"1.5.3":65000,"1.5.4":145000,
    "1.6.1":120000,"1.6.2":165000,
    "1.7.1":34000,"1.7.2":12000,"1.7.3":25000,
    "1.8.1":90000,"1.8.2":38000,"1.8.3":18000,
    "1.9.1":180000,"1.9.2":62000,
    "1.10.1":95000,"1.10.2":80000
  }'::jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.budget_versions WHERE "projectId" IN (7,25) AND "versionNumber">=2) THEN
    RAISE EXCEPTION 'Orcamentos v2 ja existentes. Nao executar duas vezes';
  END IF;
  CREATE TEMP TABLE _qa_budget_map(pid integer, old_id integer, new_id integer, PRIMARY KEY(pid,old_id)) ON COMMIT DROP;
  FOR pid IN SELECT unnest(ARRAY[7,25]) LOOP
    plan_id:=CASE pid WHEN 7 THEN 46 ELSE 47 END;
    old_budget_id:=CASE pid WHEN 7 THEN 4 ELSE 11 END;
    IF NOT EXISTS(SELECT 1 FROM public.project_plan_versions WHERE id=plan_id AND "projectId"=pid AND status='draft')
       OR NOT EXISTS(SELECT 1 FROM public.budget_versions WHERE id=old_budget_id AND "projectId"=pid AND status='aprovado')
       OR (SELECT count(*) FROM public.schedule_baselines WHERE "projectId"=pid AND status='ativa')<>1
    THEN RAISE EXCEPTION 'Precondicao de plano/budget/baseline falhou para projeto %',pid; END IF;
    SELECT count(*) INTO sources FROM public.budget_items WHERE "budgetVersionId"=old_budget_id;
    IF sources<>(CASE pid WHEN 7 THEN 53 ELSE 27 END) THEN RAISE EXCEPTION 'Budget base do projeto % foi alterado',pid; END IF;

    INSERT INTO public.budget_versions ("projectId",name,"versionNumber",status,currency,notes)
    VALUES(pid,CASE pid WHEN 7 THEN 'AURORA — cenário econômico de treinamento v2'
                        ELSE 'ESCOLA — orçamento didático por pacotes v2' END,
      2,'rascunho','BRL',
      '[SIMULACAO_QA] Valores e quantidades apenas para exercitar planejamento/orcamento/medicao. Precos SEM validacao SEINFRA, SINAPI ou cotacao. Nenhum documento fiscal/contratual. Refazer antes de uso em obra real.')
    RETURNING id INTO new_budget_id;

    INSERT INTO public.budget_items
       ("budgetVersionId","wbsNodeId",code,description,unit,quantity,"unitPrice",
        "compositionId","compositionUnitCost",productivity,"plannedDurationDays",
        source,"referencePeriod","compositionNote","isPriceException","sortOrder")
    SELECT new_budget_id,w_new.id,b.code,w_new.name,b.unit,b.quantity,
      CASE WHEN pid=25 THEN (rates->>b.code)::numeric
           WHEN b.code IN ('1.4.1','1.4.2','1.4.3','1.4.4') THEN 2100.00
           WHEN b.code='1.6.3' THEN 195.00
           WHEN b.code='1.13.2' THEN 295.00
           WHEN b.code='1.13.1' THEN 95.00
           ELSE b."unitPrice" END,
      NULL,NULL,b.productivity,b."plannedDurationDays",
      'SIMULACAO_QA — PRECO HIPOTETICO','2026-QA',
      'Valor de estudo, sem verificacao de composiçao/BDI/encargos. Escopo e unidade devem ser conferidos antes de cotar. Nao utilizar como referencia de proposta ou medicao de obra real.',
      TRUE,b."sortOrder"
    FROM public.budget_items b
    JOIN public.wbs_nodes w_old ON w_old.id=b."wbsNodeId"
    JOIN public.wbs_nodes w_new ON w_new."projectId"=pid AND w_new."versionId"=plan_id AND w_new.code=w_old.code
    WHERE b."budgetVersionId"=old_budget_id;
    GET DIAGNOSTICS inserted=ROW_COUNT;
    IF inserted<>sources THEN RAISE EXCEPTION 'Copiados apenas % de % itens do projeto %',inserted,sources,pid; END IF;
    IF pid=25 AND EXISTS(
        SELECT 1 FROM public.budget_items b WHERE b."budgetVersionId"=new_budget_id
          AND (b."unitPrice" IS NULL OR b."unitPrice"::numeric<=1)
       ) THEN RAISE EXCEPTION 'Preco simbolico nao substituido Escola'; END IF;

    INSERT INTO _qa_budget_map(pid,old_id,new_id)
    SELECT pid,old_b.id,new_b.id
    FROM public.budget_items old_b JOIN public.budget_items new_b
       ON new_b."budgetVersionId"=new_budget_id AND new_b.code=old_b.code
    WHERE old_b."budgetVersionId"=old_budget_id;
    IF (SELECT count(*) FROM _qa_budget_map WHERE _qa_budget_map.pid=pid)<>sources
      THEN RAISE EXCEPTION 'Mapeamento de itens incompleto %',pid; END IF;

    -- Itens de simulacao em Aurora nao representam producao contratual.
    IF pid=7 THEN
      UPDATE public.schedule_activities SET "budgetItemId"=NULL,"updatedAt"=now()
       WHERE "projectId"=7 AND "versionId"=46 AND exemplo=1;
    ELSE
      -- "vb" (1 verba) de projeto arquitetonico e levantamento sao pacotes
      -- distribuidos por marcos de entrega, nao 3 ou 2 verbas extras.
      WITH stages AS (
        SELECT a.id,a."budgetItemId",
          row_number() OVER(PARTITION BY a."budgetItemId" ORDER BY a."earlyStart",a.id) seq,
          count(*) OVER(PARTITION BY a."budgetItemId") n
        FROM public.schedule_activities a WHERE a."projectId"=25 AND a."versionId"=47
          AND a."budgetItemId" IN(225,235)
      )
      UPDATE public.schedule_activities a
      SET "plannedQuantity"=CASE WHEN t.seq<t.n THEN trunc(1.000::numeric/t.n,3)
        ELSE 1.000-(t.n-1)*trunc(1.000::numeric/t.n,3) END,
        "updatedAt"=now()
      FROM stages t WHERE a.id=t.id;
    END IF;

    UPDATE public.schedule_activities a SET "budgetItemId"=m.new_id,"updatedAt"=now()
    FROM _qa_budget_map m WHERE m.pid=pid
      AND a."projectId"=pid AND a."versionId"=plan_id
      AND a."budgetItemId"=m.old_id;
    IF EXISTS(SELECT 1 FROM public.schedule_activities a
        WHERE a."projectId"=pid AND a."versionId"=plan_id
         AND a."budgetItemId" IS NOT NULL
         AND NOT EXISTS(SELECT 1 FROM public.budget_items b
             WHERE b.id=a."budgetItemId" AND b."budgetVersionId"=new_budget_id))
    THEN RAISE EXCEPTION 'Atividade aponta para orçamento antigo %',pid; END IF;
    IF EXISTS(SELECT 1 FROM public.budget_items b WHERE b."budgetVersionId"=new_budget_id
       AND (b."unitPrice"::numeric<=0 OR b.quantity::numeric<=0 OR b."wbsNodeId" IS NULL))
    THEN RAISE EXCEPTION 'Item orcamentario invalido %',pid; END IF;
    INSERT INTO public.project_audit_events("projectId","userId",action,payload)
    VALUES(pid,NULL,'qa_budget_scenario_drafted',
      jsonb_build_object('versionId',plan_id,'budgetVersionId',new_budget_id,
        'sourceBudgetId',old_budget_id,'items',sources,'kind','SIMULACAO_QA',
        'marketPriceVerified',false,'engineerSigned',false,
        'previousBudgetUnchanged',true,'baselineUnchanged',true));
  END LOOP;
END $budget$;