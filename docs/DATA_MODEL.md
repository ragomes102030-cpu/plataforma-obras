# DATA_MODEL.md — Modelo de Dados

## RESUMO

```
Projects (obras)
├── wbs_nodes (EAP)
├── schedule_activities (atividades)
│   └── schedule_dependencies (dependências)
├── project_plan_versions (versões)
├── planning_resources (recursos)
├── activity_resource_allocations (alocações)
│
├── budget_versions (versões de orçamento)
│   └── budget_items (itens de orçamento)
│       └── service_compositions (composições)
│           └── composition_components (componentes)
│
├── price_catalogs (catálogos)
│   └── price_items (itens de preço)
│
├── production_fronts (frentes)
├── production_teams (equipes)
├── production_units (unidades)
│   └── production_entries (lançamentos de produção)
│       └── activityId → schedule_activities
│       └── teamId → production_teams
│       └── frontId → production_fronts
│       └── unitId → production_units
│
├── scheduleBaselines (baselines)
│   └── scheduleBaselineItems (itens de baseline)
│
├── users (usuarios)
│
├── agentDecisions (decisões do agente)
├── agentFindings (findings do agente)
├── agentMemories (memórias do agente)
│
├── projectMcpIntegrations (integrações MCP)
├── mcpMutationOperations (operações MCP)
├── mcpHomologationRuns (execuções de homologação)
│
└── projectAuditEvents (eventos de auditoria)
```

---

## ENTIDADES PRINCIPAIS

### 1. Project (Obra)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| name | string | Nome da obra |
| ownerUserId | int FK→users | Responsável |
| plannedStart | Date | Data inicio planejada |
| plannedFinish | Date | Data fim planejada |
| status | enum | Status da obra |
| location | string | Localização |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

**Relacionamentos:**
- 1:N → wbs_nodes
- 1:N → schedule_activities
- 1:N → project_plan_versions
- 1:N → budget_versions
- 1:N → production_fronts, production_teams, production_units
- 1:N → production_entries
- 1:N → planning_resources
- 1:N → scheduleBaselines
- 1:N → agentDecisions, agentFindings, agentMemories

---

### 2. WBS Node (EAP / Work Breakdown Structure)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| parentId | int FK→wbs_nodes | Nó pai (hierarquia) |
| code | string | Código do nó (ex: 1, 1.1, 1.2.1) |
| name | string | Nome do nó |
| level | int | Nível (profundidade) |
| nodeType | enum(grupo,pacote,entrega) | Tipo |
| unit | string | Unidade (opcional) |
| plannedQuantity | int | Quantidade planejada |
| versionId | int FK→project_plan_versions | Versão do plano |
| sortOrder | int | Ordem de exibição |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

**Exemplo:**
```
1 — Residencial Aurora (grupo)
├── 1.1 — Fundação (pacote, m³, 180)
├── 1.2 — Estrutura dos Pavimentos (pacote, m², 2400)
└── 1.3 — Alvenaria por Pavimento (pacote, m², 3200)
    ├── 1.3.1 — Laje do Subsolo (entrega)
    └── ...
```

**Critério:** Código deve ser único por projeto. Hierarquia via parentId auto-referência.

**Validação:** Verificar `eap-validator.ts` — testes passando.

---

### 3. Schedule Activity (Atividade do Cronograma)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| wbsNodeId | int FK→wbs_nodes | Nó do EAP associado |
| externalId | string | ID externo (MCP) |
| eapRef | string | Referência ao EAP |
| wbsCode | string | Código do WBS |
| name | string | Nome da atividade |
| phase | string | Fase (ex: "Estrutura") |
| startOffset | int | Dias desde o início do projeto |
| durationDays | int | Duração em dias |
| plannedQuantity | decimal(14,3) | Quantidade planejada |
| productivity | decimal(14,3) | Produtividade (unidade/dia) |
| budgetItemId | int FK→budget_items | Item de orçamento associado |
| progress | int(0-100) | Progresso atual |
| status | enum(Não iniciado,Em andamento,Concluído,Em risco) | Status |
| critical | int(0/1) | É crítica? (calculado pelo CPM) |
| earlyStart | int | ES (calculado pelo CPM) |
| earlyFinish | int | EF (calculado pelo CPM) |
| lateStart | int | LS (calculado pelo CPM) |
| lateFinish | int | LF (calculado pelo CPM) |
| totalFloat | int | Folga total (calculado pelo CPM) |
| cpmCalculatedAt | Date | Quando foi calculado |
| versionId | int FK→project_plan_versions | Versão do plano |
| sortOrder | int | Ordem de exibição |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

**Relacionamentos:**
- N:1 → wbs_nodes
- 1:1 → budget_items (opcional)
- 1:N → schedule_dependencies (como predecessor ou successor)
- 1:N → activity_resource_allocations

**Cálculos (CPM):**
- `earlyFinish = earlyStart + durationDays`
- `lateStart = lateFinish - durationDays`
- `totalFloat = lateStart - earlyStart = lateFinish - earlyFinish`
- `critical = (totalFloat == 0)`

---

### 4. Schedule Dependency (Dependência)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| externalId | string | ID externo (MCP) |
| predecessorId | int FK→schedule_activities | Atividade anterior |
| successorId | int FK→schedule_activities | Atividade posterior |
| type | enum(FS,SS,FF,SF) | Tipo da dependência |
| lag | int | Atraso em dias (default: 0) |
| versionId | int FK→project_plan_versions | Versão do plano |
| createdAt | Date | Criação |

**Validação:** Precedente e sucessor devem existir. Não deve haver ciclos.

---

### 5. Budget Version (Versão de Orçamento)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| name | string | Nome da versão |
| versionNumber | int | Número da versão |
| status | enum(aprovado,rascunho,etc.) | Status |
| currency | string | Moeda (ex: BRL) |
| notes | string | Notas |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

---

### 6. Budget Item (Item de Orçamento)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| budgetVersionId | int FK→budget_versions | Versão do orçamento |
| code | string | Código |
| description | string | Descrição |
| unit | string | Unidade de medida |
| quantity | decimal(14,3) | Quantidade |
| unitPrice | decimal(14,2) | Preço unitário |
| plannedDurationDays | int | Duração planejada |
| source | string | Fonte do preço |
| sortOrder | int | Ordem de exibição |
| wbsNodeId | int FK→wbs_nodes | Nó do EAP associado |
| productivity | decimal(14,3) | Produtividade |

---

### 7. Production Front (Frente de Produção)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| code | string | Código |
| name | string | Nome |
| location | string | Localização |
| status | enum(ativa,inativa) | Status |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

**Exemplo:** "Alvenaria Bloco A", "Estrutura Pavimento 1"

---

### 8. Production Team (Equipe)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| name | string | Nome da equipe |
| trade | string | Ofício/trade (ex: "Pedreiro") |
| memberCount | int | Número de membros |
| active | int(0/1) | Ativa? |
| createdAt | Date | Criação |

**Exemplo:** "Equipe 01 — Pedreiros", "Equipe 02 — Marceneiros"

---

### 9. Production Unit (Unidade de Produção)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| code | string | Código |
| name | string | Nome |
| unitType | string | Tipo (ex: "Mão de obra", "Maquinário") |
| active | int(0/1) | Ativa? |
| sortOrder | int | Ordem de exibição |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

**Exemplo:** "Mão de obra", "Mistério", "Maquinário"

---

### 10. Production Entry (Lançamento de Produção)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| frontId | int FK→production_fronts | Frente |
| teamId | int FK→production_teams | Equipe |
| unitId | int FK→production_units | Unidade |
| activityId | int FK→schedule_activities | Atividade |
| productionDate | Date | Data do lançamento |
| quantity | decimal(14,3) | Quantidade produzida |
| measurementUnit | string | Unidade de medida |
| notes | string | Observações |
| status | enum(rascunho,confirmada) | Status |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

**Cálculo de progresso:**
```
progresso = sum(quantity) / plannedQuantity × 100
```

**Filtro de controle:** Apenas `status = "confirmada"` é usada em cálculos.

---

### 11. Planning Resource (Recurso de Planejamento)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| name | string | Nome |
| resourceType | enum(mao_de_obra,maquinario,material) | Tipo |
| unit | string | Unidade |
| capacityPerDay | decimal(14,3) | Capacidade por dia |
| costPerDay | decimal(14,2) | Custo por dia |
| active | int(0/1) | Ativo? |
| createdAt | Date | Criação |

---

### 12. Activity Resource Allocation (Alocação de Recursos)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| activityId | int FK→schedule_activities | Atividade |
| resourceId | int FK→planning_resources | Recurso |

---

### 13. Schedule Baseline (Baseline do Cronograma)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| name | string | Nome da baseline |
| status | enum(ativa,etc.) | Status |
| createdBy | int FK→users | Criado por |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

---

### 14. Schedule Baseline Item (Item de Baseline)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| baselineId | int FK→scheduleBaselines | Baseline |
| activityId | int FK→schedule_activities | Atividade |
| startOffset | int | Dias desde início |
| durationDays | int | Duração |
| earlyStart | int | ES |
| earlyFinish | int | EF |

---

### 15. Agent Decision (Decisão do Agente)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| userId | int FK→users | Usuário |
| code | string | Código da decisão |
| description | string | Descrição |
| contentType | string | Tipo de conteúdo |
| content | JSON | Conteúdo da decisão |
| confirmedAt | Date | Quando foi confirmada |
| createdAt | Date | Criação |

---

### 16. Agent Finding (Finding do Agente)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| type | enum | Tipo do finding |
| content | JSON | Conteúdo do finding |
| createdAt | Date | Criação |

---

### 17. Agent Memory (Memória do Agente)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| type | enum | Tipo da memória |
| content | JSON | Conteúdo da memória |
| createdBy | int FK→users | Criado por |
| createdAt | Date | Criação |

---

### 18. Project MCP Integration (Integração MCP)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| userId | int FK→users | Usuário |
| provider | enum(eap,cronograma,ganttLob) | Provedor MCP |
| toolName | string | Nome da ferramenta |
| externalProjectId | string | ID externo no MCP |
| idempotencyKey | string | Chave de idempotência |
| confirmationToken | string | Token de confirmação |
| argsJson | string | Argumentos JSON |
| resultJson | string | Resultado JSON |
| error | string | Erro (se houver) |
| status | enum(preview,confirmed,executing,succeeded,failed,cancelled) | Status |
| confirmedAt | Date | Quando foi confirmada |
| executedAt | Date | Quando foi executada |
| createdAt | Date | Criação |
| updatedAt | Date | Atualização |

---

### 19. Project Audit Event (Evento de Auditoria)

| Campo | Tipo | Finalidade |
|-------|------|------------|
| id | int PK | Identificador |
| projectId | int FK→projects | Obra |
| userId | int FK→users | Usuário |
| eventType | string | Tipo do evento |
| payload | JSON | Detalhes do evento |
| createdAt | Date | Data do evento |

---

## RELACIONAMENTOS IMPORTANTES

```
projects 1 ───< wbs_nodes (EAP)
projects 1 ───< schedule_activities (atividades)
schedule_activities 1 ───< schedule_dependencies (dependências)
schedule_activities N ───< activity_resource_allocations (alocações)
projects 1 ───< budget_versions
budget_versions 1 ───< budget_items
budget_items 1 ───< service_compositions
schedule_activities N ───< production_entries
production_fronts 1 ───< production_entries
production_teams 1 ───< production_entries
production_units 1 ───< production_entries
scheduleBaselines 1 ───< scheduleBaselineItems
projects 1 ───< agentDecisions
projects 1 ───< agentFindings
projects 1 ───< agentMemories
```

---

Versão: 1.0
Data: 2026-09
