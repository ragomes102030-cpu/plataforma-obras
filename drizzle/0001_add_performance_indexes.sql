-- Melhoria 1: Índices compostos para queries frequentes
ALTER TABLE schedule_activities ADD INDEX idx_project_status (projectId, status);
ALTER TABLE schedule_activities ADD INDEX idx_project_version_status (projectId, versionId, status);
ALTER TABLE schedule_activities ADD INDEX idx_project_phase (projectId, phase);
ALTER TABLE schedule_activities ADD INDEX idx_project_critical (projectId, critical);

-- Melhoria 2: Índices em colunas de filtro
ALTER TABLE wbs_nodes ADD INDEX idx_project_version_node_type (projectId, versionId, nodeType);
ALTER TABLE projectPlanVersions ADD INDEX idx_project_status (projectId, status);
ALTER TABLE productionEntries ADD INDEX idx_project_status (projectId, status);
ALTER TABLE productionFronts ADD INDEX idx_project_status (projectId, status);

-- Melhoria 3: Índices para ordenação comum
ALTER TABLE schedule_activities ADD INDEX idx_project_sort_order (projectId, sortOrder, id);
ALTER TABLE wbs_nodes ADD INDEX idx_project_sort_order (projectId, sortOrder, id);

-- Melhoria 4: Índices para joins comuns
ALTER TABLE budgetItems ADD INDEX idx_version_budget (budgetVersionId, wbsNodeId);
ALTER TABLE scheduleBaselines ADD INDEX idx_project_status (projectId, status);
ALTER TABLE activityResourceAllocations ADD INDEX idx_resource_activity (resourceId, activityId);

-- Nota: Binary log e performance_schema devem ser habilitados via configuração MySQL
-- Adicionar ao startCommand do container:
-- --log-bin=mysql-bin --binlog-format=ROW --performance_schema=1

