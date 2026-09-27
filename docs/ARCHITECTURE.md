# ARCHITECTURE.md — Arquitetura do Sistema

## RESUMO

```
FRONTEND (React 18 + Vite + Wouter + Radix + Tailwind + Recharts)
    │
    └── tRPC Consume Procedures

BACKEND (Express + tRPC + Drizzle ORM)
    │
    ├── routers/
    │   ├── auth/
    │   ├── admin/
    │   ├── projects/
    │   ├── production/
    │   ├── budgets/
    │   ├── catalog/
    │   ├── planning/
    │   ├── agent/
    │   └── integrations/
    │
    ├── construction/
    │   ├── cpm-calculator.ts
    │   ├── eap-validator.ts
    │   ├── dependency-validator.ts
    │   ├── project-progress.ts
    │   └── ...
    │
    └── integrations/
        ├── construction-mcps.ts
        └── phase7-import.ts

Banco:
    MySQL 8 (Aiven)
    → 21+ tabelas via Drizzle
```

---

## COMPONENTES

### FRONTEND — client/

```
client/
├── src/
│   ├── App.tsx                    — Root, router
│   ├── components/
│   │   ├── Home.tsx               — Dashboard (1531 linhas)
│   │   ├── EapView.tsx            — EAP
│   │   ├── BudgetView.tsx         — Orçamento
│   │   ├── CatalogView.tsx        — Catálogo
│   │   ├── PlanningView.tsx       — Planejamento
│   │   ├── GanttView.tsx          — Gantt + LOB
│   │   ├── FrentesView.tsx        — Frentes
│   │   ├── ProductionView.tsx     — Produção
│   │   ├── MedicaoView.tsx        — Medição
│   │   ├── GraficosView.tsx       — Gráficos
│   │   ├── FormulasView.tsx       — Fórmulas
│   │   ├── AgentView.tsx          — Agente IA
│   │   └── ui/                    — Radix components
│   ├── contexts/
│   │   └── ThemeContext.tsx
│   ├── lib/
│   │   ├── trpc.ts                — tRPC client
│   │   └── api.ts                 — API utilities
│   └── nav-paths.ts               — Navigation paths
└── package.json                   — Dependencies
```

---

### BACKEND — server/

```
server/
├── _core/
│   ├── index.ts                   — Express + tRPC server
│   ├── env.ts                     — Environment config
│   ├── vite.ts                    — Vite dev integration
│   ├── cookies.ts                 — Cookie config
│   ├── context.ts                 — tRPC context
│   ├── systemRouter.ts            — System procedures
│   ├── heartbeat.ts               — Health check
│   ├── voiceTranscription.ts      — Audio transcription
│   ├── storageProxy.ts            — S3 proxy
│   └── notification.ts            — Notifications
│
├── construction/
│   ├── cpm-calculator.ts          — CPM engine
│   ├── dependency-validator.ts    — Dependency validation
│   ├── eap-validator.ts           — EAP validation
│   ├── evidence-router.ts         — Evidence API
│   ├── evidence-source.ts         — Evidence source
│   ├── local-database-source.ts   — Local DB source
│   ├── mcp-evidence-source.ts     — MCP evidence
│   ├── project-progress.ts        — Progress calculation
│   ├── plan-versions.ts           — Plan versions
│   ├── stage-gates.ts             — Stage gates
│   ├── finding-lifecycle.ts       — Finding lifecycle
│   └── domain-types.ts            — Domain types
│
├── integrations/
│   ├── construction-mcps.ts       — MCP client factory
│   ├── mcp-client.ts              — MCP client
│   └── phase7-import.ts           — Phase 7 import
│
├── agent/
│   └── context-builder.ts         — AI context builder
│
├── drizzle/
│   └── schema.ts                  — Database schema (21+ tabelas)
│
├── _shared/
│   ├── construction-stages.ts     — Coordinator stages
│   ├── cpm.ts                     — CPM engine (shared)
│   ├── const.ts                   — Constants
│   ├── types.ts                   — Shared types
│   └── price-sources/             — SEINFRA adapter
│
├── _core/mcp-servers/obras/       — Custom MCP servers
│   ├── mcp-cronograma/
│   ├── mcp-eap-server/
│   └── mcp-gantt-lob-server/
│
├── index.ts                       — Server entry point
├── routers.ts                     — tRPC router (4659 linhas)
├── db.ts                          — Drizzle connection
└── package.json                   — Dependencies
```

---

## ROUTERS — 9 SUB-ROUTERS

| Router | Linha em routers.ts | Responsabilidade |
|--------|---------------------|-------------------|
| `auth` | 931 | Login, logout, sessão, refresh token |
| `admin` | 939 | Configurações admin, LLM settings |
| `projects` | 966 | CRUD de obras, EAP, atividades, dependências, orçamento |
| `production` | 1442 | Frentes, equipes, unidades, lançamentos de produção |
| `budgets` | 1731 | Versões de orçamento, itens, composições |
| `catalog` | 2586 | Catálogo de preços SEINFRA |
| `planning` | 2938 | CPM, controle, baseline, recursos, scurve, leveling |
| `agent` | 3606 | Agente IA, contexto, decisões, findings |
| `integrations` | 4169 | MCP externo, phase 7 import |

**Total:** 4659 linhas em um único arquivo.

---

## BANCO DE DADOS — MySQL 8 (Aiven)

### TABELAS PRINCIPAIS

| Tabela | PK | FK | Descrição |
|--------|-----|-----|-----------|
| `users` | id | — | Usuários do sistema |
| `projects` | id | ownerUserId→users | Obras |
| `project_plan_versions` | id | projectId→projects | Versões do plano |
| `wbs_nodes` | id | projectId→projects, parentId→wbs_nodes, versionId→project_plan_versions | EAP (WBS) |
| `schedule_activities` | id | projectId→projects, wbsNodeId→wbs_nodes, budgetItemId→budget_items, versionId→project_plan_versions | Atividades do cronograma |
| `schedule_dependencies` | id | projectId→projects, predecessorId→schedule_activities, successorId→schedule_activities, versionId→project_plan_versions | Dependências |
| `planning_resources` | id | projectId→projects | Recursos de planejamento |
| `activity_resource_allocations` | id | projectId→projects, activityId→schedule_activities, resourceId→planning_resources | Alocação de recursos |
| `scheduleBaselines` | id | projectId→projects, createdBy→users | Baselines |
| `scheduleBaselineItems` | id | baselineId→scheduleBaselines, activityId→schedule_activities | Itens de baseline |
| `budget_versions` | id | projectId→projects | Versões de orçamento |
| `budget_items` | id | budgetVersionId→budget_versions, wbsNodeId→wbs_nodes | Itens de orçamento |
| `price_catalogs` | id | projectId→projects | Catálogos de preços |
| `price_items` | id | catalogId→price_catalogs | Itens de preço |
| `service_compositions` | id | budgetItemId→budget_items | Composições de serviço |
| `composition_components` | id | compositionId→service_compositions | Componentes de composição |
| `production_fronts` | id | projectId→projects | Frentes de produção |
| `production_teams` | id | projectId→projects | Equipes |
| `production_units` | id | projectId→projects | Unidades de produção |
| `production_entries` | id | projectId→projects, frontId→production_fronts, teamId→production_teams, unitId→production_units, activityId→schedule_activities | Lançamentos de produção |
| `agentDecisions` | id | projectId→projects, userId→users | Decisões do agente |
| `agentFindings` | id | projectId→projects | Findings do agente |
| `agentMemories` | id | projectId→projects | Memórias do agente |
| `projectMcpIntegrations` | id | projectId→projects | Integrações MCP |
| `mcpMutationOperations` | id | projectId→projects, userId→users | Operações MCP |
| `mcpHomologationRuns` | id | projectId→projects, userId→users | Execuções de homologação |
| `projectAuditEvents` | id | projectId→projects, userId→users | Eventos de auditoria |

---

## SERVIÇOS EXTERNOS

| Serviço | Finalidade | Status |
|---------|------------|--------|
| MCP Cronograma | Persistência de cronograma | ✅ Implementado |
| MCP EAP | Persistência de EAP | ✅ Implementado |
| MCP Gantt/LOB | Gantt e Linha de Balanço | ✅ Implementado |
| SEINFRA | Preços de serviços | ✅ Implementado |
| GitHub OAuth | Autenticação | ✅ Implementado |
| S3 (AWS) | Storage de arquivos | ✅ Implementado |

---

## DEPLOY

- **Frontend + Backend:** Vercel
- **Banco:** Aiven (MySQL 8)
- **MCP servers:** Rodam como processos paralelos no serverless

---

Versão: 1.0
Data: 2026-09
