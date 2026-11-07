-- Homologacao ficticia Escola/Aurora, 07/11/2026.
-- Executar somente em ambiente QA autorizado e com snapshot aprovado conferido.
-- NUNCA produz ateste, fatura ou pagamento: cria rascunhos identificados.
-- A idempotencia usa ausencia de qualquer medicao; nunca sobrescreve.
-- Aurora: registros confirmados IDs 1..10 (nao QA), aprovacao de campo FICTICIA.
-- Escola: exemplos IDs 23..26, valores R$1/vb didaticos, SEM valor comercial.
WITH 
parameters(pid, plan_id, first_day, last_day, marker) AS (
 VALUES 
  (7,34,DATE '2026-10-01',DATE '2026-10-31',
   '[SIMULACAO_QA] AURORA: boletim ficticio para teste do fluxo. Quantidades baseadas nos lancamentos 1..10, sem ateste documental; valores da planilha de demonstracao, NAO aptos a cobranca. Retencao 0% didatica por ausencia de regra contratual. Lançamentos de exemplo de 05/11 excluidos. Sem nota fiscal, liquidação ou pagamento.'),
  (25,43,DATE '2026-11-01',DATE '2026-11-06',
   '[SIMULACAO_QA] ESCOLA: primeiro periodo PARCIAL ficticio. Lancamentos 23..26, todos marcados como exemplo. Orcamento aprovado e DIDATICO, R$1 por verba, sem precos comerciais. 0% de retencao somente por hipotese do exercicio; sem aceite, fiscalizacao real, NF ou pagamento. Medicao exclusivamente de QA.')
),
eligible AS (
 SELECT p.pid, a."budgetItemId" AS budget_id,
    sum(e.quantity::numeric)::numeric(14,3) AS quantity,
    min(bi.description) AS description, min(bi.unit) AS unit,
    min(bi."unitPrice"::numeric) AS unit_price,
    min(bi.quantity::numeric) AS contract_qty,
    count(*) AS logs
 FROM parameters p
 JOIN public.production_entries e ON e."projectId"=p.pid
 JOIN public.schedule_activities a ON a.id=e."activityId" AND a."projectId"=p.pid AND a."versionId"=p.plan_id
 JOIN public.budget_items bi ON bi.id=a."budgetItemId"
 JOIN public.budget_versions bv ON bv.id=bi."budgetVersionId" AND bv."projectId"=p.pid AND bv.status='aprovado'
 WHERE e.status='confirmada' AND (
   (p.pid=7 AND e.id BETWEEN 1 AND 10 AND e.exemplo=0 AND a.exemplo=0)
   OR (p.pid=25 AND e.id BETWEEN 23 AND 26 AND e.exemplo=1)
 )
 AND e."productionDate"::date BETWEEN p.first_day AND p.last_day
 AND lower(replace(e."measurementUnit",'²','2'))=lower(replace(bi.unit,'²','2'))
 GROUP BY p.pid,a."budgetItemId"
 HAVING sum(e.quantity::numeric)>0 AND sum(e.quantity::numeric)<=min(bi.quantity::numeric)
),
eligible_projects AS (
 SELECT p.* FROM parameters p
 WHERE EXISTS (SELECT 1 FROM eligible e WHERE e.pid=p.pid)
 AND NOT EXISTS(SELECT 1 FROM public.measurements m WHERE m."projectId"=p.pid)
 AND (SELECT COUNT(*) FROM public.project_plan_versions v WHERE v."projectId"=p.pid AND v.id=p.plan_id AND v.status='approved')=1
),
drafts AS (
 INSERT INTO public.measurements ("projectId",number,"periodStart","periodEnd",status,"retentionPercent",notes,"createdBy")
 SELECT pid,1,first_day::timestamptz,last_day::timestamptz,'rascunho',0,marker,NULL
 FROM eligible_projects
 RETURNING id,"projectId"
),
lineitems AS (
 INSERT INTO public.measurement_items ("measurementId","budgetItemId",description,unit,quantity,"unitPrice",amount)
 SELECT d.id,e.budget_id,e.description,e.unit,e.quantity,e.unit_price,
  round(e.quantity*e.unit_price,2)
 FROM drafts d JOIN eligible e ON e.pid=d."projectId"
 RETURNING "measurementId",amount
),
audit AS (
 INSERT INTO public.project_audit_events ("projectId","userId",action,payload)
 SELECT d."projectId",NULL,'measurement_qa_draft_created',
  jsonb_build_object('measurementId',d.id,'status','rascunho','origin','SIMULACAO_QA',
  'approved',false,'source','snapshot ficticio de ensino','sourcePolicy',
  CASE WHEN d."projectId"=7 THEN '10 registros sem marcação de exemplo (IDs 1..10)' ELSE '4 registros de exemplo (IDs 23..26)' END,
  'notes','Nao substitui ateste por profissional habilitado; sem efeitos financeiros')
 FROM drafts d
 RETURNING id
)
SELECT d."projectId" AS project_id,d.id AS measurement_id,COUNT(li."measurementId") AS items,
 COALESCE(SUM(li.amount),0)::numeric(16,2) AS gross_simulated,
 (SELECT count(*) FROM audit) AS audit_events
FROM drafts d LEFT JOIN lineitems li ON li."measurementId"=d.id
GROUP BY d."projectId",d.id ORDER BY d."projectId";
